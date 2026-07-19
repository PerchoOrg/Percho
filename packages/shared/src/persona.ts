/**
 * Persona derivation from swipe signal.
 *
 * Rolling weighted trait tally, ported from vibe/_data.js. Reference the
 * paginated-feed-and-swipe-ui skill § "Live persona / preference chip"
 * for the invariants.
 *
 * TODO(mobile-ios-bootstrap): port derivePersonaFromTraits label logic
 * from vibe/_data.js once tunnel-hosted prototype is reachable from build
 * env. For now returns a placeholder "Explorer" name so mobile can
 * consume the shape end-to-end.
 */

import type { FeedCard, Persona, TraitKey, TraitScores } from './types';
import { TRAIT_KEYS, clampTrait } from './traits';

export interface TraitTally {
  scores: TraitScores;
  count: number;
}

export function emptyTally(): TraitTally {
  return { scores: {}, count: 0 };
}

export type SwipeAction = 'like' | 'pass';

export function updateTally(
  tally: TraitTally,
  action: SwipeAction,
  card: FeedCard,
  communityTraitsById: Record<string, TraitScores> = {},
): TraitTally {
  const traits: TraitScores | undefined =
    card.kind === 'community'
      ? card.traits
      : card.communityId
        ? communityTraitsById[card.communityId]
        : undefined;
  if (!traits) return tally;

  // community-like weight 2, listing-like weight 1, community-pass weight -0.5
  const weight =
    action === 'like'
      ? card.kind === 'community'
        ? 2
        : 1
      : card.kind === 'community'
        ? -0.5
        : 0;
  if (weight === 0) return tally;

  const next: TraitScores = { ...tally.scores };
  for (const k of TRAIT_KEYS) {
    const v = traits[k];
    if (v == null) continue;
    next[k] = (next[k] ?? 0) + v * weight;
  }
  return { scores: next, count: tally.count + Math.abs(weight) };
}

export function derivePersona(tally: TraitTally): Persona {
  if (tally.count < 3) {
    return { name: 'Explorer', traits: {}, count: 0 };
  }
  const traits: TraitScores = {};
  for (const k of TRAIT_KEYS) {
    const v = tally.scores[k];
    if (v == null) continue;
    traits[k] = clampTrait(v / tally.count);
  }
  return { name: labelForTraits(traits), traits, count: tally.count };
}

// Placeholder label logic. Replace with vibe/_data.js port when prototype
// is reachable — see file-level TODO.
function labelForTraits(t: TraitScores): string {
  const top = (Object.entries(t) as [TraitKey, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);
  if (top.length === 0) return 'Explorer';
  if (top.includes('family') && top.includes('schools')) return 'Suburban Family';
  if (top.includes('walkable') && top.includes('hip')) return 'Third-Place Urbanist';
  if (top.includes('quiet') && top.includes('green')) return 'Trail-Runner';
  if (top.includes('nightlife')) return 'Night Owl';
  return 'Explorer';
}
