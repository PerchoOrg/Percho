/**
 * Rhythm engine — deterministic slot plan for the discovery feed.
 *
 * Ported from `percho-prototypes/discovery-v3-snapshot/_data.js`
 * `window.buildFeed`. Encodes the rules from docs/design/discovery-feed.md:
 *
 *   pos 0-2: pure preference (intent → region → state|metro) — hardcoded.
 *   pos 3-19: `PLAN` — interleaved listings/community/preference/tradeoff/
 *             challenge/insight per the fixed rhythm.
 *   pos 20+: `TAIL` — reshuffled loop (no more insights beyond pos 12).
 *
 * Tradeoff never before pos 4 (card 5). Challenge ≤10%.
 */

export type SlotKind =
  | 'listing'
  | 'community'
  | 'preference'
  | 'tradeoff'
  | 'challenge'
  | 'insight';

// Positions 3..19 (17 slots).
const PLAN: readonly SlotKind[] = [
  'listing',
  'community',
  'preference', // 4, 5, 6
  'tradeoff',
  'listing',
  'challenge', // 7, 8, 9
  'listing',
  'community',
  'insight', // 10, 11, 12
  'preference',
  'listing',
  'tradeoff', // 13, 14, 15
  'listing',
  'community',
  'challenge', // 16, 17, 18
  'listing',
  'listing', // 19, 20
] as const;

// Position 20+ wrap. Matches the web tail — no more insights beyond pos 12.
const TAIL: readonly SlotKind[] = [
  'listing',
  'preference',
  'listing',
  'community',
  'tradeoff',
  'listing',
  'challenge',
  'listing',
  'community',
  'listing',
  'preference',
  'listing',
  'tradeoff',
  'listing',
  'community',
  'listing',
  'preference',
  'listing',
  'listing',
  'challenge',
] as const;

export const RHYTHM_PLAN = PLAN;
export const RHYTHM_TAIL = TAIL;

/**
 * Slot kind for a display position (0-indexed).
 *   0-2 → 'preference' (the 3-card front-loaded funnel)
 *   3..19 → PLAN[position - 3]
 *   20+ → TAIL[(position - 20) % TAIL.length]
 */
export function slotAt(position: number): SlotKind {
  if (position < 3) return 'preference';
  const planIdx = position - 3;
  if (planIdx < PLAN.length) return PLAN[planIdx] as SlotKind;
  const tailIdx = (position - (3 + PLAN.length)) % TAIL.length;
  return TAIL[tailIdx] as SlotKind;
}
