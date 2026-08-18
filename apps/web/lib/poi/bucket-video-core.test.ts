/**
 * Tests for the pure halves of the bucket-video pipeline.
 *
 * These two functions carried the whole photo-selection policy and were
 * duplicated verbatim across listing-video-actions.ts and
 * community-video-actions.ts with no test on either copy. They are pure, so
 * they are testable even though the surrounding server actions are not.
 */
import { describe, expect, it } from 'vitest';
import { filterEligiblePhotos, selectPhotosForVideo } from './bucket-video-core';
import type { IntentBucket } from './types';

type Photo = Parameters<typeof selectPhotosForVideo>[0][number];

function photo(
  id: string,
  poiId: string,
  opts: Partial<{
    width: number;
    height: number;
    score: number;
    buckets: string[] | null;
    taggedAt: string | null;
    usable: boolean;
  }> = {},
): Photo {
  return {
    poi_photo_id: id,
    poi_photos: {
      id: `pp-${id}`,
      poi_id: poiId,
      storage_path: `${id}.jpg`,
      attribution: null,
      width_px: opts.width ?? 1000,
      height_px: opts.height ?? 1000,
      applicable_buckets: opts.buckets === undefined ? null : opts.buckets,
      ai_score: opts.score ?? 0.5,
      tagged_at: opts.taggedAt ?? null,
      ai_tags: opts.usable === undefined ? null : { usable: opts.usable },
    },
  };
}

describe('selectPhotosForVideo', () => {
  it('walks outer -> inner: the furthest POI leads', () => {
    const photos = [photo('near', 'poi-near'), photo('far', 'poi-far')];
    const distances = new Map([
      ['poi-near', 100],
      ['poi-far', 5000],
    ]);
    expect(selectPhotosForVideo(photos, distances).map((p) => p.poi_photo_id)).toEqual([
      'far',
      'near',
    ]);
  });

  it('puts POIs with a known distance ahead of POIs without one', () => {
    const photos = [photo('unknown', 'poi-x'), photo('known', 'poi-y')];
    const distances = new Map([['poi-y', 250]]);
    expect(selectPhotosForVideo(photos, distances).map((p) => p.poi_photo_id)).toEqual([
      'known',
      'unknown',
    ]);
  });

  it('within a POI, prefers portrait over landscape', () => {
    const photos = [
      photo('landscape', 'poi-a', { width: 1920, height: 1080 }),
      photo('portrait', 'poi-a', { width: 1080, height: 1920 }),
    ];
    expect(selectPhotosForVideo(photos, new Map()).map((p) => p.poi_photo_id)).toEqual([
      'portrait',
      'landscape',
    ]);
  });

  it('breaks an orientation tie on ai_score, then on id', () => {
    const photos = [
      photo('b-low', 'poi-a', { score: 0.1 }),
      photo('a-high', 'poi-a', { score: 0.9 }),
      photo('c-high', 'poi-a', { score: 0.9 }),
    ];
    expect(selectPhotosForVideo(photos, new Map()).map((p) => p.poi_photo_id)).toEqual([
      'a-high',
      'c-high',
      'b-low',
    ]);
  });

  it('caps the selection', () => {
    const photos = Array.from({ length: 30 }, (_, i) =>
      photo(`p${String(i).padStart(2, '0')}`, 'poi-a'),
    );
    expect(selectPhotosForVideo(photos, new Map(), 15)).toHaveLength(15);
  });

  it('is stable — same input, same order', () => {
    const build = () => [photo('x', 'poi-a'), photo('y', 'poi-b'), photo('z', 'poi-a')];
    const d = new Map([['poi-a', 10]]);
    expect(selectPhotosForVideo(build(), d)).toEqual(selectPhotosForVideo(build(), d));
  });

  it('returns nothing for an empty pool', () => {
    expect(selectPhotosForVideo([], new Map())).toEqual([]);
  });
});

describe('filterEligiblePhotos', () => {
  const bucket = 'dining' as IntentBucket;

  it('trusts a tagged photo’s own applicable_buckets', () => {
    const rows = [
      photo('in', 'poi-a', { taggedAt: '2026-08-01', buckets: ['dining'] }),
      photo('out', 'poi-a', { taggedAt: '2026-08-01', buckets: ['schools'] }),
    ];
    expect(
      filterEligiblePhotos(rows, bucket, new Set(['poi-a']), new Set()).map((r) => r.poi_photo_id),
    ).toEqual(['in']);
  });

  it('falls back to the POI’s bucket when the photo is untagged', () => {
    const rows = [photo('a', 'poi-in'), photo('b', 'poi-out')];
    expect(
      filterEligiblePhotos(rows, bucket, new Set(['poi-in']), new Set()).map((r) => r.poi_photo_id),
    ).toEqual(['a']);
  });

  it('drops photos the tagger marked unusable, even in-bucket ones', () => {
    const rows = [
      photo('bad', 'poi-a', { taggedAt: '2026-08-01', buckets: ['dining'], usable: false }),
      photo('good', 'poi-a', { taggedAt: '2026-08-01', buckets: ['dining'], usable: true }),
    ];
    expect(
      filterEligiblePhotos(rows, bucket, new Set(['poi-a']), new Set()).map((r) => r.poi_photo_id),
    ).toEqual(['good']);
  });

  it('drops photos already claimed by another live video', () => {
    const rows = [photo('claimed', 'poi-a'), photo('free', 'poi-a')];
    expect(
      filterEligiblePhotos(rows, bucket, new Set(['poi-a']), new Set(['claimed'])).map(
        (r) => r.poi_photo_id,
      ),
    ).toEqual(['free']);
  });

  it('treats a tagged photo with an empty bucket list as untagged', () => {
    const rows = [photo('a', 'poi-in', { taggedAt: '2026-08-01', buckets: [] })];
    expect(filterEligiblePhotos(rows, bucket, new Set(['poi-in']), new Set())).toHaveLength(1);
    expect(filterEligiblePhotos(rows, bucket, new Set(), new Set())).toHaveLength(0);
  });
});
