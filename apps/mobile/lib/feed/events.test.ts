/**
 * §1.10 event contract tests. These lock the *wire shape*: there is no
 * server-side schema in this task, so a renamed field would otherwise break
 * aggregation silently once a consumer lands.
 */
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	AskCardV3,
	CommunityCardV3,
	FeedCardV3,
	ListingCardV3,
} from "./card-types";
import {
	buildGestureEvent,
	buildSkipLayerEvent,
	buildStageEvent,
	buildSwipeEvent,
	geoLevelOf,
	wireVerdict,
} from "./events";
import type { GeoLevel } from "./geo-unit";

const listing: ListingCardV3 = {
	kind: "listing",
	id: "l1",
	slug: "123-main",
	address: "123 Main St",
	priceLabel: "$450,000",
	bedBathSqft: "3 bd · 2 ba · 1,800 sqft",
	heroUrl: "https://example.com/a.jpg",
};

const area = (level: GeoLevel): AreaCardV3 => ({
	kind: "area",
	id: `a-${level}`,
	unit: {
		id: `${level}:marietta-ga`,
		level,
		name: "Marietta",
		state: "GA",
		centroid: { lat: 33.95, lng: -84.55 },
		communityCount: 44,
		sampleCommunityNames: ["Waterside"],
		stats: {},
	},
});

const community: CommunityCardV3 = {
	kind: "community",
	id: "c1",
	slug: "waterside",
	name: "Waterside",
	city: "Marietta",
	state: "GA",
	heroUrl: "https://example.com/c.jpg",
};

const geoAsk: AskCardV3 = {
	kind: "ask",
	id: "ask-city-1",
	layer: "city",
	q: "Marietta?",
	choice: {
		form: "yes-no",
		affirm: { type: "geo", unitId: "city:marietta-ga", level: "city" },
	},
};

const lifeAsk: AskCardV3 = {
	kind: "ask",
	id: "ask-life-1",
	layer: "life",
	q: "Is walkability important?",
	choice: { form: "yes-no", affirm: { type: "dim", dim: "walkable" } },
};

describe("wireVerdict — §1.10 verdict(L/R)", () => {
	it("maps right→R and left→L", () => {
		expect(wireVerdict("right")).toBe("R");
		expect(wireVerdict("left")).toBe("L");
	});
});

describe("geoLevelOf", () => {
	it("reports the area card's own level at all three granularities", () => {
		expect(geoLevelOf(area("area"))).toBe("area");
		expect(geoLevelOf(area("city"))).toBe("city");
		expect(geoLevelOf(area("zip"))).toBe("zip");
	});

	it("treats a community card as community-level", () => {
		expect(geoLevelOf(community)).toBe("community");
	});

	it("reports the asked-about layer for a geo ask", () => {
		expect(geoLevelOf(geoAsk)).toBe("city");
	});

	// A life-layer ask has no geography. Reporting one would corrupt the
	// per-level swipe distribution in §1.10's health metrics.
	it("omits the level for a non-geo ask and for listings", () => {
		expect(geoLevelOf(lifeAsk)).toBeUndefined();
		expect(geoLevelOf(listing)).toBeUndefined();
	});
});

describe("buildSwipeEvent", () => {
	const base = {
		seq: 7,
		at: 1_000,
		verdict: "right" as const,
		funnelStage: 2 as const,
		sessionN: 3,
		activeIndex: 4,
	};

	it("carries the full §1.10 swipe field set", () => {
		const e = buildSwipeEvent({
			...base,
			card: area("city"),
			prevSwipeAt: 400,
		});
		expect(e).toEqual({
			type: "swipe",
			seq: 7,
			at: 1_000,
			funnelStage: 2,
			sessionN: 3,
			cardId: "a-city",
			cardType: "area",
			geoLevel: "city",
			verdict: "R",
			dtSincePrevSwipe: 600,
			activeIndex: 4,
		});
	});

	// Absent, not zero: 0ms is a real (impossibly fast) measurement and would
	// drag the median hesitation time down.
	it("omits dtSincePrevSwipe on the first swipe of a session", () => {
		const e = buildSwipeEvent({ ...base, card: listing });
		expect("dtSincePrevSwipe" in e).toBe(false);
	});

	it("omits geoLevel rather than emitting null", () => {
		const e = buildSwipeEvent({ ...base, card: listing });
		expect("geoLevel" in e).toBe(false);
	});

	// Clock skew or a restart can hand back a negative delta; a negative
	// duration is never a real measurement.
	it("clamps a negative delta to zero", () => {
		const e = buildSwipeEvent({ ...base, card: listing, prevSwipeAt: 5_000 });
		expect(e.dtSincePrevSwipe).toBe(0);
	});
});

describe("buildGestureEvent", () => {
	const base = {
		seq: 1,
		at: 10,
		card: listing as FeedCardV3,
		funnelStage: 4 as const,
		sessionN: 1,
	};

	it("builds explore_tap without a focus key", () => {
		expect(
			buildGestureEvent({ ...base, type: "explore_tap" }).focusKey,
		).toBeUndefined();
	});

	it("carries focusKey only for datapoint_tap (§1.10)", () => {
		const tap = buildGestureEvent({
			...base,
			type: "datapoint_tap",
			focusKey: "schools",
		});
		expect(tap.focusKey).toBe("schools");
		// The same key passed with the wrong type must not leak through.
		const explore = buildGestureEvent({
			...base,
			type: "explore_tap",
			focusKey: "schools",
		});
		expect("focusKey" in explore).toBe(false);
	});
});

describe("buildStageEvent", () => {
	it("reports funnelStage as the stage the user was in when it fired", () => {
		const e = buildStageEvent({
			seq: 2,
			at: 50,
			type: "stage_advance",
			fromStage: 1,
			toStage: 2,
			swipesInStage: 23,
			sessionN: 2,
		});
		expect(e.funnelStage).toBe(1);
		expect(e.toStage).toBe(2);
		expect(e.swipesInStage).toBe(23);
	});
});

describe("buildSkipLayerEvent", () => {
	it("carries the skipped layer", () => {
		const e = buildSkipLayerEvent({
			seq: 3,
			at: 60,
			layer: "lifestyle",
			funnelStage: 1,
			sessionN: 1,
		});
		expect(e).toMatchObject({ type: "skip_layer", layer: "lifestyle" });
	});
});
