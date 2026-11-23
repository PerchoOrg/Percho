/**
 * The block under the feed card (phase378) — one read of the ACTIVE CARD:
 * where the place is, the Map button's target, and up to three figures the
 * film cannot show.
 *
 *     Alpharetta · Fulton County          [Map]
 *     $747K          Top 1–7%        26 mi
 *     ZIP 30005 homes  schools nearby  north of Atlanta
 *
 * ── What this replaced, and why ─────────────────────────────────────────────
 *
 * `feed-header.ts` (phase183): the header ABOVE the card — a breadcrumb over
 * the card's name at 36pt with a chevron and the Map pill. Owner 2026-11-23:
 * "感觉还是以填充为主 信息本身也和卡片有重合". He was right on both counts: the
 * name was on the card 500pt below, the chevron opened the page Explore
 * opens, and on a city card the city was written three times. Only the
 * county / city and Map were not already on the card.
 *
 * So the name is said once, on the card, and what is left says what the card
 * does not. It sits UNDER the card (his pick, "方案2", off
 * `/demos/feed-above-card-v1`): the film starts at the top of the screen and
 * the place, Map and figures are one cluster with the name and Explore.
 *
 * ── The words come from the server ──────────────────────────────────────────
 *
 * `card.glance` is built by `/api/mobile/feed` from the place's stored profile
 * (`apps/web/lib/feed/glance.ts`), so a figure can be swapped or reworded
 * without an app release. A card with no glance — an older server, a listing —
 * still names its place from its own fields, and prints no figures. Same rule
 * as ever: every segment is REAL or absent, and nothing is guessed from an
 * address.
 *
 * ── Why the targets are DATA, not closures ──────────────────────────────────
 *
 * This directory is the pure, tested layer (no react / react-native / expo /
 * zustand anywhere in `lib/feed`). `feed.tsx` turns an id into a `router`
 * call, which is also what keeps the affordances honest: no map target, no
 * Map button; no page, and a figure is text.
 *
 * ── The Map button lands on the card's SUBJECT (owner, 2026-09-14) ──────────
 *
 * "clicking the map button should be redirected to that community or home on
 * map, not just the county area." A card that carries its own coordinates
 * yields `mapPoint`; `mapUnitId` is the fallback for one that does not, and
 * the city card's only (and correct) target.
 */
import type { GlanceCell } from "@percho/shared/glance";
import type { CommunityCardV3, FeedCardV3 } from "./card-types";
import type { GeoUnit } from "./geo-unit";
import { SCOPE_ROOT_LABEL } from "./place-stats";

/**
 * Which card the block is a read of. `empty` belongs to no card — the deck
 * has nothing in it — and carries NO text: 「加载出什么就显示什么 不要预测」
 * (owner, 2026-09-09). The rows keep their height, so nothing moves when the
 * text arrives.
 *
 * Carried for tests and for reading a model in the debugger; nothing
 * branches on it.
 */
export type PlaceBlockKind =
	| "home-tour"
	| "community-tour"
	| "city-tour"
	| "trade-off"
	| "empty";

/** A trade-off has no place and must not borrow one. */
const TRADEOFF_LEAD = "Your preferences";

export interface PlaceBlockModel {
	/** The card this block is a read of. `null` in the `empty` state. */
	activeCardId: string | null;
	kind: PlaceBlockKind;
	/** The place line's first, darker part: "Alpharetta". Empty = no text. */
	lead: string;
	/** Its second, lighter part: "Fulton County". Empty when there is none. */
	rest: string;
	/** The figures under the line, in the order drawn. Three at most. */
	cells: readonly GlanceCell[];
	/** The page a figure opens, or null — then the figures are text. */
	explore: { kind: "community" | "city"; slug: string } | null;
	/**
	 * A HOME's community overview, opened by the place line. Null on every
	 * card that is its own place: Explore, on the card, already goes there.
	 */
	placeSlug: string | null;
	/** What the Map button's label names. */
	mapName: string;
	/** Geo-unit id for `?focus=`, or null. The FALLBACK target — `mapPoint`
	 * wins when both exist; no Map button when both are null. */
	mapUnitId: string | null;
	/**
	 * The card's own point — a home's location, a community's centroid — or
	 * null. `kind` picks the landing zoom: a home is a single mark and wants
	 * the street, a community is a dot with a neighbourhood around it.
	 */
	mapPoint: { lat: number; lng: number; kind: "community" | "home" } | null;
}

export interface PlaceBlockInput {
	/** `deck[activeIndex]`. Undefined while the deck is empty. */
	card: FeedCardV3 | undefined;
	geoUnits: readonly GeoUnit[];
	communities: readonly CommunityCardV3[];
}

/**
 * `Gwinnett` → `Gwinnett County`, and undefined stays undefined. The column
 * is the bare name; without the word half the counties here read as towns
 * (Douglas, Henry, Newton, Walton are all also place names in this metro).
 */
function countySegment(county: string | undefined): string | undefined {
	return county === undefined || county === "" ? undefined : `${county} County`;
}

const present = (...segments: readonly (string | undefined)[]): string[] =>
	segments.filter((s): s is string => s !== undefined && s !== "");

const joined = (...segments: readonly (string | undefined)[]): string =>
	present(...segments).join(" · ");

/** The unit an id names, or undefined — an id the pool cannot resolve is no
 * more a map target than no id at all. */
function unitOf(
	id: string | undefined,
	units: readonly GeoUnit[],
): GeoUnit | undefined {
	return id === undefined ? undefined : units.find((u) => u.id === id);
}

/**
 * The community a listing's `communityId` names. Matched on id OR slug,
 * because the wire sends the SLUG (`apps/web/app/api/mobile/feed/route.ts`)
 * while a pool community's own `id` is the row's uuid.
 */
function communityOf(
	id: string | undefined,
	communities: readonly CommunityCardV3[],
): CommunityCardV3 | undefined {
	return id === undefined
		? undefined
		: communities.find((c) => c.id === id || c.slug === id);
}

const EMPTY: PlaceBlockModel = {
	activeCardId: null,
	kind: "empty",
	lead: "",
	rest: "",
	cells: [],
	explore: null,
	placeSlug: null,
	mapName: "",
	mapUnitId: null,
	mapPoint: null,
};

export function placeBlockModel({
	card,
	geoUnits,
	communities,
}: PlaceBlockInput): PlaceBlockModel {
	// No card, no claim.
	if (card === undefined) return EMPTY;

	switch (card.kind) {
		case "area": {
			// The card IS the city, so the line says where the city is. A city
			// can straddle two counties and the unit says neither — the server
			// names one from the city's own row, or the line is the metro's.
			const place = card.unit.glance?.place;
			return {
				...EMPTY,
				activeCardId: card.id,
				kind: "city-tour",
				lead: place?.lead ?? SCOPE_ROOT_LABEL,
				rest: place?.rest ?? "",
				cells: card.unit.glance?.cells ?? [],
				explore: card.unit.citySlug
					? { kind: "city", slug: card.unit.citySlug }
					: null,
				mapName: card.unit.name,
				// The unit IS the subject — a city has no tighter point to land on.
				mapUnitId: card.unit.id,
			};
		}

		case "community": {
			// The server's line, or the card's own city and county: a missing
			// level is dropped, not printed as an empty segment.
			const [lead = "", rest = ""] = card.glance
				? [card.glance.place.lead, card.glance.place.rest]
				: present(card.city, countySegment(card.county));
			return {
				...EMPTY,
				activeCardId: card.id,
				kind: "community-tour",
				lead,
				rest,
				cells: card.glance?.cells ?? [],
				explore: { kind: "community", slug: card.slug },
				mapName: card.name,
				mapUnitId: unitOf(card.geoUnitId, geoUnits)?.id ?? null,
				mapPoint:
					card.lat !== undefined && card.lng !== undefined
						? { lat: card.lat, lng: card.lng, kind: "community" }
						: null,
			};
		}

		case "listing": {
			const unit = unitOf(card.geoUnitId, geoUnits);
			const community = communityOf(card.communityId, communities);
			/**
			 * The line leads with the COMMUNITY, not the property: the card
			 * already carries the address and the price, and what it does NOT
			 * say is where the home sits.
			 *
			 * The card's own community fields first. The pool only carries
			 * communities with a cover photo — five of 16,504 under the phone's
			 * `videosOnly` — so `community` resolves for almost no home.
			 *
			 * `card.locality` ("Peachtree Corners, GA") is deliberately NOT
			 * parsed for a further fallback: splitting a formatted display
			 * string is how a line starts printing places that are not in the
			 * data.
			 */
			const communityName = card.communityName ?? community?.name;
			const county = countySegment(card.communityCounty ?? community?.county);
			return {
				...EMPTY,
				activeCardId: card.id,
				kind: "home-tour",
				lead: communityName ?? unit?.name ?? "",
				rest:
					unit === undefined
						? ""
						: communityName
							? joined(unit.name, county)
							: joined(county),
				// Only where there is a community we can NAME. An id with no name
				// behind it is a dangling reference, and `/community/<slug>`
				// would 404.
				placeSlug: communityName
					? (card.communityId ?? community?.slug ?? null)
					: null,
				mapName: communityName ?? unit?.name ?? "this home",
				mapUnitId: unit?.id ?? null,
				mapPoint:
					card.lat !== undefined && card.lng !== undefined
						? { lat: card.lat, lng: card.lng, kind: "home" }
						: null,
			};
		}

		case "tradeoff":
			// No place, no Map, no fabricated location. Its question and its
			// doors stay on the card.
			return {
				...EMPTY,
				activeCardId: card.id,
				kind: "trade-off",
				lead: TRADEOFF_LEAD,
			};
	}
}

/** The whole line for VoiceOver — it is one row and may be shrunk to fit. */
export function placeAccessibilityLabel(model: PlaceBlockModel): string {
	return model.rest === "" ? model.lead : `${model.lead}, ${model.rest}`;
}

/** The Map button's one label. Named after what the map actually shows. */
export function mapAccessibilityLabel(model: PlaceBlockModel): string {
	return `Show ${model.mapName} on the map`;
}

/** A figure and what it is a figure of, read as one phrase. */
export function cellAccessibilityLabel(cell: GlanceCell): string {
	return `${cell.value}, ${cell.label}`;
}
