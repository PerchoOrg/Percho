/**
 * The above-card header's model (phase183) — the handoff's §5 content mapping
 * and its acceptance list, as tests.
 *
 * Everything the header decides lives here rather than in the component, which
 * is what makes these assertable: the mobile vitest suite runs no React Native
 * runtime (`vitest.config.ts`), so a rule that lives in JSX can only be
 * checked as source text. The rules worth pinning are all about honesty —
 * which place the title names, and when an affordance must NOT appear.
 */
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	CommunityCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import {
	type FeedHeaderInput,
	feedHeaderModel,
	mapAccessibilityLabel,
	titleAccessibilityLabel,
} from "./feed-header";
import type { GeoUnit } from "./geo-unit";

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
	heroUrl: "https://example.test/rg.jpg",
	geoUnitId: CANTON.id,
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

function area(): AreaCardV3 {
	return { kind: "area", id: `area-${CANTON.id}`, unit: CANTON };
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

function model(over: Partial<FeedHeaderInput> = {}) {
	return feedHeaderModel({
		card: undefined,
		geoUnits: [CANTON],
		communities: [RIVER_GREEN],
		scopeName: null,
		scopedUnitId: null,
		...over,
	});
}

describe("home tour", () => {
	/**
	 * The title names the COMMUNITY, deliberately: the finalized card already
	 * says which property this is, and the one thing it does not say is where
	 * that property sits.
	 */
	it("names the community, with the city in the context row", () => {
		const m = model({
			card: listing({ geoUnitId: CANTON.id, communityId: RIVER_GREEN.slug }),
		});
		expect(m.kind).toBe("home-tour");
		expect(m.contextText).toBe("Atlanta metro › Canton");
		expect(m.title).toBe("River Green");
		expect(m.titleSlug).toBe("river-green");
		expect(m.mapUnitId).toBe(CANTON.id);
	});

	/**
	 * The wire sends a listing's `communityId` as the community's SLUG
	 * (`apps/web/app/api/mobile/feed/route.ts`), while a pool community's own
	 * `id` is the row's uuid. `place-trail.ts` compared against `id` alone, so
	 * the community link could never resolve. Both spellings must work.
	 */
	it("resolves the community by slug OR by row id", () => {
		expect(
			model({ card: listing({ communityId: RIVER_GREEN.id }) }).title,
		).toBe("River Green");
		expect(
			model({ card: listing({ communityId: RIVER_GREEN.slug }) }).title,
		).toBe("River Green");
	});

	/**
	 * `listings.community_id` is almost entirely unpopulated today
	 * (`apps/web/lib/feed/listing-gate.ts`), so this is the COMMON case: the
	 * city is promoted to the title and line one KEEPS it — the owner's call
	 * on 2026-09-07 (「for home tour without community, show city twice for
	 * now」) after seeing both spellings on `/demos/feed-header-v3`. phase183
	 * suppressed the duplicate; this is the reversal, and it is temporary —
	 * the backfill turns line two into the community and line one does not
	 * move. Never a guessed community either way.
	 */
	it("shows the city on BOTH lines when no community resolves", () => {
		const m = model({ card: listing({ geoUnitId: CANTON.id }) });
		expect(m.title).toBe("Canton");
		expect(m.contextText).toBe("Atlanta metro › Canton");
		expect(m.titleSlug).toBeNull();
		expect(m.mapUnitId).toBe(CANTON.id);
	});

	it("resolves neither from an unresolvable community id", () => {
		const m = model({
			card: listing({ geoUnitId: CANTON.id, communityId: "not-in-pool" }),
		});
		expect(m.title).toBe("Canton");
		expect(m.contextText).toBe("Atlanta metro › Canton");
		expect(m.titleSlug).toBeNull();
	});

	/**
	 * No place at all: a real string, an empty context row (the component
	 * still draws its height), and NO map button — a metadata failure must not
	 * leave the previous card's destination live.
	 */
	it("says 'Explore this home' with no place, and hides both actions", () => {
		const m = model({ card: listing() });
		expect(m.title).toBe("Explore this home");
		expect(m.contextText).toBe("");
		expect(m.titleSlug).toBeNull();
		expect(m.mapUnitId).toBeNull();
	});

	/** An id the pool cannot resolve is no more a map target than no id. */
	it("hides Map when the geo unit is not in the pool", () => {
		expect(
			model({ card: listing({ geoUnitId: "city:gone-ga" }) }).mapUnitId,
		).toBeNull();
	});
});

describe("community tour", () => {
	it("names the community and always has an overview to open", () => {
		const m = model({ card: RIVER_GREEN });
		expect(m.kind).toBe("community-tour");
		expect(m.contextText).toBe("Atlanta metro › Canton");
		expect(m.title).toBe("River Green");
		expect(m.titleSlug).toBe("river-green");
		expect(m.mapUnitId).toBe(CANTON.id);
	});

	/** A missing level is suppressed, not printed as an empty segment. */
	it("drops the city level when the card carries none", () => {
		const m = model({ card: { ...RIVER_GREEN, city: "" } });
		expect(m.contextText).toBe("Atlanta metro");
	});
});

describe("city tour", () => {
	/**
	 * The handoff names three card types; the feed has four. A city card gets
	 * the same geometry rather than an exception — and no chevron, because the
	 * app has no city overview page for one to open.
	 */
	it("is area › city over the city, with a map and no chevron", () => {
		const m = model({ card: area() });
		expect(m.kind).toBe("city-tour");
		// Same rule as the home-tour fallback: line one always reads the full
		// chain, so the city card carries its own name twice.
		expect(m.contextText).toBe("Atlanta metro › Canton");
		expect(m.title).toBe("Canton");
		expect(m.titleSlug).toBeNull();
		expect(m.mapUnitId).toBe(CANTON.id);
	});
});

describe("general trade-off", () => {
	/**
	 * No location, and no decorative replacement for the missing Map button.
	 * Its question and its doors stay on the card.
	 */
	it("has its own two strings and no map", () => {
		const m = model({ card: tradeoff() });
		expect(m.kind).toBe("trade-off");
		expect(m.contextText).toBe("Your preferences");
		expect(m.title).toBe("Find your balance");
		expect(m.titleSlug).toBeNull();
		expect(m.mapUnitId).toBeNull();
	});
});

describe("no card", () => {
	/**
	 * First load and a dry deck. The header still says where the buyer is
	 * looking — which is also what keeps `ScopeSheet` reachable while the
	 * skeleton is on screen.
	 */
	it("falls back to the scope, and does not print the metro twice", () => {
		const scoped = model({ scopeName: "Canton", scopedUnitId: CANTON.id });
		expect(scoped.kind).toBe("scope");
		expect(scoped.activeCardId).toBeNull();
		expect(scoped.contextText).toBe("Atlanta metro › Canton");
		expect(scoped.title).toBe("Canton");
		expect(scoped.mapUnitId).toBe(CANTON.id);

		const metro = model();
		expect(metro.title).toBe("Atlanta metro");
		expect(metro.contextText).toBe("");
		expect(metro.mapUnitId).toBeNull();
	});

	it("hides Map when the scoped unit is not in the pool", () => {
		expect(
			model({ scopeName: "Gone", scopedUnitId: "city:gone-ga" }).mapUnitId,
		).toBeNull();
	});
});

describe("the swipe contract", () => {
	/**
	 * One coherent read of ONE card id (handoff §7). The screen derives the
	 * model from `deck[activeIndex]`, which only moves on a committed swipe —
	 * so this is the assertion that everything the header shows came from the
	 * same card.
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
	/** Both rows are one line with an end ellipsis; the label is not. */
	it("carries the full context, and names what the map will show", () => {
		const m = model({
			card: listing({ geoUnitId: CANTON.id, communityId: RIVER_GREEN.slug }),
		});
		expect(titleAccessibilityLabel(m)).toBe(
			"River Green, Atlanta metro › Canton",
		);
		expect(mapAccessibilityLabel(m)).toBe("Show River Green on the map");
	});

	it("drops the comma when there is no context to read", () => {
		expect(titleAccessibilityLabel(model({ card: listing() }))).toBe(
			"Explore this home",
		);
	});

	/**
	 * The city fallback puts the same word on both lines, which VoiceOver
	 * would otherwise read as "Canton, Atlanta metro › Canton".
	 */
	it("does not read the city twice", () => {
		expect(
			titleAccessibilityLabel(
				model({ card: listing({ geoUnitId: CANTON.id }) }),
			),
		).toBe("Atlanta metro › Canton");
	});
});
