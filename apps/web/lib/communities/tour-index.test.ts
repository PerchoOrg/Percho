import { describe, expect, it } from 'vitest';
import { foldTourActivity, sortByLastActivity } from './tour-index';

const C = '11111111-1111-1111-1111-111111111111';
const D = '22222222-2222-2222-2222-222222222222';

describe('foldTourActivity', () => {
  it('takes the stage from the newest run, whatever order rows arrive in', () => {
    const m = foldTourActivity({
      runs: [
        { community_id: C, status: 'assembled', updated_at: '2026-08-19T06:34:53.550+00:00' },
        { community_id: C, status: 'review', updated_at: '2026-08-21T21:21:44.226+00:00' },
        { community_id: C, status: 'failed', updated_at: '2026-08-20T07:20:32.224+00:00' },
      ],
      assemblies: [],
      pois: [],
    });
    expect(m.get(C)?.stage).toBe('review');
    expect(m.get(C)?.runCount).toBe(3);
  });

  it('compares timestamps as instants, not strings', () => {
    // Runs stamp 3 fractional digits, assemblies 6. Lexicographically
    // '…03.248644+00:00' > '…03.4+00:00', which is the wrong instant.
    const m = foldTourActivity({
      runs: [
        { community_id: C, status: 'old', updated_at: '2026-08-21T07:53:03.248644+00:00' },
        { community_id: C, status: 'new', updated_at: '2026-08-21T07:53:03.4+00:00' },
      ],
      assemblies: [],
      pois: [],
    });
    expect(m.get(C)?.stage).toBe('new');
    expect(m.get(C)?.lastActivityAt).toBe('2026-08-21T07:53:03.4+00:00');
  });

  it('counts ready and failed assemblies, ignoring in-flight ones', () => {
    const m = foldTourActivity({
      runs: [],
      assemblies: [
        { community_id: C, status: 'ready', updated_at: '2026-08-21T07:53:03.248644+00:00' },
        { community_id: C, status: 'ready', updated_at: '2026-08-21T07:30:20.890963+00:00' },
        { community_id: C, status: 'failed', updated_at: '2026-08-20T07:30:20.890963+00:00' },
        { community_id: C, status: 'processing', updated_at: '2026-08-22T07:30:20.890963+00:00' },
      ],
      pois: [],
    });
    expect(m.get(C)?.videosReady).toBe(2);
    expect(m.get(C)?.videosFailed).toBe(1);
    // …but a processing assembly is still activity.
    expect(m.get(C)?.lastActivityAt).toBe('2026-08-22T07:30:20.890963+00:00');
  });

  it('splits POIs into approved and total, per community', () => {
    const m = foldTourActivity({
      runs: [],
      assemblies: [],
      pois: [
        { community_id: C, status: 'approved' },
        { community_id: C, status: 'candidate' },
        { community_id: C, status: 'candidate' },
        { community_id: D, status: 'approved' },
      ],
    });
    expect(m.get(C)).toMatchObject({ poiCount: 3, poiApproved: 1 });
    expect(m.get(D)).toMatchObject({ poiCount: 1, poiApproved: 1 });
  });

  it('takes last activity from whichever table is newer', () => {
    const m = foldTourActivity({
      runs: [{ community_id: C, status: 'assembled', updated_at: '2026-08-19T06:00:00+00:00' }],
      assemblies: [{ community_id: C, status: 'ready', updated_at: '2026-08-21T07:00:00+00:00' }],
      pois: [],
    });
    expect(m.get(C)?.lastActivityAt).toBe('2026-08-21T07:00:00+00:00');
  });

  it('leaves communities with no tour rows out of the map entirely', () => {
    const m = foldTourActivity({ runs: [], assemblies: [], pois: [] });
    expect(m.size).toBe(0);
  });
});

describe('sortByLastActivity', () => {
  it('puts the newest first and nulls last', () => {
    const rows = [
      { id: 'a', lastActivityAt: '2026-08-19T06:00:00+00:00' },
      { id: 'b', lastActivityAt: null },
      { id: 'c', lastActivityAt: '2026-08-21T07:00:00+00:00' },
    ];
    expect(sortByLastActivity(rows).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate its input', () => {
    const rows = [
      { lastActivityAt: '2026-08-19T06:00:00+00:00' },
      { lastActivityAt: '2026-08-21T07:00:00+00:00' },
    ];
    sortByLastActivity(rows);
    expect(rows[0]?.lastActivityAt).toBe('2026-08-19T06:00:00+00:00');
  });
});
