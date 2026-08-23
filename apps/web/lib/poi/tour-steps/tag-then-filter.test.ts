/**
 * Tagging and filtering are one step, and the seam between them is where the
 * bugs live.
 *
 * Two of them, both real:
 *  - `tagPoiPhoto` stamps `tagged_at` only on success, so a photo with a dead
 *    storage path is untagged for ever. Gating the filter on "everything
 *    succeeded" would jam the review shut permanently.
 *  - `saveStep` writes `{ ...run.step_results, [step]: … }` from the snapshot
 *    it was handed, so saving `tag` through the pre-filter snapshot erases the
 *    `filter` key that was just written.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const tagPoiPhoto = vi.fn();
vi.mock('@/lib/poi/vision-tagger', () => ({ tagPoiPhoto }));

const tourPoiIds = vi.fn();
vi.mock('../tour-poi-set', () => ({ tourPoiIds }));

const runFilter = vi.fn();
vi.mock('./filter', () => ({ runFilter }));

const saveStep = vi.fn();
const setRunStatus = vi.fn();
const getRun = vi.fn();
vi.mock('./shared', () => ({ saveStep, setRunStatus, getRun }));

const { runTag } = await import('./tag');

/** `sb` only has to answer the untagged-photo query. */
function fakeSb(photoIds: string[]) {
  const from = vi.fn().mockImplementation(() => ({
    select: () => ({
      in: () => ({
        neq: () => ({ is: async () => ({ data: photoIds.map((id) => ({ id })) }) }),
      }),
    }),
  }));
  // biome-ignore lint/suspicious/noExplicitAny: a stub, not a Supabase client.
  return { from } as any;
}

const run = { id: 'run-1', community_id: 'c1', status: 'tagging', step_results: {} } as never;

beforeEach(() => {
  vi.clearAllMocks();
  tourPoiIds.mockResolvedValue(new Set(['poi-1']));
  getRun.mockResolvedValue({ ...(run as object), step_results: { filter: { phase: 'review' } } });
  runFilter.mockResolvedValue({ ok: true, judged: 10, rejected: 3, kept: 7, awaitingReview: true });
  tagPoiPhoto.mockResolvedValue({ ok: true });
});

describe('runTag → runFilter', () => {
  it('filters once every photo has been tagged, and opens the gate', async () => {
    const res = await runTag(fakeSb(['a', 'b', 'c']), run);
    expect(tagPoiPhoto).toHaveBeenCalledTimes(3);
    expect(runFilter).toHaveBeenCalledWith(expect.anything(), run, { untaggedIsFatal: false });
    expect(res).toMatchObject({ ok: true, tagged: 3, rejected: 3, kept: 7, awaitingReview: true });
    expect(saveStep).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      'tag',
      expect.objectContaining({ phase: 'done', rejected: 3, kept: 7 }),
    );
  });

  it('filters anyway when a photo could not be described', async () => {
    // THE JAM. `tagged_at` is never stamped for these, so waiting for them to
    // succeed means waiting for ever.
    tagPoiPhoto.mockImplementation(async (id: string) =>
      id === 'b' ? { ok: false, error: 'download_failed' } : { ok: true },
    );
    const res = await runTag(fakeSb(['a', 'b', 'c']), run);
    expect(runFilter).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ ok: true, tagged: 2, failed: 1, awaitingReview: true });
    expect((res as { message?: string }).message).toMatch(/could not be described/);
  });

  it('saves `tag` through a RE-READ run, so filter’s own result survives', async () => {
    await runTag(fakeSb(['a']), run);
    const savedWith = saveStep.mock.calls.at(-1)?.[1] as { step_results: Record<string, unknown> };
    // The snapshot `runTag` was handed has no `filter` key; the re-read does.
    expect(savedWith.step_results).toHaveProperty('filter');
  });

  it('does NOT filter when the clock cut the loop short', async () => {
    // One photo tagged, then the budget expires with two never attempted.
    let now = 0;
    // Restored on THIS spy only — `vi.restoreAllMocks()` would also wipe the
    // recorded calls the assertions below read.
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 200_000;
      return now;
    });
    const res = await runTag(fakeSb(['a', 'b', 'c']), run);
    nowSpy.mockRestore();
    expect(runFilter).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, unreached: expect.any(Number) });
    expect((res as { unreached: number }).unreached).toBeGreaterThan(0);
    expect(saveStep).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      'tag',
      expect.objectContaining({ phase: 'partial', stopped_on: 'time_budget' }),
    );
  });

  it('refuses when the tour has no POIs at all', async () => {
    tourPoiIds.mockResolvedValue(new Set());
    expect(await runTag(fakeSb([]), run)).toMatchObject({ error: 'no_pois' });
    expect(runFilter).not.toHaveBeenCalled();
  });

  it('reports a filter failure as the step’s failure', async () => {
    runFilter.mockResolvedValue({ error: 'no_pois', message: 'Nothing to filter.' });
    const res = await runTag(fakeSb(['a']), run);
    expect(res).toMatchObject({ error: 'no_pois' });
    expect(saveStep).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      'tag',
      expect.objectContaining({ phase: 'failed', error: 'no_pois' }),
    );
  });
});
