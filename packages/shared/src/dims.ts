/**
 * Dimension vocabulary — 11 dims used by the evidence profile, tradeoff
 * cards, and insight cards.
 *
 * Ported verbatim from
 * `percho-prototypes/discovery-v3-snapshot/_data.js` `window.DIMS`.
 */

import type { DimKey } from './types';

export interface DimDef {
  label: string;
  obs: string;
}

export const DIMS: Record<DimKey, DimDef> = {
  outdoors: {
    label: 'outdoor space',
    obs: "You've consistently liked homes with outdoor space.",
  },
  walkable: {
    label: 'walkability',
    obs: "You've repeatedly preferred walkable neighborhoods.",
  },
  schools: {
    label: 'top schools',
    obs: 'You keep picking places with strong schools nearby.',
  },
  quiet: {
    label: 'quiet streets',
    obs: 'You gravitate to quiet streets over busy corridors.',
  },
  hip: {
    label: 'a cultural scene',
    obs: 'You lean toward places with a cultural scene.',
  },
  entertaining: {
    label: 'entertaining spaces',
    obs: "You've consistently chosen homes designed for entertaining.",
  },
  trails: {
    label: 'trails and greenways',
    obs: "You've saved several homes with trail access.",
  },
  nightlife: {
    label: 'nightlife',
    obs: "You've picked neighborhoods with real nightlife.",
  },
  family: {
    label: 'family-friendliness',
    obs: 'You prioritize family-oriented neighborhoods.',
  },
  move_in: {
    label: 'move-in-ready homes',
    obs: 'You prefer move-in-ready over projects.',
  },
  space: {
    label: 'more square footage',
    obs: 'You reach for more square footage when you can.',
  },
};
