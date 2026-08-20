/**
 * Which track this film gets. PURE.
 *
 * Owner 2026-08-20: "planner to decide." Until now the render worker called
 * `pick_bgm()` and took a uniform random pick from a folder, which is how the
 * loudest, most dynamic track in the library ended up under the first narrated
 * Aberdeen cut. Choosing in the plan step puts the decision next to every other
 * decision about the film — the shot order, the narration, the voice — and
 * makes it reviewable before anything is rendered.
 *
 * The choice is STABLE per community: the same community gets the same track
 * every time it is regenerated, for the same reason its narrator does not
 * change between takes. A tour whose music changed on re-render would read as
 * a different film.
 */

import type { BgmEnergy, BgmRole, BgmTrackMeta, BgmVibe } from './storage';

export interface BgmCandidate {
  /** "<vibe>/<file>.mp3" */
  path: string;
  meta?: BgmTrackMeta;
}

/**
 * Which palette suits a community.
 *
 * BUCKET PRESENCE IS A WEAK SIGNAL, and the first version of this leant on it
 * and got Aberdeen wrong. The selection pipeline forces variety — three school
 * slots are reserved and the rest round-robins across buckets — so nearly every
 * community ends up with schools, parks, dining and shops on the list. Asking
 * "does it have nightlife" then flipped a suburban subdivision to electronic on
 * the strength of one brewpub out of thirty-eight places.
 *
 * So: SHARE, not presence, and density above both. How far the everyday places
 * are is what actually separates a walkable neighbourhood from a car-dependent
 * one, it is already computed on every link row, and it is not something the
 * pipeline manufactures. Aberdeen's median is 1.83 miles, which is a suburb by
 * any reading.
 */
export function paletteForCommunity({
  bucketCounts,
  medianMiles,
}: {
  bucketCounts: Record<string, number>;
  /** Median distance to this community's POIs. Null when not yet resolved. */
  medianMiles?: number | null;
}): BgmVibe {
  const total = Object.values(bucketCounts).reduce((n, v) => n + v, 0);
  if (total === 0) return 'acoustic';
  const share = (...keys: string[]) => keys.reduce((n, k) => n + (bucketCounts[k] ?? 0), 0) / total;

  const urban = share('nightlife', 'work_hubs', 'dining');
  const settled = share('schools', 'outdoor', 'kids', 'pets');

  // Walkable AND genuinely urban in character.
  if (medianMiles != null && medianMiles <= 1.0 && urban >= 0.25) return 'electronic';
  // Schools and parks in real numbers say settled and family, whatever else is
  // on the list.
  if (settled >= 0.2) return 'acoustic';
  // No parks, no schools, but shops and gyms — a new-build pocket.
  if (share('shopping', 'fitness', 'amenities') >= 0.4) return 'piano';
  return 'acoustic';
}

/**
 * Which palette and energy suit a listing.
 *
 * PRICE IS A MODIFIER, NOT A CATEGORY. The old taxonomy had a `$2M+` bucket,
 * which on the current book of 265 listings would fire for under 5% of them
 * (p50 $600k, p90 $1.40M) and which breaks the moment a second market is
 * added — $2M is a normal house in the Bay Area and a mansion in Georgia. A
 * PERCENTILE within the listing's own market is self-calibrating and says
 * something true: "top of what sells here".
 *
 * What it modifies is restraint, not instruments. High-end property marketing
 * is sparse and unhurried by convention; entry-level is warm and moving. The
 * instruments come from the building's age, which is populated on 254 of 265.
 */
export function paletteForListing({
  yearBuilt,
  pricePercentile,
}: {
  yearBuilt?: number | null;
  /** 0-1 within the listing's own city or metro. */
  pricePercentile?: number | null;
}): { vibe: BgmVibe; energy: BgmEnergy } {
  const vibe: BgmVibe = yearBuilt && yearBuilt >= 2015 ? 'piano' : 'acoustic';
  const p = pricePercentile ?? 0.5;
  const energy: BgmEnergy = p >= 0.9 ? 'still' : p <= 0.35 ? 'moving' : 'gentle';
  return { vibe, energy };
}

/** Stable, well-spread index from a string. */
function hash(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick one track.
 *
 * Filters hard on ROLE — a narrated film may only use a bed, and a track that
 * surges would fight the voice no matter how well it suits the place. Prefers
 * the requested vibe but falls back rather than returning nothing: a film with
 * the wrong-flavoured music is a preference, a film with no music is a
 * regression.
 */
export function selectBgm({
  candidates,
  vibe,
  role,
  energy,
  seed,
}: {
  candidates: BgmCandidate[];
  vibe: BgmVibe;
  role: BgmRole;
  /** Preferred, not required — narrowing to nothing would leave a silent film. */
  energy?: BgmEnergy;
  /** Community id, so the same community keeps the same track. */
  seed: string;
}): BgmCandidate | null {
  if (candidates.length === 0) return null;

  // Tracks with no metadata predate it. Treat them as beds of their folder's
  // vibe — that is what they have always been used as, and excluding them
  // would empty the library the day this shipped.
  const roleOf = (c: BgmCandidate): BgmRole => c.meta?.role ?? 'bed';
  const vibeOf = (c: BgmCandidate): string => c.meta?.vibe ?? c.path.split('/')[0] ?? '';

  const usable = candidates.filter((c) => roleOf(c) === role);
  const pool = usable.length > 0 ? usable : candidates;
  const onVibe = pool.filter((c) => vibeOf(c) === vibe);
  const vibePool = onVibe.length > 0 ? onVibe : pool;
  // Energy narrows within the palette, and only if that leaves anything.
  const onEnergy = energy ? vibePool.filter((c) => c.meta?.energy === energy) : [];
  const finalPool = onEnergy.length > 0 ? onEnergy : vibePool;

  // Sorted first, so the pick does not move when Storage returns a different
  // order.
  const sorted = [...finalPool].sort((a, b) => a.path.localeCompare(b.path));
  return sorted[hash(seed) % sorted.length] ?? null;
}
