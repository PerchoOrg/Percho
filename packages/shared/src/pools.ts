/**
 * Tradeoff + challenge card pools.
 *
 * Ported verbatim from
 * `percho-prototypes/discovery-v3-snapshot/_data.js`
 *   window.TRADEOFF_POOL, window.CHALLENGE_POOL.
 */

import type { ChallengeCard, TradeoffCard } from './types';

export const TRADEOFF_POOL: TradeoffCard[] = [
  {
    kind: 'tradeoff',
    id: 'to-yard-vs-kitchen',
    L: { label: 'Large backyard', dim: 'outdoors' },
    R: { label: 'Updated kitchen', dim: 'entertaining' },
  },
  {
    kind: 'tradeoff',
    id: 'to-schools-vs-commute',
    L: { label: 'Better schools', dim: 'schools' },
    R: { label: 'Shorter commute', dim: 'walkable' },
  },
  {
    kind: 'tradeoff',
    id: 'to-walkable-vs-yard',
    L: { label: 'Walkable neighborhood', dim: 'walkable' },
    R: { label: 'Private yard', dim: 'outdoors' },
  },
  {
    kind: 'tradeoff',
    id: 'to-move-in-vs-space',
    L: { label: 'Move-in ready', dim: 'move_in' },
    R: { label: 'Room to grow', dim: 'space' },
  },
];

export const CHALLENGE_POOL: ChallengeCard[] = [
  {
    kind: 'challenge',
    id: 'ch-waterside-price',
    challengeKind: 'guess-price',
    listingId: 'waterside-5122',
    prompt: 'What does this Waterside home sell for?',
    options: [549000, 749000, 995000],
    correct: 749000,
    teach:
      'Waterside median is ~$685K; this one is on the higher end because of the screened porch and lot backing onto trails.',
    heroUrl:
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=70',
  },
  {
    kind: 'challenge',
    id: 'ch-durham-loft-price',
    challengeKind: 'guess-price',
    listingId: 'downtown-durham-318',
    prompt: 'What is this Downtown Durham loft?',
    options: [375000, 525000, 720000],
    correct: 525000,
    teach:
      'Downtown Durham lofts trade at ~$360/sqft — location premium over Chapel Hill single-family per-sqft.',
    heroUrl:
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=70',
  },
];
