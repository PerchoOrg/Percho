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
import type { CardIconName } from "@percho/shared/icons";
import type { DimKey } from "@percho/shared/types";
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
	/**
	 * The price as a NUMBER, alongside `priceLabel`. The server has always sent
	 * it; the client started reading it for the trade-off card's median, which
	 * cannot be computed from a formatted string without re-parsing it.
	 */
	price?: number;
	/**
	 * The three structured axes the v2 trade-off bank measures against
	 * (`SideMatch`). Sent alongside the formatted `bedBathSqft` because a
	 * predicate cannot re-parse a display string, and because the same numbers
	 * decide the card's homes-count and median.
	 *
	 * Every one is optional: a listing with no `sqft` simply falls on neither
	 * side of a size question rather than defaulting onto one.
	 */
	yearBuilt?: number;
	sqft?: number;
	beds?: number;
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

/**
 * One lifestyle signal and the glyph it wears. The glyph is chosen server-side
 * next to the phrase table (`apps/web/lib/feed/community-signals.ts`), same
 * rule as the reason tiles.
 *
 * `icon` is often ABSENT and that is not a defect: the shipped font is a
 * 14-glyph subset and several real signals ("Lake nearby", "Golf nearby") have
 * no honest match. The card skips those rather than borrowing a wrong glyph.
 */
export interface CommunitySignalV3 {
	label: string;
	icon?: CardIconName;
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
	 * The chip row's 2-3 distinctive lifestyle signals, computed per community
	 * by the server (`apps/web/lib/feed/community-signals.ts`): "Mature
	 * trees", "3 parks nearby", "Quiet streets". Never generic category words
	 * (Restaurants / Walkability / Trees).
	 */
	signals?: readonly CommunitySignalV3[];
	/**
	 * One entry per PLACE in the attached tour, in play order, for the card's
	 * dashed progress bar (owner 2026-08-22: "make it dotted line and each
	 * represents a specific content").
	 *
	 * `endFraction` is where that place's stretch ENDS as a fraction of the
	 * finished film, so a dash's share of the bar is its own end minus the
	 * previous one's. Built server-side in `lib/feed/tour-segments.ts` — the
	 * clip durations it is derived from overlap by a crossfade, which is not
	 * arithmetic the card should be doing.
	 *
	 * Absent whenever the video did not come from a tour assembly; the card
	 * draws a plain continuous bar then.
	 *
	 * `distance` is how far the place is from the community ("0 mi" for its own
	 * amenities), absent when unknown. Since phase174 these entries also drive
	 * the card's place LABEL, not just the bar — the render worker used to burn
	 * that label into the film and no longer does.
	 */
	tourSegments?: readonly {
		name: string;
		endFraction: number;
		distance?: string;
	}[];
}

// ─── Trade-off (§1.6) ───────────────────────────────────────────────

/** One photograph on a trade-off door. */
export interface DoorPhoto {
	url: string;
	/**
	 * The vision tagger's factual sentence for THIS frame — "Modern kitchen with
	 * white cabinetry, stainless appliances, and center island".
	 *
	 * Rendered only when the door shows exactly ONE photo. With three on screen
	 * a single sentence reads as describing all of them, which it does not: it
	 * is trustworthy precisely because it describes one frame.
	 */
	caption?: string;
}

/**
 * Which of the eight themes a question belongs to. Used for pacing — the deck
 * opens with the themes a photograph can settle and saves money and timing for
 * a buyer who has already answered a couple.
 */
export type TradeoffTheme =
	| "era"
	| "layout"
	| "spare-room"
	| "land"
	| "location"
	| "money"
	| "daily"
	| "timing";

/**
 * How to test one pool listing against one side of a question.
 *
 * Declared only where the pool can actually decide it today (owner 2026-08-29:
 * 「if data is ready then use them, if not, just the questions themselves are
 * fine」). A side with no `match` still asks its question — it simply shows no
 * count and no median, and its door stays unlit unless a `dim` lights it.
 *
 * Deliberately DATA, not a closure: `content.ts` has to stay a plain table that
 * can be read, diffed and eventually served from the database, and closures
 * would also break the engine's purity guarantee.
 */
export type SideMatch =
	| { field: "yearBuilt"; op: "gte" | "lte"; value: number }
	| { field: "beds"; op: "gte" | "lte"; value: number }
	| {
			field: "sqft" | "price" | "sqftPerBed";
			op: "aboveMedian" | "belowMedian";
	  };

/** One photograph on a trade-off door. */
export interface DoorPhoto {
	url: string;
	/**
	 * The vision tagger's factual sentence for THIS frame — "Modern kitchen with
	 * white cabinetry, stainless appliances, and center island".
	 *
	 * Rendered only when the door shows exactly ONE photo. With three on screen
	 * a single sentence reads as describing all of them, which it does not: it
	 * is trustworthy precisely because it describes one frame.
	 */
	caption?: string;
}

export interface TradeoffSideV3 {
	/** What the door says. 2-4 words — it is a headline, not a sentence. */
	label: string;
	/** One quiet line under it. Always present: an unlit door needs it. */
	support: string;
	/** The glyph for an unlit door. */
	icon?: CardIconName;
	/**
	 * The preference dimension this side boosts on a vote, and the key its
	 * photographs are looked up under. Optional since the v2 bank: most of the
	 * 32 questions are about a MEASURABLE property of the house, not one of the
	 * eleven lifestyle dims, and forcing a dim onto them would record a
	 * preference the buyer never expressed.
	 */
	dim?: DimKey;
	/** How to test a pool listing against this side. Absent = no data yet. */
	match?: SideMatch;

	/**
	 * What this door shows: up to three DETAIL photos, never a listing hero
	 * (owner, 2026-08-29 — a front-elevation shot cannot say "move-in ready").
	 *
	 * Three, and from three different homes, because one photograph makes the
	 * door a claim about that kitchen — its cabinets, its light, its staging —
	 * while three make it a claim about KITCHENS, which is what a dimension is.
	 *
	 * Resolved by `lightSide` in `generate-feed.ts`. Empty when neither a dim
	 * photo set nor a community hero exists, and the door renders its unlit
	 * field rather than an unrelated picture.
	 */
	photos?: readonly DoorPhoto[];
	/** How many homes in the loaded pool fall on this side. */
	homes?: number;
	/** Their median price, pre-formatted ("$342,000"). Absent under 3 homes. */
	medianLabel?: string;
}

export interface TradeoffCardV3 {
	kind: "tradeoff";
	id: string;
	theme: TradeoffTheme;
	/**
	 * What the axis is, for the one-question-per-axis rule. Two questions that
	 * share an axis are never both asked in a session — a buyer who has said
	 * "another bedroom" learns nothing new from "room to spread out", and being
	 * asked twice about the same thing reads as an interrogation.
	 */
	axis: string;
	/**
	 * The card's headline, per question. Replaces the single fixed "What matters
	 * more to you?" the card carried while there were seven questions: with 32,
	 * a generic prompt wastes the one line the buyer definitely reads.
	 */
	prompt: string;
	left: TradeoffSideV3;
	right: TradeoffSideV3;
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
