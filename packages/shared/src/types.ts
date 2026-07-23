/**
 * Shared types between @percho/web and @percho/mobile.
 *
 * Keep this file minimal — only types that both surfaces consume via the
 * pagination API, feed cards, persona derivation, and scope strip.
 */

// ─── Trait vocabulary ────────────────────────────────────────────────
// Ported from vibe/_data.js. Trait values are 0-100 percentages.

export type TraitKey =
  | 'family'
  | 'walkable'
  | 'quiet'
  | 'hip'
  | 'schools'
  | 'green'
  | 'nightlife'
  | 'commute';

export type TraitScores = Partial<Record<TraitKey, number>>;

// ─── Feed cards ──────────────────────────────────────────────────────

export type CardKind =
  | 'community'
  | 'listing'
  | 'ask'
  | 'tradeoff'
  | 'challenge'
  | 'insight';

// ─── Dimensions (evidence vocabulary) ────────────────────────────────
// 11 dims ported from `percho-prototypes/discovery-v3-snapshot/_data.js`
// `window.DIMS`. Listings, communities, tradeoffs, and asks tag against
// these; the evidence profile is per-dim counters (see EvidenceProfile).
export type DimKey =
  | 'outdoors'
  | 'walkable'
  | 'schools'
  | 'quiet'
  | 'hip'
  | 'entertaining'
  | 'trails'
  | 'nightlife'
  | 'family'
  | 'move_in'
  | 'space';

export interface EvidenceEntry {
  dim: DimKey;
  count: number;
}

// Ordered by count desc when queried; unordered here.
export type EvidenceProfile = EvidenceEntry[];

export interface CommunityCard {
  kind: 'community';
  id: string;
  name: string;
  city: string;
  heroUrl: string;
  videoUrl?: string;
  tags: string[];
  stats: {
    median: string;
    homes: number;
    vibe: string;
  };
  traits: TraitScores;
  dims?: DimKey[];
  hook?: string;
}

export interface ListingCard {
  kind: 'listing';
  id: string;
  slug: string;
  address: string;
  priceLabel: string;
  bedBathSqft: string;
  heroUrl: string;
  videoUrl?: string;
  communityId?: string;
  matchScore?: number;
  dims?: DimKey[];
  hook?: string;
}

// Ask-card = one yes/no question injected inline in the feed to collect
// scope signal (intent/region/metro/culture). Swipe right = yes (chip
// pinned to scope strip), swipe left = no (chip cleared for that layer).
export type ScopeLayer =
  | 'intent'
  | 'region'
  | 'state'
  | 'metro'
  | 'city'
  | 'culture'
  | 'style';

export interface AskCard {
  kind: 'ask';
  id: string; // stable id for dedupe (e.g. "ask-intent-primary")
  scopeType: ScopeLayer;
  scopeValue: string; // e.g. "primary", "atl", "trails"
  q: string;
  sub: string;
  heroUrl: string;
  chipLabel: string; // e.g. "🏡 Primary"
}

export type FeedCard =
  | CommunityCard
  | ListingCard
  | AskCard
  | TradeoffCard
  | ChallengeCard
  | InsightCard;

// ─── Tradeoff / Challenge / Insight cards ────────────────────────────
// Ported from _data.js TRADEOFF_POOL, CHALLENGE_POOL, buildFeed insight.

export interface TradeoffSide {
  label: string;
  dim: DimKey;
}

export interface TradeoffCard {
  kind: 'tradeoff';
  id: string;
  L: TradeoffSide;
  R: TradeoffSide;
}

export interface ChallengeCard {
  kind: 'challenge';
  id: string;
  challengeKind: 'guess-price';
  listingId: string;
  prompt: string;
  options: number[];
  correct: number;
  teach: string;
  heroUrl?: string;
}

// Insight cards are computed at feed-render time from the profile — the
// dim/text/evidence line come from pickInsight(). Kept as a card so the
// rhythm engine can slot it.
export interface InsightCard {
  kind: 'insight';
  id: string;
  dim: DimKey;
  text: string;
  evidence: string;
}

// ─── Feed pagination API contract ────────────────────────────────────

export interface FeedPage {
  cards: FeedCard[];
  offset: number;
  limit: number;
  done: boolean;
}

// ─── Persona ─────────────────────────────────────────────────────────

export interface Persona {
  name: string;
  desc: string;
  traits: TraitScores;
  count: number;
}

// ─── Scope strip ─────────────────────────────────────────────────────

export interface ScopeChip {
  layer: ScopeLayer;
  value: string;
  label: string;
}
