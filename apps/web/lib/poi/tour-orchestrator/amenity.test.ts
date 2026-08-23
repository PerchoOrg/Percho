import { describe, expect, it } from 'vitest';
import {
  AMENITIES,
  type Amenity,
  COMMUNITY_ACT_CLIP_BUDGET,
  amenityOf,
  amenityOrder,
  communityActSlots,
} from './amenity';

/** Real `ai_tags` from Bellmoore Park's gallery, 2026-08-23. */
const BELLMOORE: Array<[string[], string, string, Amenity]> = [
  [['pool', 'community', 'amenity', 'clubhouse', 'aerial'], 'aerial', 'none', 'pool'],
  [['park', 'community', 'landscaping', 'amenities', 'splash-pad'], 'aerial', 'none', 'pool'],
  [['clubhouse', 'amenity-center', 'community-facility'], 'storefront', 'none', 'clubhouse'],
  [
    ['community-amenity', 'clubhouse', 'suburban', 'green-space', 'aerial-view'],
    'aerial',
    'multiple_homes',
    'clubhouse',
  ],
  [['tennis', 'recreation', 'community-amenity', 'sports'], 'landscape', 'none', 'courts'],
  [
    ['recreation', 'basketball', 'park', 'sports', 'community-amenity'],
    'landscape',
    'none',
    'courts',
  ],
  [['gym', 'workout', 'fitness-room', 'amenities', 'weight-room'], 'interior', 'none', 'fitness'],
  [['entrance', 'community-gate', 'landscaping', 'sunny'], 'storefront', 'none', 'entrance'],
  [['community-entry', 'landscaping', 'sunny', 'neighborhood-sign'], 'signage', 'none', 'entrance'],
  [
    ['neighborhood', 'street', 'suburban', 'residential'],
    'storefront',
    'multiple_homes',
    'streetscape',
  ],
  [['site-plan', 'map', 'community-layout'], 'other', 'none', 'other'],
];

describe('amenityOf', () => {
  it.each(BELLMOORE)(
    'reads %j as its amenity',
    (tags, primary_category, residential_scope, want) => {
      expect(amenityOf({ tags, primary_category, residential_scope })).toBe(want);
    },
  );

  it('prefers the specific facility over the amenity centre', () => {
    // Every one of these photos is also tagged `amenities` / `community-center`
    // by the tagger. A `clubhouse` rule placed first swallowed the pool, the
    // courts and the gym on the first pass over Bellmoore Park.
    expect(amenityOf({ tags: ['community-center', 'pool', 'playground', 'amenities'] })).toBe(
      'pool',
    );
    expect(amenityOf({ tags: ['gym', 'fitness', 'amenities', 'community-center'] })).toBe(
      'fitness',
    );
    expect(amenityOf({ tags: ['patio', 'tennis', 'community-amenity'] })).toBe('courts');
  });

  it('ignores the description, which carries the community name', () => {
    // "Bellmoore Park" put every streetscape in the place into `green_space`
    // when the description was part of the haystack.
    expect(
      amenityOf({
        tags: ['neighborhood', 'suburban', 'residential'],
        residential_scope: 'multiple_homes',
        // biome-ignore lint/suspicious/noExplicitAny: proving the field is not read
        ...({ description: 'A street of homes in Bellmoore Park.' } as any),
      }),
    ).toBe('streetscape');
  });

  it('calls several homes a streetscape only when nothing else is recognisable', () => {
    // Two of the best clubhouse aerials are scoped `multiple_homes` because
    // houses are visible around the clubhouse.
    expect(
      amenityOf({ tags: ['clubhouse', 'amenities'], residential_scope: 'multiple_homes' }),
    ).toBe('clubhouse');
    expect(amenityOf({ tags: ['suburban', 'homes'], residential_scope: 'multiple_homes' })).toBe(
      'streetscape',
    );
  });

  it('falls back to other, not to an amenity it cannot see', () => {
    expect(amenityOf({ tags: ['real-estate', 'rendering'] })).toBe('other');
    expect(amenityOf({})).toBe('other');
  });
});

describe('amenityOrder', () => {
  it('walks entrance → clubhouse → pool → courts, and leaves last', () => {
    const walk = [...AMENITIES].sort((a, b) => amenityOrder(a) - amenityOrder(b));
    expect(walk.slice(0, 4)).toEqual(['entrance', 'clubhouse', 'pool', 'courts']);
    expect(walk.at(-1)).toBe('streetscape');
  });
});

describe('communityActSlots', () => {
  /** Bellmoore Park's real pool of usable photos, 2026-08-23. */
  const BELLMOORE_POOL = new Map<Amenity, number>([
    ['entrance', 3],
    ['clubhouse', 5],
    ['pool', 7],
    ['courts', 4],
    ['fitness', 4],
    ['streetscape', 18],
    ['other', 8],
  ]);

  it('spends the budget and no more', () => {
    const slots = communityActSlots(BELLMOORE_POOL, { ceiling: 3 });
    const total = [...slots.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(COMMUNITY_ACT_CLIP_BUDGET);
  });

  it('covers every amenity before it gives any of them a second clip', () => {
    // The bug this replaces: 49 photos across five amenities, three slots, and
    // whichever sorted first took all three. The film showed no amenity at all.
    const slots = communityActSlots(BELLMOORE_POOL, { ceiling: 3 });
    for (const a of ['entrance', 'clubhouse', 'pool', 'courts', 'fitness'] as Amenity[]) {
      expect(slots.get(a) ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives the extra clips to the amenities with the most to choose from', () => {
    const slots = communityActSlots(BELLMOORE_POOL, { ceiling: 3 });
    expect(slots.get('pool')).toBe(2);
    expect(slots.get('clubhouse')).toBe(2);
    expect(slots.get('courts')).toBe(1);
  });

  it('keeps exactly one streetscape, however many there are', () => {
    // Owner 2026-08-23: keep them for the vibe, one clip, and not at the front.
    const slots = communityActSlots(BELLMOORE_POOL, { ceiling: 3 });
    expect(slots.get('streetscape')).toBe(1);
  });

  it('never spends a slot on a photo it could not place', () => {
    // `other` holds the site plan and two elevation renderings. The review
    // table is where one of those gets promoted, by hand.
    expect(communityActSlots(BELLMOORE_POOL, { ceiling: 3 }).get('other')).toBeUndefined();
  });

  it('lets a thin community use its ceiling rather than padding with houses', () => {
    const slots = communityActSlots(
      new Map<Amenity, number>([
        ['pool', 6],
        ['streetscape', 9],
      ]),
      { ceiling: 3 },
    );
    expect(slots.get('pool')).toBe(3);
    expect(slots.get('streetscape')).toBe(1);
  });

  it('reaches other only once every amenity has hit its ceiling', () => {
    const slots = communityActSlots(
      new Map<Amenity, number>([
        ['pool', 1],
        ['other', 5],
      ]),
      { ceiling: 3 },
    );
    expect(slots.get('pool')).toBe(1);
    expect(slots.get('other')).toBe(3);
  });

  it('is empty when there is nothing to show', () => {
    expect([...communityActSlots(new Map(), { ceiling: 3 })]).toEqual([]);
  });
});
