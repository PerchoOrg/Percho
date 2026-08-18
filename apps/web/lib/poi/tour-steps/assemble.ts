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
    | { resolved_poi_ids?: string[]; shots?: unknown[]; dropped?: unknown[] }
    | undefined;
  const shots = photosStep?.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    return {
      error: 'no_shots',
      message: 'No final shot list yet — run the photos step first (it selects 2 per POI).',
    };
  }
  const dropped = photosStep?.dropped ?? [];

  if (approve) {
    const { error: insErr } = await sb.from('tour_assemblies').insert({
      community_id: run.community_id,
      run_id: run.id,
      status: 'pending',
      ordered_clips: asJson(shots),
      photos_dropped: asJson(dropped),
    });
    if (insErr) return { error: 'insert_failed', message: (insErr as { message: string }).message };
    await setRunStatus(sb, run.id, 'assembled');
    await saveStep(sb, run, 'assemble', { approved: true, ordered: shots, dropped });
    return { approved: true, ordered: shots, dropped };
  }

  await saveStep(sb, run, 'assemble', { approved: false, ordered: shots, dropped });
  return { approved: false, ordered: shots, dropped };
}

// ─── dispatcher ─────────────────────────────────────────────────────────────
