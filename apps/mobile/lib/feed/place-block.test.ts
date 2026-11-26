/**
 * The place block's model (phase378), as tests.
 *
 * Everything the block decides lives here rather than in the component, which
 * is what makes these assertable: the mobile vitest suite runs no React Native
 * runtime (`vitest.config.ts`), so a rule that lives in JSX can only be
 * checked as source text. The rules worth pinning are all about honesty —
 * which place the line names, that the card's own name is NOT said again, and
 * when an affordance must not appear.
 */
import type { PlaceGlance } from "@percho/shared/glance";
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	CommunityCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import type { GeoUnit } from "./geo-unit";
import {
	type PlaceBlockInput,
	cellAccessibilityLabel,
	mapAccessibilityLabel,
	placeAccessibilityLabel,
	placeBlockModel,
} from "./place-block";

const CANTON: GeoUnit = {
	id: "city:canton-ga",
	level: "city",
	name: "Canton",
	state: "GA",
	centroid: { lat: 34.2, lng: -84.5 },
	communityCount: 188,
	sampleCommunityNames: [],
	stats: {},
};

const RIVER_GREEN: CommunityCardV3 = {
	kind: "community",
	id: "6b1f0c8e-0000-4000-8000-000000000001",
	slug: "river-green",
	name: "River Green",
	city: "Canton",
	state: "GA",
	county: "Cherokee",
	heroUrl: "https://example.test/rg.jpg",
	geoUnitId: CANTON.id,
};

const GLANCE: PlaceGlance = {
	place: { lead: "Canton", rest: "Cherokee County" },
	cells: [
		{ value: "$412K", label: "Canton homes", topic: "potential" },
		{ value: "Top 12–30%", label: "schools nearby", topic: "schools" },
		{ value: "34 mi", label: "north of Atlanta", topic: "convenience" },
	],
};

function listing(over: Partial<ListingCardV3> = {}): ListingCardV3 {
	return {
		kind: "listing",
		id: "listing-1",
		slug: "123-oak",
		address: "123 Oak St",
		priceLabel: "$540,000",
		bedBathSqft: "4 bd · 3 ba",
		heroUrl: "https://example.test/l.jpg",
		...over,
	};
}

function area(over: Partial<GeoUnit> = {}): AreaCardV3 {
	return {
		kind: "area",
		id: `area-${CANTON.id}`,
		unit: { ...CANTON, ...over },
	};
}

function tradeoff(): TradeoffCardV3 {
	return {
		kind: "tradeoff",
		id: "tradeoff-1",
		theme: "layout",
		axis: "size",
		prompt: "More rooms, or more room?",
		left: { label: "More rooms", support: "Four bedrooms" },
		right: { label: "More room", support: "Bigger living space" },
	};
}

function model(over: Partial<PlaceBlockInput> = {}) {
	return placeBlockModel({
		card: undefined,
		geoUnits: [CANTON],
		communities: [RIVER_GREEN],
		...over,
	});
}

describe("community tour", () => {
	it("prints the server's line and figures as sent", () => {
		const m = model({ card: { ...RIVER_GREEN, glance: GLANCE } });
		expect(m.kind).toBe("community-tour");
		expect(m.lead).toBe("Canton");
		expect(m.rest).toBe("Cherokee County");
		expect(m.cells).toEqual(GLANCE.cells);
		expect(m.explore).toEqual({ kind: "community", slug: "river-green" });
	});

	/**
	 * The whole reason for the block (owner, 2026-11-23: "信息本身也和卡片有
	 * 重合"): the card says its own name, at 27pt, and nothing under it says it
	 * again. Only VoiceOver's Map label names the card.
	 */
	it("never says the card's own name", () => {
		const m = model({ card: { ...RIVER_GREEN, glance: GLANCE } });
		const printed = [
			m.lead,
			m.rest,
			...m.cells.flatMap((c) => [c.value, c.label]),
		];
		expect(printed.join(" ")).not.toContain("River Green");
		// And no second way to the page Explore opens.
		expect(m.placeSlug).toBeNull();
	});

	/** An older server: the place from the card's own fields, no figures. */
	it("names the place from the card when no glance came", () => {
		const m = model({ card: RIVER_GREEN });
		expect(m.lead).toBe("Canton");
		expect(m.rest).toBe("Cherokee County");
		expect(m.cells).toEqual([]);
	});

	/** Real or absent, never guessed from the city. */
	it("drops the county when the card carries none", () => {
		const { county: _drop, ...noCounty } = RIVER_GREEN;
		expect(model({ card: noCounty }).rest).toBe("");
		expect(model({ card: { ...RIVER_GREEN, county: "" } }).rest).toBe("");
	});

	/** A missing level is suppressed, not printed as an empty segment. */
	it("leads with the county when the card carries no city", () => {
		const m = model({ card: { ...RIVER_GREEN, city: "" } });
		expect(m.lead).toBe("Cherokee County");
		expect(m.rest).toBe("");
	});

	/** The community's own centroid when the card carries one, the city unit
	 * when it does not (owner, 2026-09-14). */
	it("targets the community's centroid when the card has coordinates", () => {
		const m = model({ card: { ...RIVER_GREEN, lat: 34.22, lng: -84.51 } });
		expect(m.mapPoint).toEqual({ lat: 34.22, lng: -84.51, kind: "community" });
		expect(m.mapUnitId).toBe(CANTON.id);
	});

	it("has no point without coordinates, keeping the unit fallback", () => {
		const m = model({ card: RIVER_GREEN });
		expect(m.mapPoint).toBeNull();
		expect(m.mapUnitId).toBe(CANTON.id);
	});
});

describe("city tour", () => {
	it("says where the city is, not the city's name again", () => {
		const m = model({
			card: area({
				citySlug: "canton-ga",
				glance: {
					place: { lead: "Cherokee County", rest: "north of Atlanta" },
					cells: [
						{
							value: "~48 min",
							label: "36 mi to downtown",
							topic: "convenience",
						},
					],
				},
			}),
		});
		expect(m.kind).toBe("city-tour");
		expect(m.lead).toBe("Cherokee County");
		expect(m.rest).toBe("north of Atlanta");
		expect(m.cells).toHaveLength(1);
		expect(m.explore).toEqual({ kind: "city", slug: "canton-ga" });
		expect(m.mapUnitId).toBe(CANTON.id);
		// The unit IS the subject — no tighter point exists for a city.
		expect(m.mapPoint).toBeNull();
	});

	/**
	 * A city can straddle two counties (Atlanta is in Fulton and DeKalb) and
	 * the unit says neither, so without the server's line this is the metro's
	 * — and never the city's own name, which the card already carries.
	 */
	it("falls back to the metro, and to text for a city with no page", () => {
		const m = model({ card: area() });
		expect(m.lead).toBe("Atlanta metro");
		expect(m.rest).toBe("");
		expect(m.cells).toEqual([]);
		expect(m.explore).toBeNull();
	});
});

describe("home tour", () => {
	/**
	 * The line leads with the COMMUNITY, deliberately: the card already says
	 * which property this is, and the one thing it does not say is where that
	 * property sits. The pool only carries communities with a cover photo, so
	 * the card brings its own.
	 */
	it("reads the community off the card, without needing it in the pool", () => {
		const m = model({
			card: listing({
				geoUnitId: CANTON.id,
				communityId: "river-green",
				communityName: "River Green",
				communityCounty: "Cherokee",
			}),
			communities: [],
		});
		expect(m.kind).toBe("home-tour");
		expect(m.lead).toBe("River Green");
		expect(m.rest).toBe("Canton · Cherokee County");
		// A home is not its community, so here the line IS a way in.
		expect(m.placeSlug).toBe("river-green");
		expect(m.mapUnitId).toBe(CANTON.id);
	});

	/** The wire sends the SLUG; a pool community's `id` is the row's uuid. */
	it("resolves the community by slug OR by row id", () => {
		expect(model({ card: listing({ communityId: RIVER_GREEN.id }) }).lead).toBe(
			"River Green",
		);
		expect(
			model({ card: listing({ communityId: RIVER_GREEN.slug }) }).lead,
		).toBe("River Green");
	});

	/** No community: the city leads, once. No county either — it comes off
	 * the community, and there is none here to take it from. */
	it("leads with the city when no community resolves", () => {
		const m = model({ card: listing({ geoUnitId: CANTON.id }) });
		expect(m.lead).toBe("Canton");
		expect(m.rest).toBe("");
		expect(m.placeSlug).toBeNull();
		expect(m.mapUnitId).toBe(CANTON.id);
	});

	/** An id with no name behind it is a dangling reference: no way in,
	 * because `/community/<slug>` would 404. */
	it("opens nothing from an unresolvable community id", () => {
		const m = model({
			card: listing({ geoUnitId: CANTON.id, communityId: "not-in-pool" }),
		});
		expect(m.lead).toBe("Canton");
		expect(m.placeSlug).toBeNull();
	});

	/** No place at all: no text and NO map button — a metadata failure must
	 * not leave the previous card's destination live. */
	it("says nothing with no place, and hides both actions", () => {
		const m = model({ card: listing() });
		expect(m.lead).toBe("");
		expect(m.rest).toBe("");
		expect(m.placeSlug).toBeNull();
		expect(m.mapUnitId).toBeNull();
	});

	/** An id the pool cannot resolve is no more a map target than no id. */
	it("hides Map when the geo unit is not in the pool", () => {
		expect(
			model({ card: listing({ geoUnitId: "city:gone-ga" }) }).mapUnitId,
		).toBeNull();
	});

	it("targets the home's own point when the card has coordinates", () => {
		const m = model({
			card: listing({ geoUnitId: CANTON.id, lat: 34.21, lng: -84.49 }),
		});
		expect(m.mapPoint).toEqual({ lat: 34.21, lng: -84.49, kind: "home" });
		// The unit stays — it is the fallback, not a competing destination.
		expect(m.mapUnitId).toBe(CANTON.id);
	});
});

describe("general trade-off", () => {
	/** No location, and no decorative replacement for the missing Map button. */
	it("has one line of its own, no figures and no map", () => {
		const m = model({ card: tradeoff() });
		expect(m.kind).toBe("trade-off");
		expect(m.lead).toBe("Your preferences");
		expect(m.cells).toEqual([]);
		expect(m.explore).toBeNull();
		expect(m.mapUnitId).toBeNull();
	});
});

describe("no card", () => {
	/**
	 * First load and a dry deck. Nothing is claimed until there is a card to
	 * claim it from (owner, 2026-09-09: 「加载出什么就显示什么 不要预测」) —
	 * however much inventory is loaded around it.
	 */
	it("says nothing at all, even with a full pool", () => {
		const empty = model();
		expect(empty.kind).toBe("empty");
		expect(empty.activeCardId).toBeNull();
		expect(empty.lead).toBe("");
		expect(empty.rest).toBe("");
		expect(empty.cells).toEqual([]);
		expect(empty.explore).toBeNull();
		expect(empty.mapUnitId).toBeNull();
	});
});

describe("the swipe contract", () => {
	/**
	 * One coherent read of ONE card id. The screen derives the model from
	 * `deck[activeIndex]`, which only moves on a committed swipe — so this is
	 * the assertion that everything the block shows came from the same card.
	 */
	it("reports the card every field was read from", () => {
		expect(model({ card: listing({ id: "listing-9" }) }).activeCardId).toBe(
			"listing-9",
		);
		expect(model({ card: RIVER_GREEN }).activeCardId).toBe(RIVER_GREEN.id);
		expect(model({ card: area() }).activeCardId).toBe(`area-${CANTON.id}`);
	});
});

describe("accessibility labels", () => {
	it("reads the whole line, and names what the map will show", () => {
		const m = model({ card: { ...RIVER_GREEN, glance: GLANCE } });
		expect(placeAccessibilityLabel(m)).toBe("Canton, Cherokee County");
		// The one place the card's name is needed: the button's own label.
		expect(mapAccessibilityLabel(m)).toBe("Show River Green on the map");
	});

	it("drops the comma when the line has one part", () => {
		expect(placeAccessibilityLabel(model({ card: area() }))).toBe(
			"Atlanta metro",
		);
	});

	it("reads a figure with what it is a figure of", () => {
		expect(
			cellAccessibilityLabel({ value: "$412K", label: "Canton homes" }),
		).toBe("$412K, Canton homes");
	});
});
