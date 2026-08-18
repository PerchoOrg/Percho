/**
 * `pickVideo` and `poolFor` decide which video a browse card plays on each
 * horizontal swipe. They carried that policy inside a 2,100-line component
 * with no coverage until phase52.
 */
import { describe, expect, it } from 'vitest';
import { type BrowseCard, pickVideo, poolFor } from './browse-card';

function card(over: Partial<BrowseCard> = {}): BrowseCard {
  return {
    id: 'l1',
    mediaKind: 'video',
    listing: {
      id: 'l1',
      address: '1 Peachtree St',
      city: 'Atlanta',
      state: 'GA',
      price: null,
      beds: null,
      baths: null,
      sqft: null,
      slug: null,
      agentSlug: null,
    },
    hero: { cfVideoId: 'hero-uid' },
    categoryVideos: [],
    ...over,
  } as BrowseCard;
}

const vid = (id: string, line1 = id) => ({ cfVideoId: id, line1 });

describe('poolFor', () => {
  it('counts the photo carousel for a photo card', () => {
    expect(poolFor(card({ mediaKind: 'photo', photos: ['a', 'b', 'c'] }), 'hero')).toBe(3);
  });

  it('never reports a pool smaller than one, even with no photos', () => {
    expect(poolFor(card({ mediaKind: 'photo' }), 'hero')).toBe(1);
  });

  it('counts category videos on the nearby rail', () => {
    expect(poolFor(card({ categoryVideos: [vid('a'), vid('b')] }), 'nearby')).toBe(2);
  });

  it('counts the hero pool when there is one, else a single hero', () => {
    expect(poolFor(card({ heroVideos: [vid('a'), vid('b'), vid('c')] }), 'hero')).toBe(3);
    expect(poolFor(card(), 'hero')).toBe(1);
  });
});

describe('pickVideo', () => {
  it('cycles the nearby pool, wrapping past the end', () => {
    const c = card({ categoryVideos: [vid('n0'), vid('n1')] });
    expect(pickVideo(c, 'nearby', 0).cfVideoId).toBe('n0');
    expect(pickVideo(c, 'nearby', 1).cfVideoId).toBe('n1');
    expect(pickVideo(c, 'nearby', 2).cfVideoId).toBe('n0');
    expect(pickVideo(c, 'nearby', 5).cfVideoId).toBe('n1');
  });

  it('cycles the hero pool the same way', () => {
    const c = card({ heroVideos: [vid('h0'), vid('h1')] });
    expect(pickVideo(c, 'hero', 3).cfVideoId).toBe('h1');
  });

  it('falls back to the single hero, captioned from the listing address', () => {
    const got = pickVideo(card(), 'hero', 0);
    expect(got.cfVideoId).toBe('hero-uid');
    expect(got.line1).toBe('1 Peachtree St');
    expect(got.line2).toBe('Atlanta, GA');
  });

  it('falls back to the hero when the nearby rail is empty', () => {
    expect(pickVideo(card({ categoryVideos: [] }), 'nearby', 0).cfVideoId).toBe('hero-uid');
  });

  it('carries the landscape variant and external url through the fallback', () => {
    const c = card({
      hero: { cfVideoId: '', cfVideoIdLandscape: 'wide-uid', externalUrl: 'https://x/y.mp4' },
    });
    const got = pickVideo(c, 'hero', 0);
    expect(got.cfVideoIdLandscape).toBe('wide-uid');
    expect(got.externalUrl).toBe('https://x/y.mp4');
  });

  it('normalises absent landscape/external to null rather than undefined', () => {
    const got = pickVideo(card(), 'hero', 0);
    expect(got.cfVideoIdLandscape).toBeNull();
    expect(got.externalUrl).toBeNull();
  });
});
