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
import type { CardIconName, DimKey } from "@percho/shared";
import type { GeoBoundary, GeoLevel, GeoUnit } from "./geo-unit";

/**
 * Four-dimension neighborhood scores, as carried on a listing card.
 *
 * Declared here rather than imported from `apps/web/lib/feed/neighborhood-score`
 * on purpose: this directory is the PURE layer (see the file header) and must not
 * reach into the web app. The server computes; this is the wire shape.
 *
 * `score: null` means "no source for this dimension", NOT zero. Safety and
 * Potential are null today — there is no crime feed and no sold-price history in
 * the database — and the card renders those as an em dash.
 */
export type ScoreDimensionKey =
	| "safety"
	| "schools"
	| "convenience"
	| "potential";

export interface ScoreDimension {
	key: ScoreDimensionKey;
	label: string;
	score: number | null;
	count: number;
	nearestM?: number;
	reason?: string;
}

export interface NeighborhoodScores {
	/** Mean of the dimensions that have data, or null when none do. */
	overall: number | null;
	dims: readonly ScoreDimension[];
}

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
	/**
	 * Pre-rendered locality map tile (public Storage URL). Cached server-side so
	 * the card costs no Static Maps request per render and no API key ships in
	 * the JS bundle.
	 */
	mapUrl?: string;
	communityId?: string;
	/**
	 * "Peachtree Corners, GA" — the sub-line under the address.
	 *
	 * Part of the 2026-07-29 light-card redesign: the old dark foot showed
	 * address + bed/bath only, which the owner called 太单薄. Locality is the
	 * one fact a buyer reads immediately after the street and it costs nothing —
	 * the row was already selected server-side.
	 */
	locality?: string;
	/**
	 * Zip code, carried from the server's `listing.zip`. Merged with the
	 * address row on the card face ("355 Morgans Creek Ct · Kennesaw, GA 30144").
	 */
	zip?: string;
	/**
	 * The agent's own listing prose, paragraph-split. Fills the card's leftover
	 * height under the 1:1 media block (line-clamped to the measured space), so
	 * the card bottoms out flush instead of leaving the dead area the owner
	 * flagged. Absent when the row has no description — nothing is generated.
	 */
	description?: readonly string[];
	/**
	 * Four-dimension neighborhood scores for the card's score panel
	 * (2026-07-30, owner picked demo variant "C Editorial 环形").
	 *
	 * A dimension whose `score` is `null` has NO SOURCE — Safety and Potential
	 * are both null today — and renders as an em dash, never as a zero. See
	 * `apps/web/lib/feed/neighborhood-score.ts` for the full reasoning; the
	 * short version is that "we have no crime feed" and "this is a dangerous
	 * street" must not look the same on a listing card.
	 */
	scores?: NeighborhoodScores;
	/** The geo unit this listing sits in — a tease swipe credits it (§1.7). */
	geoUnitId?: string;
	matchScore?: number;
	dims?: readonly DimKey[];
	/**
	 * Photo count for the redline's "⊕ N Photos" hero pill. Server sends it only
	 * when the listing has more than one photo, so the pill never reads
	 * "1 Photos".
	 */
	photoCount?: number;
	/**
	 * §1.7 tease listing: the 1-per-10 preview shown in Stage 1–2. Likeable, but
	 * weighted 0.5× and the match badge is suppressed because the score is not
	 * yet trustworthy.
	 */
	tease?: true;
	/** Stage-3 preview inside an already-liked community; badge suppressed. */
	preview?: true;
}

/** One "why people love it" tile. Mirrors `CommunityReason` on the server. */
export interface CommunityReasonV3 {
	/** The attribute as residents left it on Nextdoor. Never paraphrased. */
	label: string;
	icon: CardIconName;
	/** Present only when a DB row is evidence for this specific reason. */
	fact?: string;
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
	/**
	 * The three "why people love it" tiles — what the card renders as of layout E
	 * (owner, 2026-08-02): the resident-stated `communities.attributes` VERBATIM,
	 * each with a glyph and sometimes one factual sub-line.
	 *
	 * Preferred over `dims`, which stays as the fallback. The difference is one of
	 * voice: `dims` are Percho's category labels ("Cultural Scene", "Outdoor
	 * Space") and a reason is the neighbour's own word ("Dog Friendly",
	 * "Peaceful"). 88.6% of feed-eligible communities yield three reasons.
	 *
	 * `fact` is absent on most tiles by design — a figure is attached only when a
	 * DB row is evidence for THAT reason, which is true for 42.8% of communities on
	 * exactly one of their three tiles. A fact-less tile is the canon 84pt tile, so
	 * the common case is not a degraded one. See `lib/feed/community-reasons.ts`.
	 */
	reasons?: readonly CommunityReasonV3[];
	/**
	 * The community's authored prose (`communities.description`), which the feed
	 * DTO has always sent as `blurb`.
	 *
	 * Fills the redline's subtitle slot under the place name ("Where quiet
	 * mornings meet vibrant weekends."). `CommunityFace` printed "City, ST" there
	 * instead, on a comment claiming no tagline field existed — the field was in
	 * the API response the whole time, just never parsed. 12/12 communities on the
	 * live feed carry one.
	 */
	blurb?: string;
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
