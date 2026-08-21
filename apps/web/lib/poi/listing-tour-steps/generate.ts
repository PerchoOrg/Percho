/**
 * `generate` step — enqueue photo->clip jobs in `listing_photo_clips`.
 *
 * The home tour's render unit is now a photo, not a film (owner 2026-08-20:
 * "lets follow the same pattern, so we can more control on the single photos").
 * This step is a pure database write: it turns the plan's shot list into one
 * pending clip row per shot, and the render worker picks them up.
 *
 * Only `surface = 'ios'` is enqueued by default. Both surfaces are planned —
 * the engine split is canvas-dependent and computing it for web costs nothing —
 * but iOS is the primary surface (owner 2026-08-20: "start with ios since it is
 * more important") and rendering both doubles the worker's time.
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
