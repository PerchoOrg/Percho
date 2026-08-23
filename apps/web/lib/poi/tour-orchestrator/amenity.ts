/**
 * Which of the community's own amenities a photo shows, and how the film's
 * community act divides its clips between them.
 *
 * The community is ONE POI in the database — the ingest attaches every photo a
 * community's website hands over to a single synthetic `community_amenity`
 * row. That was fine when a community site had a page per amenity (Aberdeen's
 * `/swimming/`, `/tennis/`, `/playground/`), because each page became its own
 * POI. It is not fine for a builder's gallery: Bellmoore Park's 49 usable
 * photos — pool, clubhouse, courts, gym, gate — all landed on one POI, and the
 * per-POI cap of three then chose three streetscapes of houses and dropped
 * every amenity in the community (owner 2026-08-23: "there is no single photo
 * for community! and starting with some houses, which i already mentioned to
 * avoid… for website, the rule should be applied on the amenity level, not poi
 * level, the community itself is a special poi").
 *
 * So the amenity is read off the photo instead of off the POI it hangs from,
 * and it is the amenity — not the POI — that the cap and the walk-through
 * order key on.
 */

/**
 * In walk-through order: the sequence someone shown around would see them in.
 * `other` and `streetscape` sort last on purpose — see `communityActSlots`.
 */
export const AMENITIES = [
  'entrance',
  'clubhouse',
  'pool',
  'courts',
  'playground',
  'green_space',
  'fitness',
  'other',
  'streetscape',
] as const;

export type Amenity = (typeof AMENITIES)[number];

/** Lower sorts earlier. The community act plays in this order. */
export function amenityOrder(amenity: Amenity): number {
  return AMENITIES.indexOf(amenity);
}

/** What the on-screen label calls it, after the community's name. */
export const AMENITY_LABEL: Record<Amenity, string> = {
  entrance: 'Entrance',
  clubhouse: 'Clubhouse',
  pool: 'Pool',
  courts: 'Courts',
  playground: 'Playground',
  green_space: 'Green Space',
  fitness: 'Fitness Center',
  other: 'Amenities',
  streetscape: 'Neighborhood',
};

/**
 * Matched in this order, and the order is the whole design: a specific
 * facility beats a generic one. Every one of these photos is tagged
 * `community-amenity` or `amenities` by the vision tagger, so a rule for
 * `clubhouse` placed first swallows the pool, the courts and the gym — it did,
 * on the first pass over Bellmoore Park, and left four amenities showing as
 * "clubhouse". `clubhouse` and `green_space` are therefore the catch-alls for
 * an amenity centre and for open ground, and they run last.
 */
const AMENITY_RULES: Array<[Amenity, RegExp]> = [
  ['pool', /\b(pool|pools|swim|swimming|aquatic|splash|splash-pad|waterslide)\b/i],
  ['courts', /\b(tennis|pickleball|court|courts|basketball|volleyball)\b/i],
  ['playground', /\b(playground|play-area|play area|tot-lot|tot lot|jungle gym|swing set)\b/i],
  ['fitness', /\b(gym|fitness|fitness-room|weight-room|workout|exercise|yoga)\b/i],
  ['entrance', /\b(entrance|entry|gate|gatehouse|monument|signage|sign)\b/i],
  [
    'clubhouse',
    /\b(clubhouse|club-house|club house|community-center|community center|amenity-center|amenity center|amenity centre|lodge)\b/i,
  ],
  [
    'green_space',
    /\b(trail|greenway|green-space|greenspace|lake|pond|lawn|pavilion|dog-park|dog park|garden|courtyard)\b/i,
  ],
];

/**
 * The amenity a community photo shows.
 *
 * Reads `tags` and `primary_category` and NOT `description`. The description is
 * a sentence written about this specific community, so it carries the
 * community's own name — and "Bellmoore Park" put every streetscape in the
 * place into `green_space` on the first pass. The tag list is the tagger's
 * structured output and names the subject, not the address.
 *
 * `multiple_homes` is the fallback, not the first test: two of Bellmoore
 * Park's best clubhouse aerials are scoped `multiple_homes` because houses are
 * visible around the clubhouse. A photo is a streetscape when it shows several
 * homes AND nothing else recognisable.
 */
export function amenityOf(tags: {
  tags?: string[] | null;
  primary_category?: string | null;
  residential_scope?: string | null;
}): Amenity {
  const haystack = [(tags.tags ?? []).join(' '), tags.primary_category ?? ''].join(' ');
  for (const [amenity, pattern] of AMENITY_RULES) {
    if (pattern.test(haystack)) return amenity;
  }
  return tags.residential_scope === 'multiple_homes' ? 'streetscape' : 'other';
}

/**
 * How many clips the community's own act may spend.
 *
 * Eight, owner 2026-08-23, chosen against the alternative of twelve paid for by
 * cutting the surrounding budget from fifteen places to eleven: he kept the
 * fifteen. Eight puts the film at about 31 clips inside TOUR_TARGET_MAX_S,
 * which `fitDuration` holds at roughly 2.9s a clip — near the short end, and
 * the number to lower if clips start reading as clipped.
 */
export const COMMUNITY_ACT_CLIP_BUDGET = 8;

/**
 * Streetscapes are a closing note, not a chapter.
 *
 * The owner's two rulings read as one rule: "it is ok to have photos for
 * multiple houses to give a vibe but not single one" (2026-08-23) and, on the
 * cut that opened with three of them, "starting with some houses, which i
 * already mentioned to avoid". One clip, and it plays last.
 */
export const STREETSCAPE_MAX_CLIPS = 1;

/**
 * Divide the community act's clips between the amenities that have photos.
 *
 * PURE. Priority, in order:
 *
 *   1. ONE clip for every recognised amenity. Coverage first — a film that
 *      shows the pool three times and never the gate has answered one question
 *      three times and another not at all.
 *   2. ONE streetscape, if there is one.
 *   3. Second and third clips, to the amenities with the most photos to choose
 *      from. Depth goes where the material is.
 *   4. `other` — photos no rule could place — last, so a site plan or an
 *      elevation rendering never takes a slot from the pool. In practice it
 *      gets nothing, which is the intent: the review table is where the owner
 *      promotes one by hand, and his approvals bypass this cap entirely.
 */
export function communityActSlots(
  available: Map<Amenity, number>,
  opts: { budget?: number; ceiling: number },
): Map<Amenity, number> {
  const budget = opts.budget ?? COMMUNITY_ACT_CLIP_BUDGET;
  const ceilingFor = (a: Amenity) =>
    a === 'streetscape' ? Math.min(STREETSCAPE_MAX_CLIPS, opts.ceiling) : opts.ceiling;
  const countOf = (a: Amenity) => available.get(a) ?? 0;
  const present = (a: Amenity, n: number) => countOf(a) >= n && ceilingFor(a) >= n;

  const named = AMENITIES.filter((a) => a !== 'streetscape' && a !== 'other' && countOf(a) > 0);
  // Ties break on walk order, so the allocation is stable across re-runs.
  const byDepth = [...named].sort(
    (a, b) => countOf(b) - countOf(a) || amenityOrder(a) - amenityOrder(b),
  );

  const queue: Amenity[] = [];
  for (const a of named) if (present(a, 1)) queue.push(a);
  if (present('streetscape', 1)) queue.push('streetscape');
  for (let n = 2; n <= opts.ceiling; n++) {
    for (const a of byDepth) if (present(a, n)) queue.push(a);
  }
  for (let n = 1; n <= opts.ceiling; n++) if (present('other', n)) queue.push('other');

  const slots = new Map<Amenity, number>();
  for (const a of queue.slice(0, Math.max(0, budget))) {
    slots.set(a, (slots.get(a) ?? 0) + 1);
  }
  return slots;
}
