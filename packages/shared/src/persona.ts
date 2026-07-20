/**
 * Persona derivation from swipe signal.
 *
 * Rolling weighted trait tally with label logic ported from
 * `percho-prototypes/vibe/_data.js` (`window.derivePersona`).
 *
 * Weights (from skill § "Live persona / preference chip"):
 *   community-like  = +2   (strong signal, both listing & neighborhood)
 *   listing-like    = +1   (inherits parent community traits)
 *   community-pass  = -0.5 (weak negative signal)
 *   listing-pass    =  0   (photo/price rejection, not a vibe signal)
 *
 * Ask-cards do NOT flow through this fn — they update scope chips, not
 * traits. The feed reducer routes ask swipes to the scope reducer.
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
  if (card.kind === 'ask') return tally; // ask-cards feed scope, not persona
  const traits: TraitScores | undefined =
    card.kind === 'community'
      ? card.traits
      : card.communityId
        ? communityTraitsById[card.communityId]
        : undefined;
  if (!traits) return tally;

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
    return {
      name: 'Explorer',
      desc: 'A few more swipes and we\u2019ll dial in what fits you.',
      traits: {},
      count: 0,
    };
  }
  const traits: TraitScores = {};
  for (const k of TRAIT_KEYS) {
    const v = tally.scores[k];
    if (v == null) continue;
    traits[k] = clampTrait(v / tally.count);
  }
  const { name, desc } = labelForTraits(traits);
  return { name, desc, traits, count: tally.count };
}

/**
 * Ported from vibe/_data.js `derivePersona`. Order matters — the first
 * matching branch wins, so most specific archetypes come first.
 *
 * Trait mapping tweak: web prototype used `outdoors`, mobile shared vocab
 * uses `green` as the outdoors proxy. `schools` was implied by `family`
 * in the prototype; we treat schools ≥ family for the suburbanite branch.
 */
function labelForTraits(t: TraitScores): { name: string; desc: string } {
  const g = (k: TraitKey) => t[k] ?? 0;
  const family = g('family');
  const walkable = g('walkable');
  const quiet = g('quiet');
  const hip = g('hip');
  const green = g('green');
  const nightlife = g('nightlife');
  const schools = g('schools');

  if (family > 75 && green > 65 && quiet > 65) {
    return {
      name: 'The Trail-Runner Suburbanite',
      desc: 'Quiet streets, easy nature, top schools. Not rural, not urban — the sweet middle.',
    };
  }
  if (walkable > 80 && hip > 70) {
    return {
      name: 'The Third-Place Urbanist',
      desc: 'Coffee in the morning, restaurants at night, no car if possible.',
    };
  }
  if (quiet > 85 && green > 75) {
    return {
      name: 'The Slow-Living Retreater',
      desc: 'You\u2019d trade nightlife for stars. Farm-to-table over franchise.',
    };
  }
  if (family > 85 || schools > 85) {
    return {
      name: 'The Family-First Planner',
      desc: 'Schools first, everything else negotiable. New builds and low-traffic streets rank high.',
    };
  }
  if (hip > 75 && nightlife > 60) {
    return {
      name: 'The Downtown Devotee',
      desc: 'Culture, music, food scene. Walk out your door and be in the city.',
    };
  }
  if (family > 60 && walkable > 70) {
    return {
      name: 'The Village Family',
      desc: 'Kids AND coffee shops. Small-town feel with real amenities.',
    };
  }
  return {
    name: 'The Balanced Explorer',
    desc: 'Your swipes span multiple vibes — we\u2019ll show you a mix.',
  };
}
