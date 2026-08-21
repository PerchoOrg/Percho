/**
 * `assemble` step — turn the planned shot list into a `listing_tour_assemblies`
 * row for the render worker to concat.
 *
 * One row per surface. iOS and web are the same cut on different canvases:
 * they render from different clips, finish at different times and fail
 * independently, so a single row with two uids would report one of them wrong.
 */
import {
  type ListingRunRow,
  type Surface,
  type TourDb,
  asJson,
  plannedShots,
  saveListingStep,
  setListingRunStatus,
} from './shared';

interface ReadyClip {
  listing_photo_id: string;
  engine: string;
}

export async function runAssemble(
  sb: TourDb,
  run: ListingRunRow,
  _photoIds?: string[],
  _engine?: string,
  approve?: boolean,
  surface: Surface = 'ios',
) {
  const shots = plannedShots(run);
  if (shots.length === 0) {
    return { error: 'no_shots', message: 'No shot list yet — run Plan first.' };
  }

  // How many planned shots will be MISSING from the film.
  //
  // A shot is missing only when its photo has no ready clip on this surface AT
  // ALL — not when the planned engine specifically is unrendered. The worker
  // falls back to whatever ready clip the photo has, so a shot planned for
  // DepthFlow still renders from an existing Ken Burns clip. Counting exact
  // engine matches would warn about shots that render perfectly well.
  //
  // The warning still matters: the worker SKIPS a photo with nothing ready and
  // says so only in its own log.
  const photoIds = [...new Set(shots.map((s) => s.photo_id))];
  const { data: clipRows } = (await sb
    .from('listing_photo_clips')
    .select('listing_photo_id, engine')
    .in('listing_photo_id', photoIds)
    .eq('surface', surface)
    .eq('status', 'ready')) as { data: ReadyClip[] | null };
  const haveSomething = new Set((clipRows ?? []).map((c) => c.listing_photo_id));
  const notReady = shots.filter((s) => !haveSomething.has(s.photo_id)).length;

  // A surface with NOTHING rendered is not a film with gaps — it is a film
  // that does not exist. Staging it anyway queues a worker job that can only
  // raise "need >=2 ready clips, got 0", which is what happened the first time
  // Assemble ran for both canvases over an iOS-only clip library (owner
  // 2026-08-21). Refuse here, where the message can name the surface and say
  // what to do, instead of failing the run from inside the worker.
  if (haveSomething.size === 0) {
    return {
      error: 'nothing_rendered',
      surface,
      message: `No ${surface} clips are rendered yet — run Render, which does both canvases.`,
    };
  }

  const ordered = shots.map((s) => ({
    photo_id: s.photo_id,
    sort_order: s.sort_order,
    duration_s: s.duration_s,
    engine: s.surfaces[surface]?.engine ?? 'kenburns',
  }));

  if (!approve) {
    await saveListingStep(sb, run, 'assemble', { approved: false, surface, ordered, notReady });
    return { approved: false, surface, ordered, notReady };
  }

  const { error: insErr } = await sb.from('listing_tour_assemblies').insert({
    listing_id: run.listing_id,
    run_id: run.id,
    surface,
    status: 'pending',
    ordered_clips: asJson(ordered),
    photos_dropped: asJson(
      (run.step_results.plan as { dropped?: unknown[] } | undefined)?.dropped ?? [],
    ),
  });
  if (insErr) {
    return { error: 'insert_failed', message: (insErr as { message: string }).message };
  }

  await setListingRunStatus(sb, run.id, 'assembling');
  await saveListingStep(sb, run, 'assemble', { approved: true, surface, ordered, notReady });
  return { approved: true, surface, ordered, notReady };
}

/**
 * Stage or approve an assembly for BOTH surfaces.
 *
 * Each is its own row and its own worker job — they finish at different times
 * and fail independently — but one click asks for the film, not for a cut.
 */
export async function runAssembleAllSurfaces(sb: TourDb, run: ListingRunRow, approve?: boolean) {
  const surfaces: Record<string, unknown> = {};
  let notReady = 0;
  for (const surface of ['ios', 'web'] as const) {
    const r = (await runAssemble(sb, run, undefined, undefined, approve, surface)) as {
      error?: string;
      message?: string;
      notReady?: number;
    };
    if (r.error) return r;
    surfaces[surface] = r;
    notReady += r.notReady ?? 0;
  }
  return { surfaces, notReady, approved: !!approve };
}
