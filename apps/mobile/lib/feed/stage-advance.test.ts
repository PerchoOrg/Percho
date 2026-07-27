/**
 * The §1.7 promotion gates, tested on BOTH sides of every boundary. These are
 * the task-1 acceptance criteria in executable form (task-1-feed.md: "晋级阈值
 * 边界(如 city 右滑 2 vs 3)").
 */
import { describe, expect, it } from "vitest";
import type { FunnelStage } from "./card-types";
import type { GeoLevel, GeoUnit } from "./geo-unit";
import { EMPTY_SIGNALS, type SignalState } from "./signals";
import {
	CITY_FOCUS_RIGHT,
	COMMUNITY_LIKES_REQUIRED,
	LIFE_SIGNALS_REQUIRED,
	UNITS_FOCUSED_REQUIRED,
	UNIT_FOCUS_RIGHT,
	cityFocusTallies,
	countLifeSignals,
	evaluateStageAdvance,
} from "./stage-advance";

function unit(id: string, level: GeoLevel, parentId?: string): GeoUnit {
	return {
		id,
		level,
		name: id,
		state: "GA",
		centroid: { lat: 33.7, lng: -84.3 },
		communityCount: 4,
		sampleCommunityNames: [],
		stats: {},
		...(parentId ? { parentId } : {}),
	};
}

const CITY_POOL = [
	unit("city:decatur-ga", "city"),
	unit("city:brookhaven-ga", "city"),
];
const ZIP_POOL = [
	...CITY_POOL,
	unit("zip:30030", "zip", "city:decatur-ga"),
	unit("zip:30032", "zip", "city:decatur-ga"),
];

function withGeo(
	entries: readonly {
		unitId: string;
		level: GeoLevel;
		right: number;
		left?: number;
	}[],
): SignalState {
	return {
		...EMPTY_SIGNALS,
		geo: entries.map((e) => ({
			unitId: e.unitId,
			level: e.level,
			right: e.right,
			left: e.left ?? 0,
		})),
	};
}

describe("0 → 1 · Intent & Life", () => {
	const base: SignalState = {
		...EMPTY_SIGNALS,
		intent: "primary",
		budget: { minUsd: 450_000, maxUsd: 650_000 },
	};

	it("intent + budget + 1 life signal is not enough", () => {
		const s = { ...base, dims: { family: 1 } };
		expect(countLifeSignals(s)).toBe(1);
		expect(evaluateStageAdvance(0, s, { units: [] })).toBeNull();
	});

	it("the 2nd distinct life signal opens the gate", () => {
		const s = { ...base, dims: { family: 1, trails: 1 } };
		expect(countLifeSignals(s)).toBe(LIFE_SIGNALS_REQUIRED);
		expect(evaluateStageAdvance(0, s, { units: [] })).toBe(1);
	});

	it("two signals on the SAME dim is still one life signal", () => {
		const s = { ...base, dims: { family: 5 } };
		expect(countLifeSignals(s)).toBe(1);
		expect(evaluateStageAdvance(0, s, { units: [] })).toBeNull();
	});

	it("a negative dim score does not count as a signal", () => {
		const s = { ...base, dims: { family: 1, trails: -2 } };
		expect(countLifeSignals(s)).toBe(1);
		expect(evaluateStageAdvance(0, s, { units: [] })).toBeNull();
	});

	it("missing intent blocks even with plenty of life signal", () => {
		const s = {
			...EMPTY_SIGNALS,
			budget: { maxUsd: 500_000 },
			dims: { family: 1, trails: 1, walkable: 1 },
		};
		expect(evaluateStageAdvance(0, s, { units: [] })).toBeNull();
	});

	it("missing budget band blocks", () => {
		const s = {
			...EMPTY_SIGNALS,
			intent: "primary",
			dims: { family: 1, trails: 1 },
		};
		expect(evaluateStageAdvance(0, s, { units: [] })).toBeNull();
	});
});

describe("1 → 2 · city focus (right-swipe ≥3 AND rate >50%)", () => {
	it("2 right-swipes on a city does not advance", () => {
		const s = withGeo([{ unitId: "city:decatur-ga", level: "city", right: 2 }]);
		expect(evaluateStageAdvance(1, s, { units: CITY_POOL })).toBeNull();
	});

	it("3 right-swipes advances", () => {
		const s = withGeo([{ unitId: "city:decatur-ga", level: "city", right: 3 }]);
		expect(CITY_FOCUS_RIGHT).toBe(3);
		expect(evaluateStageAdvance(1, s, { units: CITY_POOL })).toBe(2);
	});

	it("3 right of 6 is exactly 50% and does NOT pass (rate must exceed)", () => {
		const s = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 3, left: 3 },
		]);
		const tally = cityFocusTallies(s, CITY_POOL).find(
			(t) => t.unitId === "city:decatur-ga",
		);
		expect(tally?.rate).toBe(0.5);
		expect(evaluateStageAdvance(1, s, { units: CITY_POOL })).toBeNull();
	});

	it("3 right of 5 is 60% and passes", () => {
		const s = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 3, left: 2 },
		]);
		expect(evaluateStageAdvance(1, s, { units: CITY_POOL })).toBe(2);
	});

	it("a city focuses on its descendants' swipes too (§1.7 '及其下级')", () => {
		const s = withGeo([
			{ unitId: "zip:30030", level: "zip", right: 2 },
			{ unitId: "zip:30032", level: "zip", right: 1 },
		]);
		expect(evaluateStageAdvance(1, s, { units: ZIP_POOL })).toBe(2);
	});

	it("signal spread thin across two cities focuses neither", () => {
		const s = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 2 },
			{ unitId: "city:brookhaven-ga", level: "city", right: 2 },
		]);
		expect(evaluateStageAdvance(1, s, { units: CITY_POOL })).toBeNull();
	});

	it("half-weight tease signal counts toward the gate but needs more of it", () => {
		// 5 tease right-swipes = 2.5 weight — short of 3.
		const s = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 2.5 },
		]);
		expect(evaluateStageAdvance(1, s, { units: CITY_POOL })).toBeNull();
		const s6 = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 3 },
		]);
		expect(evaluateStageAdvance(1, s6, { units: CITY_POOL })).toBe(2);
	});
});

describe("2 → 3 · units in the pool at the finest available level", () => {
	it("1 unit at ≥2 right does not advance", () => {
		const s = withGeo([{ unitId: "city:decatur-ga", level: "city", right: 2 }]);
		expect(evaluateStageAdvance(2, s, { units: CITY_POOL })).toBeNull();
	});

	it("2 units at ≥2 right advances", () => {
		const s = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 2 },
			{ unitId: "city:brookhaven-ga", level: "city", right: 2 },
		]);
		expect(UNIT_FOCUS_RIGHT).toBe(2);
		expect(UNITS_FOCUSED_REQUIRED).toBe(2);
		expect(evaluateStageAdvance(2, s, { units: CITY_POOL })).toBe(3);
	});

	it("a unit at 1 right does not count toward the pair", () => {
		const s = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 2 },
			{ unitId: "city:brookhaven-ga", level: "city", right: 1 },
		]);
		expect(evaluateStageAdvance(2, s, { units: CITY_POOL })).toBeNull();
	});

	it("5 units still advances — the 2–4 band is a target, not a ceiling", () => {
		const many = ["a", "b", "c", "d", "e"].map((k) => ({
			unitId: `city:${k}`,
			level: "city" as GeoLevel,
			right: 3,
		}));
		expect(evaluateStageAdvance(2, withGeo(many), { units: CITY_POOL })).toBe(
			3,
		);
	});

	it("city-reading (today): city signals open the gate when zip is empty", () => {
		const s = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 2 },
			{ unitId: "city:brookhaven-ga", level: "city", right: 2 },
		]);
		expect(evaluateStageAdvance(2, s, { units: CITY_POOL })).toBe(3);
	});

	it("zip-reading (post-backfill): the gate reads zips and ignores city signal", () => {
		// Same city signal as above, but the pool now has zips — so the finest
		// level is zip and the city tallies no longer satisfy the gate. Proof the
		// backfill deepens the funnel rather than short-circuiting it.
		const cityOnly = withGeo([
			{ unitId: "city:decatur-ga", level: "city", right: 2 },
			{ unitId: "city:brookhaven-ga", level: "city", right: 2 },
		]);
		expect(evaluateStageAdvance(2, cityOnly, { units: ZIP_POOL })).toBeNull();

		const zips = withGeo([
			{ unitId: "zip:30030", level: "zip", right: 2 },
			{ unitId: "zip:30032", level: "zip", right: 2 },
		]);
		expect(evaluateStageAdvance(2, zips, { units: ZIP_POOL })).toBe(3);
	});

	it("an empty pool cannot advance", () => {
		const s = withGeo([{ unitId: "city:x", level: "city", right: 9 }]);
		expect(evaluateStageAdvance(2, s, { units: [] })).toBeNull();
	});
});

describe("3 → 4 · community likes", () => {
	it("1 like does not advance", () => {
		const s = { ...EMPTY_SIGNALS, likedCommunityIds: ["c-1"] };
		expect(evaluateStageAdvance(3, s, { units: CITY_POOL })).toBeNull();
	});

	it("2 likes advances", () => {
		const s = { ...EMPTY_SIGNALS, likedCommunityIds: ["c-1", "c-2"] };
		expect(COMMUNITY_LIKES_REQUIRED).toBe(2);
		expect(evaluateStageAdvance(3, s, { units: CITY_POOL })).toBe(4);
	});
});

describe("stage 4 is terminal, and the gate is monotonic", () => {
	it("stage 4 never advances, however much signal exists", () => {
		const s: SignalState = {
			...EMPTY_SIGNALS,
			intent: "primary",
			budget: { maxUsd: 900_000 },
			dims: { family: 9, trails: 9 },
			likedCommunityIds: ["c-1", "c-2", "c-3"],
			geo: [{ unitId: "city:decatur-ga", level: "city", right: 20, left: 0 }],
		};
		expect(evaluateStageAdvance(4, s, { units: ZIP_POOL })).toBeNull();
	});

	it("never returns a stage at or below the current one", () => {
		const rich: SignalState = {
			...EMPTY_SIGNALS,
			intent: "primary",
			budget: { maxUsd: 900_000 },
			dims: { family: 3, trails: 3 },
			likedCommunityIds: ["c-1", "c-2", "c-3"],
			geo: [
				{ unitId: "city:decatur-ga", level: "city", right: 9, left: 0 },
				{ unitId: "city:brookhaven-ga", level: "city", right: 9, left: 0 },
			],
		};
		for (const stage of [0, 1, 2, 3, 4] as FunnelStage[]) {
			const next = evaluateStageAdvance(stage, rich, { units: CITY_POOL });
			if (next !== null) expect(next).toBeGreaterThan(stage);
		}
	});

	it("advances exactly one stage at a time even with signal for several", () => {
		const rich: SignalState = {
			...EMPTY_SIGNALS,
			intent: "primary",
			budget: { maxUsd: 900_000 },
			dims: { family: 3, trails: 3 },
			likedCommunityIds: ["c-1", "c-2"],
			geo: [
				{ unitId: "city:decatur-ga", level: "city", right: 9, left: 0 },
				{ unitId: "city:brookhaven-ga", level: "city", right: 9, left: 0 },
			],
		};
		expect(evaluateStageAdvance(0, rich, { units: CITY_POOL })).toBe(1);
		expect(evaluateStageAdvance(1, rich, { units: CITY_POOL })).toBe(2);
		expect(evaluateStageAdvance(2, rich, { units: CITY_POOL })).toBe(3);
		expect(evaluateStageAdvance(3, rich, { units: CITY_POOL })).toBe(4);
	});
});
