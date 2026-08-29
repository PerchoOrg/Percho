import type { DimKey } from '@percho/shared/types';
/**
 * `pickDimPhotos` — the trade-off card's doors.
 *
 * The contract that matters: the photo must DEPICT the dimension. A hero is
 * never acceptable (owner 2026-08-29), a claiming listing is a preference and
 * not a requirement, and a dim with no honest room comes back absent.
 */
import { describe, expect, it } from 'vitest';
import { type TaggedPhotoRow, pickDimPhotos } from './dim-photos';

function photo(
  listing_id: string,
  path: string,
  room: string | null,
  extra: Record<string, unknown> = {},
): TaggedPhotoRow {
  return {
    listing_id,
    storage_path: path,
    ai_tags: room === null ? {} : { room_type: room, ...extra },
  };
}

const claims = (m: Record<string, DimKey[]>) => new Map(Object.entries(m));

describe('pickDimPhotos', () => {
  it('matches a room that depicts the dimension', () => {
    const out = pickDimPhotos(
      [photo('a', 'x/kitchen.jpg', 'kitchen', { caption: 'Modern kitchen with an island' })],
      claims({}),
    );
    expect(out.move_in?.[0]?.url).toContain('x/kitchen.jpg');
    expect(out.move_in?.[0]?.caption).toBe('Modern kitchen with an island');
  });

  it('does not require the listing to claim the dim', () => {
    // Measured 2026-08-29: `entertaining` is claimed by ONE listing in the live
    // pool while 30 kitchen photos exist. A kitchen under "Updated kitchen" is
    // honest regardless of whose prose used the word.
    const out = pickDimPhotos([photo('a', 'x/k.jpg', 'kitchen')], claims({}));
    expect(out.entertaining?.[0]?.url).toContain('x/k.jpg');
  });

  it('prefers a photo whose listing does claim the dim', () => {
    const out = pickDimPhotos(
      [photo('a', 'x/other.jpg', 'kitchen'), photo('b', 'x/claimed.jpg', 'kitchen')],
      claims({ b: ['move_in'] }),
    );
    expect(out.move_in?.[0]?.url).toContain('x/claimed.jpg');
  });

  it('prefers the room that depicts it best', () => {
    // `move_in` reads kitchen before bathroom.
    const out = pickDimPhotos(
      [photo('a', 'x/bath.jpg', 'bathroom'), photo('a', 'x/kit.jpg', 'kitchen')],
      claims({}),
    );
    expect(out.move_in?.[0]?.url).toContain('x/kit.jpg');
  });

  it('breaks a tie on the tagger score', () => {
    const out = pickDimPhotos(
      [
        photo('a', 'x/dull.jpg', 'kitchen', { hero_score: 1 }),
        photo('a', 'x/bright.jpg', 'kitchen', { hero_score: 9 }),
      ],
      claims({}),
    );
    expect(out.move_in?.[0]?.url).toContain('x/bright.jpg');
  });

  it('skips photos the tagger marked unusable', () => {
    const out = pickDimPhotos(
      [photo('a', 'x/blurry.jpg', 'kitchen', { usable: false })],
      claims({}),
    );
    expect(out.move_in).toBeUndefined();
  });

  it('omits a dim no room can depict', () => {
    // Place dims — a room inside a house never shows a walkable street. The
    // client lights these with a community hero instead, or not at all.
    const out = pickDimPhotos(
      [photo('a', 'x/k.jpg', 'kitchen'), photo('a', 'x/ext.jpg', 'exterior')],
      claims({}),
    );
    expect(out.walkable).toBeUndefined();
    expect(out.schools).toBeUndefined();
    expect(out.hip).toBeUndefined();
    expect(out.nightlife).toBeUndefined();
  });

  it('drops a caption too short to be a sentence', () => {
    const out = pickDimPhotos(
      [photo('a', 'x/k.jpg', 'kitchen', { caption: 'kitchen' })],
      claims({}),
    );
    expect(out.move_in?.[0]?.url).toContain('x/k.jpg');
    expect(out.move_in?.[0]?.caption).toBeUndefined();
  });

  it('returns up to three photos, from three different listings', () => {
    const out = pickDimPhotos(
      [
        photo('a', 'x/a1.jpg', 'kitchen', { hero_score: 9 }),
        photo('a', 'x/a2.jpg', 'kitchen', { hero_score: 8 }),
        photo('b', 'x/b1.jpg', 'kitchen', { hero_score: 7 }),
        photo('c', 'x/c1.jpg', 'kitchen', { hero_score: 6 }),
        photo('d', 'x/d1.jpg', 'kitchen', { hero_score: 5 }),
      ],
      claims({}),
    );
    const picks = out.move_in ?? [];
    expect(picks).toHaveLength(3);
    // `a` contributed its best frame only — a2 is skipped for b1.
    expect(picks.map((p) => p.url.split('/').pop())).toEqual(['a1.jpg', 'b1.jpg', 'c1.jpg']);
  });

  it('returns what it has when three homes do not exist', () => {
    const out = pickDimPhotos(
      [photo('a', 'x/a.jpg', 'backyard'), photo('a', 'x/a2.jpg', 'pool')],
      claims({}),
    );
    // Two frames, one listing → one pick. Fewer is correct; padding it with a
    // second frame of the same house would defeat the point.
    expect(out.outdoors).toHaveLength(1);
  });

  it('ignores untagged rows without throwing', () => {
    expect(pickDimPhotos([photo('a', 'x/p.jpg', null)], claims({}))).toEqual({});
    expect(pickDimPhotos([], claims({}))).toEqual({});
  });
});
