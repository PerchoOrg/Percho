/**
 * The above-card header's model — one coherent read of the ACTIVE CARD
 * (phase183, the owner's "above-card header" handoff + `percho-header-
 * redlines.svg`, map control **B**).
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * `lib/feed/place-trail.ts` (phase182) gave the header line the top card's
 * parent chain and left the card itself as the chain's unwritten last link.
 * The handoff writes that link: the header's TITLE is the place the card is
 * about — the community for a home tour, the community for a community tour,
 * the city for a city card — and everything above it becomes the context row:
 *
 *     Atlanta metro › Canton          ← context, 13/18
 *     River Green ›            [Map]  ← title, big serif, + the map control
 *
 * So the parent chain and the leaf are computed together, here, and the
 * component draws three rows from one object. Same rule as before: every
 * segment is REAL or absent (the `GeoStats` rule) — a card with no place at
 * all says "Explore this home" with an empty (but full-height) context row,
 * and nothing is ever guessed from an address.
 *
 * ── Line one is metro › county › city (owner, 2026-09-07) ───────────────────
 *
 * 「对于community card 在area后加一个county 然后再city」. A county sits between
 * the metro and the city wherever the card has one:
 *
 *     Atlanta metro › Gwinnett County › Duluth
 *     Berkeley Woods
 *
 * That is not decoration. In this metro the county names the school district
 * and the tax rate, so it is the segment a buyer actually acts on — and it
 * gives line one content of its own, which is what the owner was reacting to:
 * before the county, the only real thing on that line was the city, and the
 * cards where line two IS the city (a city card, a home with no community, a
 * Nextdoor neighbourhood named after its town) printed it twice.
 *
 * A city card still has no county — a city can straddle two (Atlanta is in
 * Fulton and DeKalb) and no row says which, so it keeps metro › city and the
 * `GeoStats` rule holds: real or absent, never guessed.
 *
 * The 「show city twice for now」 case is gone on its own: phase189 linked
 * every listing to a community, so a home tour's line two is the community
 * and line one is its county and city.
 *
 * ── Why the targets are DATA, not closures ──────────────────────────────────
 *
 * `titleSlug` / `mapUnitId` are ids, not `onPress` handlers, for the same
 * reason `SideMatch` in `card-types.ts` is data: this directory is the pure,
 * tested layer (no react / react-native / expo / zustand anywhere in
 * `lib/feed`), and the §5 mapping rules — which title, which destination,
 * when neither exists — are exactly what deserves a unit test. `feed.tsx`
 * turns an id into a `router` call and passes the header the handler, which
 * is also what makes the affordances honest: no slug, no chevron; no unit,
 * no Map button.
 *
 * ── The two existing destinations, and nothing new ──────────────────────────
 *
 *   title → `/community/[slug]`, the community overview the card's
 *           `Explore →` already opens.
 *   Map   → `/(tabs)/search?focus=<geoUnitId>`, the Search tab's map, which
 *           flies to the unit's centroid. That param resolves GEO UNITS only
 *           (see `app/(tabs)/search.tsx`), so the map lands on the card's
 *           CITY — the home's community context, per the handoff's own words
 *           for the home-tour row. No new map surface, no geocoding call.
 */
import type { CommunityCardV3, FeedCardV3 } from "./card-types";
import type { GeoUnit } from "./geo-unit";
import { SCOPE_ROOT_LABEL } from "./place-stats";

/**
 * Which header the active card gets.
 *
 * The handoff names three; the feed has FOUR card kinds (`card-types.ts`),
 * and an `area` card — the CITY card, which plays a city film — is as much a
 * tour as the other two. It gets the same geometry and a `CITY TOUR` label
 * rather than an exception in the layout.
 *
 * `scope` is the fifth state and belongs to no card: the deck is empty
 * (first load, or exhausted). The header still has to say where the buyer is
 * looking, so it falls back to the picked scope — which is also what keeps
 * the scope sheet reachable while the skeleton is on screen.
 */
export type FeedHeaderKind =
	| "home-tour"
	| "community-tour"
	| "city-tour"
	| "trade-off"
	| "scope";

/**
 * The general trade-off's two fixed strings.
 *
 * The only header content in the app that comes from no row: a trade-off has
 * no place, and the handoff is explicit that it must not borrow one or grow a
 * decorative replacement for the missing Map button. Its question and its
 * doors stay on the card.
 */
const TRADEOFF_CONTEXT = "Your preferences";
const TRADEOFF_TITLE = "Find your balance";

/** A home with neither a community nor a city the pool can resolve. */
const PLACELESS_HOME_TITLE = "Explore this home";

export interface FeedHeaderModel {
	/** The card this header is a read of. `null` in the `scope` fallback. */
	activeCardId: string | null;
	/**
	 * Which header this is. Carried for the component's one behavioural
	 * branch (a trade-off's context row is not the scope control) — NOT for a
	 * label: the uppercase HOME TOUR / COMMUNITY TOUR / TRADE-OFF row was
	 * removed on 2026-09-07 at the owner's request 「Remove the community, home
	 * and tradeoff text from header」. The card's own badge already says what
	 * kind of card it is.
	 */
	kind: FeedHeaderKind;
	/**
	 * `Atlanta metro › Gwinnett County › Duluth`. Empty string = draw the row,
	 * draw no text.
	 */
	contextText: string;
	title: string;
	/** Community slug for `/community/[slug]`, or null — no chevron then. */
	titleSlug: string | null;
	/** Geo-unit id for `?focus=`, or null — no Map button then. */
	mapUnitId: string | null;
}

export interface FeedHeaderInput {
	/** `deck[activeIndex]`. Undefined while the deck is empty. */
	card: FeedCardV3 | undefined;
	geoUnits: readonly GeoUnit[];
	communities: readonly CommunityCardV3[];
	/** The picked scope's name, or null for the whole metro. */
	scopeName: string | null;
	scopedUnitId: string | null;
}

/** `Atlanta metro › Canton` from the segments BELOW the metro. */
function context(...segments: readonly (string | undefined)[]): string {
	const real = segments.filter((s): s is string => s !== undefined && s !== "");
	return [SCOPE_ROOT_LABEL, ...real].join(" › ");
}

/**
 * `Gwinnett` → `Gwinnett County`, and undefined stays undefined.
 *
 * The column is the bare name; the word belongs to the display, and without
 * it half the counties here read as towns (Douglas, Henry, Newton, Walton are
 * all also place names in this metro).
 */
function countySegment(county: string | undefined): string | undefined {
	return county === undefined || county === "" ? undefined : `${county} County`;
}

/** The unit an id names, or undefined — an id the pool cannot resolve is no
 * more a map target than no id at all. */
function unitOf(
	id: string | undefined,
	units: readonly GeoUnit[],
): GeoUnit | undefined {
	return id === undefined ? undefined : units.find((u) => u.id === id);
}

/**
 * The community a listing's `communityId` names.
 *
 * Matched on id OR slug, because the wire sends the SLUG: the mobile feed
 * route sets `communityId: card.community.slug`
 * (`apps/web/app/api/mobile/feed/route.ts`) while a pool community's own `id`
 * is the row's uuid. `place-trail.ts` compared against `id` alone, so the
 * community link could never appear on a home's chain — the same fix the
 * server already carries for liked-community ids.
 */
function communityOf(
	id: string | undefined,
	communities: readonly CommunityCardV3[],
): CommunityCardV3 | undefined {
	return id === undefined
		? undefined
		: communities.find((c) => c.id === id || c.slug === id);
}

export function feedHeaderModel({
	card,
	geoUnits,
	communities,
	scopeName,
	scopedUnitId,
}: FeedHeaderInput): FeedHeaderModel {
	if (card === undefined) {
		// No card: the header says where the buyer is looking. Unscoped, the
		// metro IS the place and must not also precede itself in the context.
		return {
			activeCardId: null,
			kind: "scope",
			contextText: scopeName ? context(scopeName) : "",
			title: scopeName ?? SCOPE_ROOT_LABEL,
			titleSlug: null,
			mapUnitId: unitOf(scopedUnitId ?? undefined, geoUnits)?.id ?? null,
		};
	}

	switch (card.kind) {
		case "area":
			// The card IS the city. No city overview page exists in the app, so
			// the title carries no chevron — the Map button is the only thing a
			// city can open, and it opens the unit the card was built FROM
			// (carried on the card, so it needs no lookup to be real).
			return {
				activeCardId: card.id,
				kind: "city-tour",
				contextText: context(card.unit.name),
				title: card.unit.name,
				titleSlug: null,
				mapUnitId: card.unit.id,
			};

		case "community":
			return {
				activeCardId: card.id,
				kind: "community-tour",
				contextText: context(countySegment(card.county), card.city),
				title: card.name,
				titleSlug: card.slug,
				mapUnitId: unitOf(card.geoUnitId, geoUnits)?.id ?? null,
			};

		case "listing": {
			const unit = unitOf(card.geoUnitId, geoUnits);
			const community = communityOf(card.communityId, communities);
			/**
			 * The title names the COMMUNITY, not the property: the finalized
			 * card already carries the address and the price, and what it does
			 * NOT say is where the home sits.
			 *
			 * `listings.community_id` is still almost entirely unpopulated
			 * (`apps/web/lib/feed/listing-gate.ts`), so the city fallback is
			 * the common case today — the city on BOTH lines, per the owner's
			 * call (see the file header) — and the community appears with no
			 * client change once the backfill lands. `card.locality`
			 * ("Peachtree Corners, GA") is deliberately NOT parsed for a third
			 * fallback: splitting a formatted display string is how a header
			 * starts printing places that are not in the data.
			 */
			return {
				activeCardId: card.id,
				kind: "home-tour",
				contextText:
					unit !== undefined
						? context(countySegment(community?.county), unit.name)
						: "",
				title: community?.name ?? unit?.name ?? PLACELESS_HOME_TITLE,
				titleSlug: community?.slug ?? null,
				mapUnitId: unit?.id ?? null,
			};
		}

		case "tradeoff":
			// No place, no Map, no fabricated location (handoff §5).
			return {
				activeCardId: card.id,
				kind: "trade-off",
				contextText: TRADEOFF_CONTEXT,
				title: TRADEOFF_TITLE,
				titleSlug: null,
				mapUnitId: null,
			};
	}
}

/**
 * What VoiceOver reads for the title, and what the truncated rows cost.
 *
 * The context row and the title are both one line with end ellipsis, so on a
 * narrow screen the visible text is not the whole text. The label carries
 * both in full — the handoff's §6 rule that "the full text remains available
 * in the accessibility label".
 */
export function titleAccessibilityLabel(model: FeedHeaderModel): string {
	if (model.contextText === "") return model.title;
	// The city fallback puts the same word on both lines; read it once.
	if (model.contextText.endsWith(model.title)) return model.contextText;
	return `${model.title}, ${model.contextText}`;
}

/** The Map button's one label. Named after what the map actually shows. */
export function mapAccessibilityLabel(model: FeedHeaderModel): string {
	return `Show ${model.title} on the map`;
}
