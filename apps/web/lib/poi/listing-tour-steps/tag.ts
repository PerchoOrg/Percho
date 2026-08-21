/**
 * `tag` step — hand the listing's untagged photos to the render worker.
 *
 * The tagger is `scripts/render-worker/photo_tagger.py` (Claude vision) and it
 * stays in Python by owner decision (2026-08-20). So this step queues a job
 * and returns; the worker writes `step_results.tag` when it is done and the
 * chip reads the artefact — `listing_photos.tagged_at` — not this response.
 *
 * Tagging is already idempotent on the worker side: a photo with
 * `tagged_at IS NOT NULL` is skipped and not re-billed. Re-running the step on
 * a listing whose photos are all tagged therefore costs nothing.
 */
import {
  type ListingRunRow,
  type TourDb,
  enqueueWorkerStep,
  saveListingStep,
  setListingRunStatus,
} from './shared';

export async function runTag(sb: TourDb, run: ListingRunRow) {
  const { data: photos } = (await sb
    .from('listing_photos')
    .select('id, tagged_at')
    .eq('listing_id', run.listing_id)) as {
    data: Array<{ id: string; tagged_at: string | null }> | null;
  };

  const total = photos?.length ?? 0;
  if (total === 0) {
    return { error: 'no_photos', message: 'This listing has no photos to tag.' };
  }
  const untagged = (photos ?? []).filter((p) => !p.tagged_at).length;

  const { jobId, alreadyQueued } = await enqueueWorkerStep(sb, run, 'tag');
  await setListingRunStatus(sb, run.id, 'tagging');
  // Written now so the chip has something to show while the worker runs. The
  // worker overwrites this key with its own result — including `tagged` — when
  // it finishes; until then `queued` is the honest state.
  await saveListingStep(sb, run, 'tag', { queued: true, job_id: jobId, total, untagged });

  return { queued: true, job_id: jobId, alreadyQueued, total, untagged };
}
