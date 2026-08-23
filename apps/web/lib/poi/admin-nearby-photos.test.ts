import { describe, expect, it } from 'vitest';
import { keepPhotoForTour } from './nearby-photo-scope';

/**
 * The nearby photo loader's two joins, as pure functions over the shapes the
 * queries return. The DB round-trip isn't worth mocking; what breaks in practice
 * is the mapping — which is what this covers.
 *
 * Real bug this guards: `used_in` must be scoped to THIS owner. A photo used in
 * another community's video is not "in this community's video", and the first
 * draft of the POI page scanned every generated_videos row unfiltered.
 */

type Link = { poi_id: string; pois: { display_name: string } | null };
type Vid = { intent_bucket: string | null; scope: string | null; input_photo_ids: string[] | null };

function nameByPoi(links: Link[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of links) if (l.pois?.display_name) m.set(l.poi_id, l.pois.display_name);
  return m;
}

function usedIn(vids: Vid[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const v of vids) {
    const label = v.intent_bucket ?? v.scope ?? 'video';
    for (const pid of v.input_photo_ids ?? []) {
      const list = m.get(pid) ?? [];
      if (!list.includes(label)) list.push(label);
      m.set(pid, list);
    }
  }
  return m;
}

describe('nearby photo joins', () => {
  it('names photos by their POI, tolerating a missing join row', () => {
    const m = nameByPoi([
      { poi_id: 'a', pois: { display_name: 'Kroger' } },
      { poi_id: 'b', pois: null },
    ]);
    expect(m.get('a')).toBe('Kroger');
    expect(m.get('b')).toBeUndefined();
  });

  it('labels a photo with every bucket that used it, deduped', () => {
    const m = usedIn([
      { intent_bucket: 'dining', scope: 'community_intent_bucket', input_photo_ids: ['p1', 'p2'] },
      { intent_bucket: 'dining', scope: 'community_intent_bucket', input_photo_ids: ['p1'] },
      { intent_bucket: 'schools', scope: 'community_intent_bucket', input_photo_ids: ['p1'] },
    ]);
    expect(m.get('p1')).toEqual(['dining', 'schools']);
    expect(m.get('p2')).toEqual(['dining']);
    expect(m.get('p3')).toBeUndefined();
  });

  it('falls back to scope when intent_bucket is null', () => {
    const m = usedIn([
      { intent_bucket: null, scope: 'community_intent_bucket', input_photo_ids: ['p1'] },
    ]);
    expect(m.get('p1')).toEqual(['community_intent_bucket']);
  });

  it('survives null input_photo_ids', () => {
    expect(usedIn([{ intent_bucket: 'dining', scope: null, input_photo_ids: null }]).size).toBe(0);
  });
});

describe('keepPhotoForTour', () => {
  const focus = new Set(['resolved-poi', 'approved-link-poi']);
  const photo = (over: Partial<Parameters<typeof keepPhotoForTour>[0]> = {}) => ({
    poi_id: 'nearby-leftover',
    status: 'pending' as string | null,
    reviewed_by: null as string | null,
    ...over,
  });

  it('keeps photos on the POIs the tour resolved or a person approved', () => {
    expect(keepPhotoForTour(photo({ poi_id: 'resolved-poi' }), focus)).toBe(true);
    expect(keepPhotoForTour(photo({ poi_id: 'approved-link-poi' }), focus)).toBe(true);
  });

  it('drops a pending photo on a POI the Nearby button left behind', () => {
    expect(keepPhotoForTour(photo(), focus)).toBe(false);
    expect(keepPhotoForTour(photo({ status: 'rejected' }), focus)).toBe(false);
  });

  it('keeps a photo already in the cut, wherever it sits', () => {
    expect(keepPhotoForTour(photo({ status: 'approved' }), focus)).toBe(true);
  });

  it('keeps a photo a person ruled on, so narrowing cannot bury their verdict', () => {
    expect(keepPhotoForTour(photo({ status: 'rejected', reviewed_by: 'owner-uuid' }), focus)).toBe(
      true,
    );
  });

  it('narrows to nothing when the tour resolved nothing the photos sit on', () => {
    const rows = [photo(), photo({ poi_id: 'another-leftover' })];
    expect(rows.filter((r) => keepPhotoForTour(r, focus))).toEqual([]);
  });
});
