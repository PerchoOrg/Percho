/**
 * v3 feed card union — the 8 kinds of `01-feed.md` §1.1.
 *
 * Parallel to `packages/shared/src/types.ts`, which stays as the contract for
 * the legacy web browse feed. The v3 shapes differ enough (funnel layers, geo
 * units, tease listings, milestones) that widening the shared union would make
 * every web consumer handle kinds it will never see.
 *
 * PURITY: this directory imports nothing from react / react-native / expo /
 * zustand, so it lifts to `packages/shared` verbatim when the server-side
 * `generateDiscoveryFeed` lands (05 §5.6 item 4). Type-only imports of the
 * shared dim vocabulary are erased at compile time and cost nothing at runtime.
 */
import type { DimKey } from "@percho/shared";
import type { GeoBoundary, GeoLevel, GeoUnit } from "./geo-unit";

/** §0.2. Declared here (the pure layer) and re-exported by `state/funnel.ts`. */
export type FunnelStage = 0 | 1 | 2 | 3 | 4;

/**
 * The §1.2 layer-tag vocabulary. `purpose` / `life` / `lifestyle` are
 * preference layers; `area` / `city` / `zip` / `community` are geographic and
 * are the only ones that show the 58×58 map thumb.
 */
export type FunnelLayer =
	| "purpose"
	| "life"
	| "area"
	| "city"
	| "zip"
	| "community"
	| "lifestyle";

export const GEO_LAYERS: readonly FunnelLayer[] = [
	"area",
	"city",
	"zip",
	"community",
] as const;

export function isGeoLayer(layer: FunnelLayer): boolean {
	return GEO_LAYERS.includes(layer);
}

/** §1.2 layer tags, verbatim. */
export const LAYER_TAG: Record<FunnelLayer, string> = {
	purpose: "🎯 YOUR PURPOSE",
	life: "🌱 YOUR LIFE",
	area: "🧭 AREA",
	city: "🌆 CITY",
	zip: "📮 ZIP",
	community: "🏘 COMMUNITY",
	lifestyle: "🎭 LIFESTYLE",
};

// ─── Ask (§1.2) ─────────────────────────────────────────────────────

/**
 * A budget band captured by binary splits, never a slider or picker (§1.7
 * "budget band" + the no-picker iron law). An open end is `undefined`, which is
 * why both bounds are optional: "under $500K" has no floor.
 */
export interface BudgetBand {
	minUsd?: number;
	maxUsd?: number;
}

/** What a swipe on an ask card records. One per side of the card. */
export type AskRecord =
	| { type: "intent"; value: string }
	| { type: "budget"; band: BudgetBand }
	| { type: "dim"; dim: DimKey }
	| { type: "geo"; unitId: string; level: GeoLevel };

/**
 * Ask cards come in two forms and the difference is user-visible: yes/no shows
 * the red/green hints, either-or replaces both hints with the option names and
 * is forbidden from showing ✓/✗ (§1.2 #3).
 */
export type AskChoice =
	| { form: "yes-no"; affirm: AskRecord }
	| {
			form: "either-or";
			left: { label: string; record: AskRecord };
			right: { label: string; record: AskRecord };
	  };

export interface AskCardV3 {
	kind: "ask";
	id: string;
	layer: FunnelLayer;
	q: string;
	sub?: string;
	heroUrl?: string;
	/** Geo layers only (§1.2 #2) — drives the 58×58 map thumb. */
	geo?: { unitId: string; level: GeoLevel; boundary?: GeoBoundary };
	choice: AskChoice;
}

// ─── Area (§1.3) — one card kind for all three granularities ────────

export interface AreaCardV3 {
	kind: "area";
	id: string;
	unit: GeoUnit;
	/** Real editorial vibe line, or absent. Never generated to fill space. */
	vibe?: string;
}

// ─── Listing / Community front faces (§1.4) ─────────────────────────

export interface ListingCardV3 {
	kind: "listing";
	id: string;
	slug: string;
	address: string;
	priceLabel: string;
	bedBathSqft: string;
	heroUrl: string;
	videoUrl?: string;
	/**
	 * Listing coordinates, for the card's locality map thumbnail (2026-07-28
	 * structure change). Optional: external imports without geocoding simply
	 * render no map.
	 */
	lat?: number;
	lng?: number;
	communityId?: string;
	/** The geo unit this listing sits in — a tease swipe credits it (§1.7). */
	geoUnitId?: string;
	matchScore?: number;
	dims?: readonly DimKey[];
	/**
	 * §1.7 tease listing: the 1-per-10 preview shown in Stage 1–2. Likeable, but
	 * weighted 0.5× and the match badge is suppressed because the score is not
	 * yet trustworthy.
	 */
	tease?: true;
	/** Stage-3 preview inside an already-liked community; badge suppressed. */
	preview?: true;
}

export interface CommunityCardV3 {
	kind: "community";
	id: string;
	slug: string;
	name: string;
	city: string;
	state: string;
	heroUrl: string;
	videoUrl?: string;
	geoUnitId?: string;
	priceLabel?: string;
	homes?: number;
	pills?: readonly string[];
	dims?: readonly DimKey[];
}

// ─── Trade-off / Challenge / Insight (§1.6) ─────────────────────────

export interface TradeoffSideV3 {
	label: string;
	dim: DimKey;
}

export interface TradeoffCardV3 {
	kind: "tradeoff";
	id: string;
	left: TradeoffSideV3;
	right: TradeoffSideV3;
	/** Stage 0–2 lean geo/life; Stage 3+ lean property attributes (§1.6). */
	scope: "life" | "property";
}

export interface ChallengeCardV3 {
	kind: "challenge";
	id: string;
	/** e.g. "🎲 GUESS THE PRICE". */
	tag: string;
	q: string;
	sub?: string;
	heroUrl?: string;
	left: { label: string; value: number };
	right: { label: string; value: number };
	/** Which side is right; drives the ✓/✗ colour pulse inside the reveal. */
	answer: "left" | "right";
	/** The real number shown on reveal, e.g. "$712,000 — you were close!". */
	revealLabel: string;
	teach: string;
	/**
	 * The listing this question was built from — the target of the reveal's
	 * `Explore →`. Always present in practice (`challengeFromListing` is the only
	 * constructor), but optional so a future non-listing challenge kind isn't
	 * forced to invent one.
	 */
	listingId?: string;
}

export interface InsightCardV3 {
	kind: "insight";
	id: string;
	dim: DimKey;
	text: string;
	/** Must quote concrete evidence numbers (§1.6 "Insight 触发"). */
	evidence: string;
}

// ─── Milestone (§1.5) ───────────────────────────────────────────────

export interface MilestoneCardV3 {
	kind: "milestone";
	id: string;
	fromStage: FunnelStage;
	toStage: FunnelStage;
	headline: string;
	sub: string;
	/** Recap of confirmed scope — real signals only, never a projection. */
	chips: readonly string[];
}

export type FeedCardV3 =
	| AskCardV3
	| AreaCardV3
	| ListingCardV3
	| CommunityCardV3
	| TradeoffCardV3
	| ChallengeCardV3
	| InsightCardV3
	| MilestoneCardV3;

export type CardKindV3 = FeedCardV3["kind"];

export const CARD_KINDS: readonly CardKindV3[] = [
	"ask",
	"area",
	"listing",
	"community",
	"tradeoff",
	"challenge",
	"insight",
	"milestone",
] as const;

export type SwipeVerdict = "left" | "right";
