/**
 * Shared types between @percho/web and @percho/mobile.
 *
 * Keep this file minimal — only types that both surfaces consume via the
 * pagination API, feed cards, persona derivation, and scope strip.
 *
 * Anything web-only (Supabase Row types, Next.js response shapes, SSR
 * props) stays in @percho/web. Anything mobile-only (Expo asset URIs,
 * navigation params) stays in @percho/mobile.
 */

// ─── Trait vocabulary ────────────────────────────────────────────────
// Ported from vibe/_data.js. Trait values are 0-100 percentages.
// Keep the union closed so downstream code can exhaustively switch.

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

export type CardKind = 'community' | 'listing';

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
  matchScore?: number; // 0-100
}

export type FeedCard = CommunityCard | ListingCard;

// ─── Feed pagination API contract ────────────────────────────────────
// Shape returned by GET /api/browse/feed?offset=N&limit=M.
// See paginated-feed-and-swipe-ui skill for the pagination invariants.

export interface FeedPage {
  cards: FeedCard[];
  offset: number;
  limit: number;
  done: boolean;
}

// ─── Persona ─────────────────────────────────────────────────────────

export interface Persona {
  name: string;
  traits: TraitScores;
  count: number; // number of swipes weighted into this persona
}

// ─── Scope strip ─────────────────────────────────────────────────────
// Persistent user-declared filters that ride above the feed.

export type ScopeLayer = 'intent' | 'region' | 'metro' | 'culture';

export interface ScopeChip {
  layer: ScopeLayer;
  value: string;
  label: string;
}
