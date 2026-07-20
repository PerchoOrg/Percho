/**
 * Scope strip state + ask-card catalogue.
 *
 * Hierarchical yes/no filters that ride above the feed. Ported from
 * `percho-prototypes/vibe/_data.js` (`window.ASK_POOL`, `generateFeed`).
 *
 * Semantics:
 *   - At most one chip per scope layer. Yes on a new ask replaces the
 *     prior chip on the same layer.
 *   - No (swipe left) on an ask card clears any prior chip on that layer.
 *   - Chips render in layer order (intent → region → state → metro →
 *     city → culture → style) so the strip reads left-to-right as a
 *     narrowing funnel.
 */

import type { AskCard, ScopeChip, ScopeLayer } from './types';

export const SCOPE_LAYERS: readonly ScopeLayer[] = [
  'intent',
  'region',
  'state',
  'metro',
  'city',
  'culture',
  'style',
] as const;

// ─── Ask-card catalogue ──────────────────────────────────────────────
// Ported verbatim from vibe/_data.js ASK_POOL. Kept in shared/ so both
// web and mobile show the same funnel; edits should stay in sync with
// SUBDIVISIONS trait dictionary in the mock data pool.

const ASK_POOL_RAW: Omit<AskCard, 'kind' | 'id'>[] = [
  // Intent
  { scopeType: 'intent', scopeValue: 'primary',    q: 'A place to live?',              sub: 'Primary home — schools, commute, community.',                            heroUrl: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70', chipLabel: '🏡 Primary' },
  { scopeType: 'intent', scopeValue: 'investment', q: 'Looking to invest?',            sub: 'Cash flow, cap rate, appreciation.',                                    heroUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900&q=70', chipLabel: '📈 Investment' },
  { scopeType: 'intent', scopeValue: 'vacation',   q: 'Weekend / vacation home?',      sub: 'Views, low upkeep, walk to fun.',                                       heroUrl: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=900&q=70', chipLabel: '🏖️ Vacation' },
  { scopeType: 'intent', scopeValue: 'relocation',q: 'Job relocation?',                sub: 'Commute to one specific office is the anchor.',                         heroUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&q=70', chipLabel: '💼 Relocation' },
  // Region
  { scopeType: 'region', scopeValue: 'sunbelt',    q: 'Sun Belt?',                     sub: 'NC · SC · GA · TX · FL · AZ — warm, growing.',                          heroUrl: 'https://images.unsplash.com/photo-1519999482648-25049ddd37b1?w=900&q=70', chipLabel: '☀️ Sun Belt' },
  { scopeType: 'region', scopeValue: 'west-coast', q: 'West Coast?',                   sub: 'CA · WA · OR — tech, ocean, fire risk.',                                heroUrl: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=900&q=70', chipLabel: '🌊 West Coast' },
  { scopeType: 'region', scopeValue: 'mountain',   q: 'Mountain West?',                sub: 'CO · UT · MT · ID · WY — outdoors, boomtowns.',                         heroUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=70', chipLabel: '🏔️ Mountain' },
  // Metro
  { scopeType: 'metro', scopeValue: 'atl',         q: 'Atlanta metro?',                sub: '6.1M · median $380K · film & F500 · notorious traffic.',                heroUrl: 'https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?w=900&q=70', chipLabel: '🍑 Atlanta' },
  { scopeType: 'metro', scopeValue: 'rtp',         q: 'Research Triangle (NC)?',       sub: 'Raleigh · Durham · Chapel Hill. Biotech, top schools.',                 heroUrl: 'https://images.unsplash.com/photo-1596496050755-c923e73e42e1?w=900&q=70', chipLabel: '🎓 RTP' },
  { scopeType: 'metro', scopeValue: 'char',        q: 'Charlotte metro?',              sub: 'Banking capital, fastest-growing East Coast metro.',                    heroUrl: 'https://images.unsplash.com/photo-1590756254933-2873d72a83b6?w=900&q=70', chipLabel: '🏦 Charlotte' },
  // Culture
  { scopeType: 'culture', scopeValue: 'trails',    q: 'Trail-runner life?',            sub: 'Greenway / national forest within 10 min. Bike to trails.',             heroUrl: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=70', chipLabel: '🥾 Trails' },
  { scopeType: 'culture', scopeValue: 'foodie',    q: 'Foodie city?',                  sub: 'James Beard density, farmers markets, walkable restaurants.',           heroUrl: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=70', chipLabel: '🍜 Foodie' },
  { scopeType: 'culture', scopeValue: 'asian',     q: 'Big Asian community?',          sub: 'Grocery, weekend school, boba, dim sum within 10 min.',                 heroUrl: 'https://images.unsplash.com/photo-1555921015-5532091f6026?w=900&q=70', chipLabel: '🥢 Asian' },
  // Style
  { scopeType: 'style', scopeValue: 'newbuild',    q: 'New construction only?',        sub: '2020+ builds. Modern layout, warranty, HOA usually.',                   heroUrl: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=70', chipLabel: '🔨 New build' },
  { scopeType: 'style', scopeValue: 'historic',    q: 'Historic / older home charm?',  sub: 'Pre-1960. Hardwood, character, ongoing maintenance.',                   heroUrl: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=70', chipLabel: '🕰️ Historic' },
];

export const ASK_POOL: AskCard[] = ASK_POOL_RAW.map((a) => ({
  kind: 'ask',
  id: `ask-${a.scopeType}-${a.scopeValue}`,
  ...a,
}));

/**
 * Yes on ask-card → pin chip (replacing any prior chip on same layer).
 */
export function scopeAcceptAsk(current: readonly ScopeChip[], ask: AskCard): ScopeChip[] {
  const chip: ScopeChip = {
    layer: ask.scopeType,
    value: ask.scopeValue,
    label: ask.chipLabel,
  };
  return sortByLayer([...current.filter((c) => c.layer !== ask.scopeType), chip]);
}

/**
 * No on ask-card → clear any chip on that layer (idempotent).
 */
export function scopeRejectAsk(current: readonly ScopeChip[], ask: AskCard): ScopeChip[] {
  return current.filter((c) => !(c.layer === ask.scopeType && c.value === ask.scopeValue));
}

/**
 * Manual chip removal from the scope strip × button.
 */
export function scopeRemoveLayer(
  current: readonly ScopeChip[],
  layer: ScopeLayer,
): ScopeChip[] {
  return current.filter((c) => c.layer !== layer);
}

export function hasLayer(current: readonly ScopeChip[], layer: ScopeLayer): boolean {
  return current.some((c) => c.layer === layer);
}

function sortByLayer(chips: ScopeChip[]): ScopeChip[] {
  const rank = new Map(SCOPE_LAYERS.map((l, i) => [l, i]));
  return [...chips].sort((a, b) => (rank.get(a.layer) ?? 99) - (rank.get(b.layer) ?? 99));
}
