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
 *
 * Seeding on the community id is not enough for that, which is the whole point
 * of `incumbent` below. The seed picks an INDEX into the approved library, so
 * the library growing moves every index: approving five tracks re-scored all
 * six test communities, Aberdeen included. Stability has to come from
 * remembering what the community already used, exactly as the POI budget
 * remembers which places are already in the film.
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

/**
 * The smallest peer group a percentile may be computed from.
 *
 * A "top 10% of what sells here" claim drawn from four listings is noise
 * wearing a statistic's clothes, and `paletteForListing` turns the number into
 * a real difference in the music. Below this the caller should widen the
 * comparison (city → state) or pass nothing and take the middle.
 */
export const MIN_PRICE_PEERS = 8;

/**
 * Where `price` sits among `peers`, 0-1. Null when the peer group is too thin
 * to mean anything.
 *
 * Fraction at or below, so the cheapest listing in its market is not 0 (it is
 * still one of the prices that market contains) and the dearest is 1. `peers`
 * is expected to INCLUDE the listing itself; it costs nothing if it does not.
 */
export function pricePercentile(price: number, peers: readonly number[]): number | null {
  const usable = peers.filter((p) => Number.isFinite(p) && p > 0);
  if (usable.length < MIN_PRICE_PEERS) return null;
  const below = usable.filter((p) => p <= price).length;
  return below / usable.length;
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
 * The smallest share of a palette the energy filter may leave behind.
 *
 * Owner 2026-09-03: "can we make music evenly distributed?" Measured over the
 * 262 active listings, three tracks were carrying 31% of the book — and they
 * were exactly the three `moving` tracks in an acoustic bucket of 28. Energy is
 * tagged lopsidedly (24 gentle / 3 moving / 0 still) and it is a HARD filter,
 * so every listing under the 35th price percentile landed in a pool of three.
 *
 * A filter that throws away nine tracks in ten has stopped being a preference
 * and become a bottleneck, so it is dropped and the whole palette is used. A
 * SHARE rather than a count because it has to hold as the library grows: one
 * `still` track out of two is a real choice, one out of a hundred is not.
 */
const MIN_ENERGY_SHARE = 0.25;

/**
 * Pick one track.
 *
 * Filters hard on ROLE — a narrated film may only use a bed, and a track that
 * surges would fight the voice no matter how well it suits the place. Prefers
 * the requested vibe but falls back rather than returning nothing: a film with
 * the wrong-flavoured music is a preference, a film with no music is a
 * regression.
 *
 * Among the tracks that remain, the LEAST-USED one wins. The seed alone spreads
 * evenly only in the average; over a real book it leaves some tracks on eight
 * films and others on two, and `usage` is the difference between "random" and
 * "even" — which is what was actually asked for.
 */
export function selectBgm({
  candidates,
  vibe,
  role,
  energy,
  seed,
  incumbent,
  usage,
}: {
  candidates: BgmCandidate[];
  vibe: BgmVibe;
  role: BgmRole;
  /** Preferred, not required — narrowing to nothing would leave a silent film. */
  energy?: BgmEnergy;
  /** Community id, breaking the tie among equally good candidates. */
  seed: string;
  /**
   * The track this community last shipped with. Kept if it is still usable,
   * whatever else has been added to the library since.
   */
  incumbent?: string | null;
  /**
   * How many films of THIS KIND already ship with each track, by path. Counted
   * per film type rather than across both: a home tour and a community film are
   * never watched back to back, and mixing the two would let one book's
   * history push the other's choices around. Absent means "no history" — every
   * track ties and the seed decides, exactly as before.
   */
  usage?: Readonly<Record<string, number>>;
}): BgmCandidate | null {
  if (candidates.length === 0) return null;

  // Tracks with no metadata predate it. Treat them as beds of their folder's
  // vibe — that is what they have always been used as, and excluding them
  // would empty the library the day this shipped.
  const roleOf = (c: BgmCandidate): BgmRole => c.meta?.role ?? 'bed';
  const vibeOf = (c: BgmCandidate): string => c.meta?.vibe ?? c.path.split('/')[0] ?? '';

  const usable = candidates.filter((c) => roleOf(c) === role);
  const pool = usable.length > 0 ? usable : candidates;

  // INCUMBENCY, before anything else. A track that already shipped keeps the
  // film sounding like itself; it loses its place only by being rejected,
  // deleted, or made unusable for this role — never merely by the library
  // growing around it.
  if (incumbent) {
    const held = pool.find((c) => c.path === incumbent);
    if (held) return held;
  }
  const onVibe = pool.filter((c) => vibeOf(c) === vibe);
  const vibePool = onVibe.length > 0 ? onVibe : pool;
  // Energy narrows within the palette, and only while it still leaves a real
  // choice — see MIN_ENERGY_SHARE. The palette itself is never widened this
  // way: a thin bucket means the library needs more of that instrument, not
  // that a piano home should be handed a guitar.
  const onEnergy = energy ? vibePool.filter((c) => c.meta?.energy === energy) : [];
  const finalPool =
    onEnergy.length >= vibePool.length * MIN_ENERGY_SHARE && onEnergy.length > 0
      ? onEnergy
      : vibePool;

  // Sorted first, so the pick does not move when Storage returns a different
  // order.
  const sorted = [...finalPool].sort((a, b) => a.path.localeCompare(b.path));
  const useCount = (c: BgmCandidate): number => usage?.[c.path] ?? 0;
  const fewest = Math.min(...sorted.map(useCount));
  const leastUsed = sorted.filter((c) => useCount(c) === fewest);
  return leastUsed[hash(seed) % leastUsed.length] ?? null;
}
