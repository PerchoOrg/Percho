/**
 * v3 feed card union — the 4 kinds the feed shows as of 2026-08-15.
 *
 * The owner cut the funnel down to the discovery surface: ask (purpose / life /
 * lifestyle / budget / geo), challenge, insight and milestone are gone. What
 * remains is what a buyer actually swipes through — area (city/zip), listing,
 * community, and trade-off.
 *
 * Parallel to `packages/shared/src/types.ts`, which stays as the contract for
 * the legacy web browse feed.
 *
 * PURITY: this directory imports nothing from react / react-native / expo /
 * zustand, so it lifts to `packages/shared` verbatim when the server-side
 * `generateDiscoveryFeed` lands. Type-only imports of the shared dim vocabulary
 * are erased at compile time and cost nothing at runtime.
 */
import type { CardIconName, DimKey } from "@percho/shared";
import type { GeoUnit } from "./geo-unit";

/**
 * The discovery funnel's stage. 2026-08-15: the ask/challenge/insight/milestone
 * cards were deleted, so the stage machine has no preference input left and the
 * feed is a single unlocked mix — stage is pinned at 4. Kept as a type because
 * search's "Your journey" strip reads it.
 */
export type FunnelStage = 4;

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

/**
 * The §1.2 layer-tag vocabulary, reduced to what still exists.
 *
 * `area` / `city` / `zip` / `community` are geographic and show the map thumb.
 * `purpose` / `life` / `lifestyle` were removed with their ask cards
 * (owner, 2026-08-15: 「把 your purpose card 先全部删掉」 + life 卡也删).
 */
export type FunnelLayer = "area" | "city" | "zip" | "community";

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
	area: "🧭 AREA",
	city: "🌆 CITY",
	zip: "📮 ZIP",
	community: "🏘 COMMUNITY",
};

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
	 */
	locality?: string;
	/**
	 * Zip code, carried from the server's `listing.zip`. Merged with the
	 * address row on the card face.
	 */
	zip?: string;
	/**
	 * The agent's own listing prose, paragraph-split. Fills the card's leftover
	 * height under the 1:1 media block (line-clamped to the measured space).
	 */
	description?: readonly string[];
	/**
	 * Four-dimension neighborhood scores for the card's score panel.
	 *
	 * A dimension whose `score` is `null` has NO SOURCE — Safety and Potential
	 * are both null today — and renders as an em dash, never as a zero.
	 */
	scores?: NeighborhoodScores;
	/** The geo unit this listing sits in — a swipe credits it. */
	geoUnitId?: string;
	matchScore?: number;
	dims?: readonly DimKey[];
	/**
	 * Photo count for the redline's "⊕ N Photos" hero pill. Server sends it only
	 * when the listing has more than one photo.
	 */
	photoCount?: number;
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
	 * The three "why people love it" tiles — the resident-stated
	 * `communities.attributes` VERBATIM, each with a glyph and sometimes one
	 * factual sub-line.
	 */
	reasons?: readonly CommunityReasonV3[];
	/**
	 * The community's authored prose (`communities.description`), which the feed
	 * DTO has always sent as `blurb`.
	 */
	blurb?: string;
}

// ─── Trade-off (§1.6) ───────────────────────────────────────────────

export interface TradeoffSideV3 {
	label: string;
	dim: DimKey;
	/**
	 * Icon override. `dim` usually picks the glyph, but two real trade-offs
	 * would collide without it: "Shorter commute" and "Walkable shops" both
	 * carry `dim: "walkable"` — one should draw a car, the other footprints.
	 */
	icon?: CardIconName;
}

export interface TradeoffCardV3 {
	kind: "tradeoff";
	id: string;
	left: TradeoffSideV3;
	right: TradeoffSideV3;
	scope: "life" | "property";
}

export type FeedCardV3 =
	| AreaCardV3
	| ListingCardV3
	| CommunityCardV3
	| TradeoffCardV3;

export type CardKindV3 = FeedCardV3["kind"];

export const CARD_KINDS: readonly CardKindV3[] = [
	"area",
	"listing",
	"community",
	"tradeoff",
] as const;

export type SwipeVerdict = "left" | "right";
