/**
 * `assemble` step — turn the planned shot list into a `tour_assemblies` row
 * for the render worker to concat.
 */
import { type RunRow, type TourDb, asJson, saveStep, setRunStatus } from './shared';

export async function runAssemble(
  sb: TourDb,
  run: RunRow,
  _photoIds?: string[],
  _engine?: string,
  approve?: boolean,
) {
  // Final shot list is computed + persisted by the photos step (owner 2026-08-17).
  const photosStep = run.step_results.photos as
    | {
        resolved_poi_ids?: string[];
        shots?: unknown[];
        dropped?: unknown[];
        narration?: { voice?: string; segments?: unknown[] };
      }
    | undefined;
  const shots = photosStep?.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    return {
      error: 'no_shots',
      message: 'No final shot list yet — run the photos step first (it selects 2 per POI).',
    };
  }
  const dropped = photosStep?.dropped ?? [];
  const narration =
    photosStep?.narration && (photosStep.narration.segments?.length ?? 0) > 0
      ? photosStep.narration
      : null;

  // How many planned shots will be MISSING from the film.
  //
  // A shot is missing only when its photo has no ready clip AT ALL. The
  // planned engine not being rendered is not enough: the worker falls back —
  // seedance first, then the planned engine, then any ready row — so a photo
  // planned for Ken Burns still renders from the DepthFlow or Seedance clip it
  // already has (owner 2026-08-20: "do we have other render clips, we should
  // use what we have"; it already did).
  //
  // Counting exact photo+engine matches, which is what this first did, would
  // have warned about two Aberdeen shots that render perfectly well — one of
  // them from a Seedance clip already paid for.
  //
  // The warning still matters: the worker SKIPS a photo with nothing ready and
  // says so only in its own log, which is how a 29-clip tour shipped as 19 in
  // phase69.
  const planned = shots as Array<{ photo_id: string; engine: string }>;
  const photoIds = [...new Set(planned.map((sh) => sh.photo_id))];
  const { data: clipRows } = (await sb
    .from('photo_clips')
    .select('photo_id, status')
    .in('photo_id', photoIds)
    .eq('status', 'ready')) as { data: Array<{ photo_id: string }> | null };
  const haveSomething = new Set((clipRows ?? []).map((c) => c.photo_id));
  const notReady = planned.filter((sh) => !haveSomething.has(sh.photo_id)).length;

  if (approve) {
    const { error: insErr } = await sb.from('tour_assemblies').insert({
      community_id: run.community_id,
      run_id: run.id,
      status: 'pending',
      ordered_clips: asJson(shots),
      photos_dropped: asJson(dropped),
      // Carried, not recomputed: the script belongs to the cut it was written
      // against, and `shots` above is that same cut.
      narration: narration ? asJson(narration) : null,
    });
    if (insErr) return { error: 'insert_failed', message: (insErr as { message: string }).message };
    await setRunStatus(sb, run.id, 'assembled');
    await saveStep(sb, run, 'assemble', { approved: true, ordered: shots, dropped, notReady });
    return {
      approved: true,
      ordered: shots,
      dropped,
      notReady,
      narrated: narration?.segments?.length ?? 0,
    };
  }

  await saveStep(sb, run, 'assemble', { approved: false, ordered: shots, dropped, notReady });
  return { approved: false, ordered: shots, dropped, notReady };
}

// ─── dispatcher ─────────────────────────────────────────────────────────────
