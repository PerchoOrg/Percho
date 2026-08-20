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

import type { BgmRole, BgmTrackMeta, BgmVibe } from './storage';

export interface BgmCandidate {
  /** "<vibe>/<file>.mp3" */
  path: string;
  meta?: BgmTrackMeta;
}

/**
 * Which vibe suits a community, from the same signal the narrator's voice uses.
 *
 * Deliberately coarse. The four vibes were written for LISTINGS, where they key
 * off property type and price ("$2M+, estates"); a neighbourhood has neither,
 * so what is left is character. Most communities are warm-acoustic and that is
 * the right default — the others are for the ones that clearly are not.
 */
export function vibeForCommunity(buckets: string[]): BgmVibe {
  const has = (b: string) => buckets.includes(b);
  if (has('nightlife') || has('work_hubs')) return 'chill-electronic';
  if (has('luxury')) return 'luxury-ambient';
  // A community defined by new-build shopping and fitness rather than parks
  // and schools reads as modern rather than cosy.
  if (!has('outdoor') && !has('schools') && (has('shopping') || has('fitness'))) {
    return 'modern-corporate';
  }
  return 'warm-acoustic';
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
  seed,
}: {
  candidates: BgmCandidate[];
  vibe: BgmVibe;
  role: BgmRole;
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
  const finalPool = onVibe.length > 0 ? onVibe : pool;

  // Sorted first, so the pick does not move when Storage returns a different
  // order.
  const sorted = [...finalPool].sort((a, b) => a.path.localeCompare(b.path));
  return sorted[hash(seed) % sorted.length] ?? null;
}
