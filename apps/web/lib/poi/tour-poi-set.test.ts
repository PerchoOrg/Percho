/**
 * The tour's POI set — the one answer to "which POIs may fetch and tag touch".
 *
 * Real bug this guards: the tag step used to fall back to "every untagged
 * photo in any community" when a run carried no saved scope, which is the
 * state a run is left in when the photos step dies (owner 2026-08-23). An
 * empty set has to stay empty here so the caller can refuse to run.
 */

import { describe, expect, it, vi } from 'vitest';
import { tourPoiIds, tourPoiSet } from './tour-poi-set';

function fakeSb(opts: {
  pois?: Array<{ id: string; google_place_id?: string }>;
  approved?: Array<{ poi_id: string }>;
}) {
  const poisIn = vi.fn().mockResolvedValue({ data: opts.pois ?? [] });
  const approvedEq2 = vi.fn().mockResolvedValue({ data: opts.approved ?? [] });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'pois') return { select: () => ({ in: poisIn }) };
    if (table === 'community_pois') {
      return { select: () => ({ eq: () => ({ eq: approvedEq2 }) }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { sb: { from }, poisIn };
}

const CID = 'community-1';

describe('tourPoiIds', () => {
  it("unions the run's resolved POIs with the links a person approved", async () => {
    const { sb } = fakeSb({
      pois: [{ id: 'p-resolved-1' }, { id: 'p-resolved-2' }],
      approved: [{ poi_id: 'p-amenity' }],
    });
    const ids = await tourPoiIds(sb, CID, [{ place_id: 'g1' }, { place_id: 'g2' }]);
    expect([...ids].sort()).toEqual(['p-amenity', 'p-resolved-1', 'p-resolved-2']);
  });

  it('dedupes a POI that is both resolved and approved', async () => {
    const { sb } = fakeSb({ pois: [{ id: 'p1' }], approved: [{ poi_id: 'p1' }] });
    expect([...(await tourPoiIds(sb, CID, [{ place_id: 'g1' }]))]).toEqual(['p1']);
  });

  it('looks up only the place_ids it actually has', async () => {
    const { sb, poisIn } = fakeSb({ pois: [{ id: 'p1' }] });
    await tourPoiIds(sb, CID, [{ place_id: 'g1' }, {}, { place_id: undefined }]);
    expect(poisIn).toHaveBeenCalledWith('google_place_id', ['g1']);
  });

  it('skips the pois query entirely when nothing resolved', async () => {
    const { sb, poisIn } = fakeSb({ approved: [{ poi_id: 'p-amenity' }] });
    expect([...(await tourPoiIds(sb, CID, []))]).toEqual(['p-amenity']);
    expect([...(await tourPoiIds(sb, CID, undefined))]).toEqual(['p-amenity']);
    expect(poisIn).not.toHaveBeenCalled();
  });

  it('returns an empty set rather than anything global', async () => {
    const { sb } = fakeSb({});
    expect((await tourPoiIds(sb, CID, [])).size).toBe(0);
  });
});

describe('tourPoiSet scores', () => {
  it("carries resolve's own score across to the poi id", async () => {
    const { sb } = fakeSb({
      pois: [
        { id: 'p1', google_place_id: 'g1' },
        { id: 'p2', google_place_id: 'g2' },
      ],
    });
    const { scoreByPoiId } = await tourPoiSet(sb, CID, [
      { place_id: 'g1', score: 0.9 },
      { place_id: 'g2', score: 0.4 },
    ]);
    expect(scoreByPoiId.get('p1')).toBe(0.9);
    expect(scoreByPoiId.get('p2')).toBe(0.4);
  });

  it('leaves a POI unscored rather than scoring it zero', async () => {
    // The distinction matters: `selectSurroundingPois` ranks on the number it
    // is given, and a link a person approved has no resolve score at all.
    const { sb } = fakeSb({
      pois: [{ id: 'p1', google_place_id: 'g1' }],
      approved: [{ poi_id: 'p-amenity' }],
    });
    const { ids, scoreByPoiId } = await tourPoiSet(sb, CID, [{ place_id: 'g1' }]);
    expect(ids.has('p-amenity')).toBe(true);
    expect(scoreByPoiId.has('p1')).toBe(false);
    expect(scoreByPoiId.has('p-amenity')).toBe(false);
  });
});
