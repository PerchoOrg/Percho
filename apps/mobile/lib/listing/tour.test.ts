import { describe, expect, it } from "vitest";
import type { Hotspot } from "./hotspot";
import {
	type Evidence,
	MAX_STOPS,
	MIN_STOPS,
	type Stop,
	buildTour,
	genericTourStops,
	isLastStop,
	isValidStop,
	stopLabel,
} from "./tour";

function hotspot(id: string, room: Hotspot["room"]): Hotspot {
	return {
		id,
		room,
		title: `${room} feature`,
		mediaUrl: `https://example.test/${id}.jpg`,
		pin: { x: 0.5, y: 0.5 },
		actions: [
			{ kind: "why", label: "Why", sub: "7 likes" },
			{ kind: "compare", label: "Compare", sub: "8 of 24" },
			{ kind: "save", label: "Save", sub: "1 saved" },
		],
	};
}

const evidence: Evidence = [
	{ label: "likes with open-plan kitchens", count: 7, sourceIds: ["a", "b"] },
];

function stop(id: string, room: Hotspot["room"]): Stop {
	return {
		id,
		hotspot: hotspot(id, room),
		why: "You've consistently liked open kitchens.",
		evidence,
	};
}

describe("isValidStop — the canon iron law, at runtime", () => {
	it("accepts a stop with real evidence", () => {
		expect(isValidStop(stop("s1", "kitchen"))).toBe(true);
	});

	it("REJECTS empty evidence — this is the law the type cannot enforce on JSON", () => {
		expect(isValidStop({ why: "Because.", evidence: [] })).toBe(false);
	});

	it("rejects missing or malformed evidence from a server payload", () => {
		expect(isValidStop({ why: "Because." })).toBe(false);
		expect(isValidStop({ why: "Because.", evidence: null })).toBe(false);
		expect(isValidStop({ why: "Because.", evidence: "7 likes" })).toBe(false);
		expect(isValidStop({ why: "Because.", evidence: [{}] })).toBe(false);
	});

	it("rejects a zero count — 'Based on 0 likes' is worse than no citation", () => {
		expect(
			isValidStop({
				why: "Because.",
				evidence: [{ label: "likes", count: 0 }],
			}),
		).toBe(false);
	});

	it("rejects an unlabelled or non-numeric citation", () => {
		expect(
			isValidStop({ why: "Because.", evidence: [{ label: "  ", count: 7 }] }),
		).toBe(false);
		expect(
			isValidStop({
				why: "Because.",
				evidence: [{ label: "likes", count: Number.NaN }],
			}),
		).toBe(false);
	});

	it("requires a non-empty WHY (§2.3 #3 makes it mandatory)", () => {
		expect(isValidStop({ why: "", evidence })).toBe(false);
		expect(isValidStop({ why: "   ", evidence })).toBe(false);
		expect(isValidStop({ evidence })).toBe(false);
	});

	it("requires EVERY citation to be valid, not just the first", () => {
		expect(
			isValidStop({
				why: "Because.",
				evidence: [
					{ label: "likes", count: 7 },
					{ label: "bad", count: 0 },
				],
			}),
		).toBe(false);
	});
});

describe("buildTour", () => {
	it("builds a tour at the 3-stop minimum", () => {
		expect(MIN_STOPS).toBe(3);
		const t = buildTour([
			stop("a", "exterior"),
			stop("b", "kitchen"),
			stop("c", "backyard"),
		]);
		expect(t?.stops).toHaveLength(3);
		expect(t?.generic).toBe(false);
	});

	it("returns null below the minimum — free explore instead of a 2-stop 'tour'", () => {
		expect(buildTour([stop("a", "kitchen"), stop("b", "living")])).toBeNull();
		expect(buildTour([])).toBeNull();
	});

	it("caps at five stops", () => {
		expect(MAX_STOPS).toBe(5);
		const many = ["a", "b", "c", "d", "e", "f", "g"].map((id) =>
			stop(id, "kitchen"),
		);
		expect(buildTour(many)?.stops).toHaveLength(5);
	});

	it("filters out invalid stops and can fall below the floor as a result", () => {
		const withBad = [
			stop("a", "kitchen"),
			{ ...stop("b", "living"), evidence: [] as unknown as Evidence },
			stop("c", "backyard"),
		];
		// Only 2 valid → no tour, rather than a tour with an empty WHY block.
		expect(buildTour(withBad)).toBeNull();
	});

	it("marks a generic tour so its copy can avoid faking personalisation", () => {
		const t = buildTour(
			[stop("a", "exterior"), stop("b", "kitchen"), stop("c", "backyard")],
			{ generic: true },
		);
		expect(t?.generic).toBe(true);
	});
});

describe("genericTourStops — the §2.2 empty-profile fallback", () => {
	const hotspots = [
		hotspot("h1", "exterior"),
		hotspot("h2", "kitchen"),
		hotspot("h3", "backyard"),
	];

	it("produces three stops whose evidence cites the LISTING, not a fake preference", () => {
		const stops = genericTourStops(hotspots, {
			sqft: 2840,
			beds: 4,
			yearBuilt: 2006,
		});
		expect(stops).toHaveLength(3);
		for (const s of stops) {
			expect(isValidStop(s)).toBe(true);
		}
		expect(stops[0]?.evidence[0]?.count).toBe(2840);
		expect(buildTour(stops, { generic: true })?.generic).toBe(true);
	});

	it("never reuses one hotspot for two stops", () => {
		const stops = genericTourStops(hotspots, {
			sqft: 2840,
			beds: 4,
			yearBuilt: 2006,
		});
		const ids = stops.map((s) => s.hotspot.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("yields no tour when the listing lacks the facts to cite honestly", () => {
		// No sqft/beds/yearBuilt → nothing citable → fewer than MIN_STOPS → no tour.
		expect(
			buildTour(genericTourStops(hotspots, {}), { generic: true }),
		).toBeNull();
	});

	it("yields no tour when photo coverage is too thin", () => {
		const thin = [hotspot("h1", "kitchen")];
		const stops = genericTourStops(thin, {
			sqft: 2840,
			beds: 4,
			yearBuilt: 2006,
		});
		expect(buildTour(stops, { generic: true })).toBeNull();
	});

	it("builds a 3-stop tour from an ALL-INDOOR room mix (real production shape)", () => {
		// Found by `scripts/probe-hotspots.ts` against production: a Suwanee listing
		// with four good hotspots (exterior, dining, living, kitchen) produced NO
		// tour, because the third stop only accepted backyard/pool/balcony/exterior
		// and the exterior was already consumed by stop 1. Photographers shoot what
		// a house has; requiring a backyard photo means almost nobody gets a tour.
		const indoor = [
			hotspot("h1", "exterior"),
			hotspot("h2", "dining"),
			hotspot("h3", "living"),
			hotspot("h4", "kitchen"),
		];
		const tour = buildTour(
			genericTourStops(indoor, { sqft: 2279, beds: 3, yearBuilt: 2004 }),
			{ generic: true },
		);
		expect(tour?.stops).toHaveLength(3);
		const ids = tour?.stops.map((s) => s.hotspot.id) ?? [];
		expect(new Set(ids).size).toBe(3);
		// The fallback stop must not claim to be outdoors over an indoor photo.
		const third = tour?.stops[2];
		const outdoorRooms = ["backyard", "pool", "balcony", "exterior"];
		if (third && !outdoorRooms.includes(third.hotspot.room)) {
			expect(third.why).not.toContain("outside");
		}
	});
});

describe("stop chrome", () => {
	it("labels stops 1-indexed per §2.3 #1", () => {
		expect(stopLabel(1, 4)).toBe("STOP 2 OF 4");
		expect(stopLabel(0, 3)).toBe("STOP 1 OF 3");
	});

	it("knows the last stop, which becomes 'Finish tour →'", () => {
		expect(isLastStop(3, 4)).toBe(true);
		expect(isLastStop(2, 4)).toBe(false);
	});
});
