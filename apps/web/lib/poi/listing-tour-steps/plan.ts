/**
 * `plan` step — hand the shot list to the render worker.
 *
 * `photo_selector.build_plan` is Python and stays there (owner 2026-08-20), so
 * like `tag` this queues a job rather than computing inline.
 *
 * The point of plan being its own step is that it renders NOTHING and spends
 * NOTHING. Before this, the first sight of which photos a home tour would use,
 * in what order and for how long, was the finished film two to four minutes
 * later. Now the shot list lands in `step_results.plan` and the table's Plan
 * column shows it while every clip is still un-rendered.
 *
 * The review gate sits immediately before this: the worker's plan reads only
 * photos that are not `review_status = 'rejected'`.
 */
import {
  type ListingRunRow,
  type TourDb,
  enqueueWorkerStep,
  saveListingStep,
  setListingRunStatus,
} from './shared';

export async function runPlan(sb: TourDb, run: ListingRunRow) {
  const { data: photos } = (await sb
    .from('listing_photos')
    .select('id, tagged_at, review_status')
    .eq('listing_id', run.listing_id)) as {
    data: Array<{ id: string; tagged_at: string | null; review_status: string }> | null;
  };

  const eligible = (photos ?? []).filter((p) => p.review_status !== 'rejected');
  if (eligible.length === 0) {
    return {
      error: 'no_photos',
      message: 'Every photo on this listing is rejected — nothing left to plan.',
    };
  }
  // Not an error: the worker tags on demand. But planning over untagged photos
  // produces a plan built on defaults, and saying so is cheaper than
  // explaining the resulting shot list afterwards.
  const untagged = eligible.filter((p) => !p.tagged_at).length;

  const { jobId, alreadyQueued } = await enqueueWorkerStep(sb, run, 'plan');
  await setListingRunStatus(sb, run.id, 'planning');
  await saveListingStep(sb, run, 'plan', {
    queued: true,
    job_id: jobId,
    eligible: eligible.length,
    rejected: (photos?.length ?? 0) - eligible.length,
    untagged,
  });

  return {
    queued: true,
    job_id: jobId,
    alreadyQueued,
    eligible: eligible.length,
    untagged,
  };
}
