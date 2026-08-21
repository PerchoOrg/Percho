/**
 * `generate` step — enqueue photo->clip jobs in `listing_photo_clips`.
 *
 * The home tour's render unit is now a photo, not a film (owner 2026-08-20:
 * "lets follow the same pattern, so we can more control on the single photos").
 * This step is a pure database write: it turns the plan's shot list into one
 * pending clip row per shot, and the render worker picks them up.
 *
 * BOTH surfaces are enqueued (owner 2026-08-21: "hook up the web 16:9 clips").
 * iOS was the only one for a day, while the pipeline was unproven; it has since
 * produced a film end to end, so the second canvas is no longer a risk being
 * deferred. They are separate rows keyed by surface and they render, fail and
 * finish independently.
 *
 * The paid engine is NOT doubled by that. The plan assigns Seedance to the iOS
 * hero only, so the web cut's opening shot renders locally — one bill per tour,
 * not two.
 */
import {
  type ListingRunRow,
  type ListingShot,
  SURFACE_CANVAS,
  type Surface,
  type TourDb,
  mustWrite,
  plannedShots,
  saveListingStep,
  setListingRunStatus,
} from './shared';

export type ClipEngine = 'kenburns' | 'depthflow' | 'seedance';

const ENGINES: ClipEngine[] = ['kenburns', 'depthflow', 'seedance'];

function isEngine(v: string | undefined): v is ClipEngine {
  return !!v && (ENGINES as string[]).includes(v);
}

/** What a clip's pixels depend on. Change any of these and the file is wrong. */
export interface RenderInputs {
  surface: Surface;
  engine: string;
  move: string | null;
  duration_s: number;
  /** The photo's newest derived-file stamp; '' when it has none. */
  photoVersion: string;
}

/**
 * A clip's render inputs as one comparable string.
 *
 * Same mechanism as `tour-steps/generate.ts`, and it exists for the same
 * reason: on 2026-08-19 three plan-only changes each shipped undetected on the
 * community tour because staleness was judged by comparing timestamps, which
 * can only see edits to the PHOTO. The canvas is in the key explicitly — the
 * home tour's iOS canvas moves from 1080x1080 to 1080x1576 in this very phase,
 * and every clip rendered before that is wrong in a way no timestamp shows.
 */
export function renderKey(i: RenderInputs): string {
  const c = SURFACE_CANVAS[i.surface];
  return [
    `s=${i.surface}`,
    `c=${c.w}x${c.h}`,
    `e=${i.engine}`,
    `m=${i.move ?? '-'}`,
    `d=${i.duration_s.toFixed(2)}`,
    `p=${i.photoVersion || '-'}`,
  ].join('|');
}

/**
 * Photo id -> its version stamp, for the render key.
 *
 * Only an APPROVED enhancement counts: that is the file the render reads
 * (`enhanced_status = 'approved'`, see the enhancement migration). Listing
 * photos have no outpaint pipeline, so unlike the POI side there is one stamp
 * to consider, not two.
 */
async function photoVersions(sb: TourDb, photoIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (photoIds.length === 0) return out;
  const { data } = (await sb
    .from('listing_photos')
    .select('id, enhanced_at, enhanced_status')
    .in('id', photoIds)) as {
    data: Array<{ id: string; enhanced_at: string | null; enhanced_status: string | null }> | null;
  };
  for (const p of data ?? []) {
    if (p.enhanced_status === 'approved' && p.enhanced_at) out.set(p.id, p.enhanced_at);
  }
  return out;
}

interface ClipRow {
  id: string;
  listing_photo_id: string;
  engine: string;
  surface: string;
  status: string;
  render_key: string | null;
}

/**
 * Write one clip row per shot, skipping the ones already rendered from the
 * same inputs.
 *
 * `force` is the per-row Regenerate button: it re-renders even a ready clip,
 * and it is the ONLY path that may re-run Seedance. Owner 2026-08-19, on the
 * community tour and equally true here: "for photos with seedance clips, never
 * call it again!!!! always re-use, unless I clicked regenerate manually."
 * Seedance is the only engine that bills, so the exemption lives here rather
 * than in the callers.
 */
async function enqueueClips(
  sb: TourDb,
  run: ListingRunRow,
  shots: Array<{
    photo_id: string;
    engine: ClipEngine;
    move: string | null;
    duration_s: number;
    prompt: string | null;
    ai_generated: boolean;
  }>,
  surface: Surface,
  force = false,
) {
  if (shots.length === 0) {
    return { error: 'no_shots', message: 'Nothing to render — run Plan first.' };
  }
  const photoIds = [...new Set(shots.map((s) => s.photo_id))];
  const versions = await photoVersions(sb, photoIds);

  const { data: existing } = (await sb
    .from('listing_photo_clips')
    .select('id, listing_photo_id, engine, surface, status, render_key')
    .in('listing_photo_id', photoIds)
    .eq('surface', surface)) as { data: ClipRow[] | null };
  const byKey = new Map((existing ?? []).map((c) => [`${c.listing_photo_id}:${c.engine}`, c]));

  let queued = 0;
  let requeued = 0;
  let reused = 0;
  const skipped: Array<{ photo_id: string; reason: string }> = [];

  for (const s of shots) {
    const key = renderKey({
      surface,
      engine: s.engine,
      move: s.move,
      duration_s: s.duration_s,
      photoVersion: versions.get(s.photo_id) ?? '',
    });
    const row = byKey.get(`${s.photo_id}:${s.engine}`);
    const payload = {
      listing_photo_id: s.photo_id,
      surface,
      engine: s.engine,
      move: s.move,
      duration_s: s.duration_s,
      prompt: s.prompt,
      ai_generated: s.ai_generated,
      render_key: key,
      status: 'pending' as const,
      error: null,
    };

    if (!row) {
      await mustWrite('insert clip', sb.from('listing_photo_clips').insert(payload));
      queued += 1;
      continue;
    }

    const stale = row.render_key !== key;
    const dead = row.status === 'failed';
    // A paid clip is never re-rendered by a rule. Only the button.
    const paidAndAutomatic = s.engine === 'seedance' && !force;

    // A hand-rejected clip stays rejected. Since the plan now assigns Seedance
    // to the hero by default, without this the reject button would be undone
    // by the next Render — and re-billed (owner 2026-08-21: "unless we
    // manually reject it"). Only the per-row Regenerate clears it.
    if (row.status === 'rejected' && !force) {
      skipped.push({ photo_id: s.photo_id, reason: 'clip was rejected — regenerate by hand' });
      continue;
    }

    if (!force && !dead && !stale) {
      reused += 1;
      continue;
    }
    if (paidAndAutomatic && !dead) {
      reused += 1;
      skipped.push({ photo_id: s.photo_id, reason: 'seedance clip reused — regenerate by hand' });
      continue;
    }
    await mustWrite(
      'requeue clip',
      sb.from('listing_photo_clips').update(payload).eq('id', row.id),
    );
    requeued += 1;
  }

  await setListingRunStatus(sb, run.id, 'generating');
  const result = { surface, queued, requeued, reused, shots: shots.length, skipped };
  await saveListingStep(sb, run, 'generate', result);
  return result;
}

/**
 * Bulk: enqueue every planned shot for one surface.
 *
 * Single photo: `photoIds` + optional `engine`, from the table's per-row
 * buttons. A photo outside the plan can still be rendered — the table lists
 * every photo on the listing, the plan only covers the cut — but with no
 * planned duration it falls back to the tour's normal beat.
 */
export async function runGenerate(
  sb: TourDb,
  run: ListingRunRow,
  photoIds?: string[],
  engine?: string,
  surface: Surface = 'ios',
) {
  const planned = plannedShots(run);

  if (photoIds && photoIds.length > 0) {
    const forced = isEngine(engine) ? engine : null;
    const byId = new Map(planned.map((s) => [s.photo_id, s]));
    const shots = photoIds.map((id) => {
      const shot = byId.get(id);
      const planClip = shot?.surfaces[surface];
      const chosen: ClipEngine = forced ?? planClip?.engine ?? 'kenburns';
      return {
        photo_id: id,
        engine: chosen,
        // The plan's move belongs to the engine that chose it; an override
        // drops it and lets the worker pick its own conservative default.
        move: forced && forced !== planClip?.engine ? null : (planClip?.move ?? null),
        duration_s: shot?.duration_s ?? 3.0,
        prompt: chosen === 'seedance' ? (planClip?.prompt ?? null) : null,
        ai_generated: chosen === 'seedance',
      };
    });
    // Per-row click: re-render even a ready clip, Seedance included.
    return enqueueClips(sb, run, shots, surface, true);
  }

  if (planned.length === 0) {
    return { error: 'no_plan', message: 'No shot list yet — run Plan first.' };
  }
  return enqueueClips(sb, run, plannedForSurface(planned, surface), surface);
}

/**
 * Enqueue every planned shot on every surface.
 *
 * The Render chip calls this rather than `runGenerate` per surface: a home tour
 * ships two cuts and asking the operator to press Render twice was the shape of
 * the iOS-only phase, not of the product.
 */
export async function runGenerateAllSurfaces(sb: TourDb, run: ListingRunRow) {
  const results: Record<string, unknown> = {};
  let queued = 0;
  let requeued = 0;
  let reused = 0;
  for (const surface of ['ios', 'web'] as const) {
    const r = (await runGenerate(sb, run, undefined, undefined, surface)) as {
      queued?: number;
      requeued?: number;
      reused?: number;
      error?: string;
      message?: string;
    };
    // A surface that cannot be planned is a real failure and must not be
    // hidden by the other one succeeding.
    if (r.error) return r;
    results[surface] = r;
    queued += r.queued ?? 0;
    requeued += r.requeued ?? 0;
    reused += r.reused ?? 0;
  }
  await saveListingStep(sb, run, 'generate', { surfaces: results, queued, requeued, reused });
  return { surfaces: results, queued, requeued, reused };
}

/** The plan's shots as clip payloads for one surface. */
function plannedForSurface(shots: ListingShot[], surface: Surface) {
  const out: Array<{
    photo_id: string;
    engine: ClipEngine;
    move: string | null;
    duration_s: number;
    prompt: string | null;
    ai_generated: boolean;
  }> = [];
  for (const s of shots) {
    const clip = s.surfaces[surface];
    if (!clip) continue;
    out.push({
      photo_id: s.photo_id,
      engine: clip.engine,
      move: clip.move,
      duration_s: s.duration_s,
      prompt: clip.prompt,
      ai_generated: clip.ai_generated,
    });
  }
  return out;
}
