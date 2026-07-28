import { describe, expect, it } from "vitest";
import {
	buildHotspots,
	buildListingTour,
	transitionSignals,
} from "./build-hotspots";
import type { CompsCohortDTO, DetailPhotoDTO } from "./detail-dto";

const comps: CompsCohortDTO = {
	cohortLabel: "Duluth",
	pricesUsd: [400_000, 410_000, 420_000, 430_000, 440_000],
	medianPricePerSqft: 202,
	medianPricePerSqftSampleSize: 49,
};

const ctx = { comps, sqft: 1870, yearBuilt: 2006 };

function photo(
	id: string,
	room: string | null,
	extra: Partial<NonNullable<DetailPhotoDTO["tags"]>> = {},
	tagged = true,
): DetailPhotoDTO {
	return {
		id,
		url: `https://example.test/${id}.jpg`,
		...(tagged
			? {
					tags: {
						room_type: room,
						caption: `A ${room ?? "thing"}`,
						usable: true,
						...extra,
					},
				}
			: {}),
	};
}

describe("buildHotspots", () => {
	it("returns nothing when no photo is tagged — the production case today", () => {
		// The fmls import has 0 tagged photos, so pins/tour/sheets must be ABSENT
		// rather than rendered empty.
		const untagged = [photo("a", null, {}, false), photo("b", null, {}, false)];
		expect(buildHotspots(untagged, ctx)).toEqual([]);
	});

	it("builds one hotspot per tagged, navigable room", () => {
		const out = buildHotspots(
			[photo("a", "kitchen"), photo("b", "backyard")],
			ctx,
		);
		expect(out.map((h) => h.room)).toEqual(["kitchen", "backyard"]);
	});

	it("keeps only the FIRST photo of a repeated room", () => {
		// Photos arrive in display order, so the first is the listing's best shot —
		// and three "Kitchen" sections would be nav noise.
		const out = buildHotspots(
			[photo("a", "kitchen"), photo("b", "kitchen"), photo("c", "living")],
			ctx,
		);
		expect(out).toHaveLength(2);
		expect(out[0]?.id).toBe("a");
	});

	it("skips rooms that are not worth navigating to", () => {
		const out = buildHotspots(
			[photo("a", "hallway"), photo("b", "closet"), photo("c", "laundry")],
			ctx,
		);
		expect(out).toEqual([]);
	});

	it("every action subtitle carries a number (the §2.5 #2 gate)", () => {
		const [hotspot] = buildHotspots([photo("a", "kitchen")], ctx);
		expect(hotspot).toBeDefined();
		for (const action of hotspot?.actions ?? []) {
			expect(action.sub, action.kind).toMatch(/\d/);
		}
	});

	it("offers Renovate ONLY on a dated feature", () => {
		const [plain] = buildHotspots([photo("a", "kitchen")], ctx);
		expect(plain?.actions.some((a) => a.kind === "renovate")).toBe(false);

		const [dated] = buildHotspots(
			[photo("b", "kitchen", { style_signals: ["dated"] })],
			ctx,
		);
		expect(dated?.dated).toBe(true);
		expect(dated?.actions.some((a) => a.kind === "renovate")).toBe(true);
	});

	it("keeps Ask AI disabled (§2.5 #1 coming soon)", () => {
		const [hotspot] = buildHotspots([photo("a", "kitchen")], ctx);
		const askAi = hotspot?.actions.find((a) => a.kind === "ask_ai");
		expect(askAi?.disabled).toBe(true);
	});

	it("never claims a cohort finer than the one measured", () => {
		const [hotspot] = buildHotspots([photo("a", "kitchen")], ctx);
		const compare = hotspot?.actions.find((a) => a.kind === "compare");
		expect(compare?.sub).toContain("Duluth");
	});

	it("still reaches 3 actions when the listing has no sqft", () => {
		const [hotspot] = buildHotspots([photo("a", "kitchen")], { comps });
		// why is dropped (no sqft) → compare + save + ask_ai = 3, the floor.
		expect(hotspot?.actions.length).toBeGreaterThanOrEqual(3);
	});

	it("emits no hotspot when there is neither a cohort nor sqft", () => {
		// why is dropped (no sqft), compare is dropped (no cohort) → only save and
		// ask_ai remain, which is below the 3-action floor → absent.
		const bare = buildHotspots([photo("a", "kitchen")], {
			comps: { cohortLabel: "Nowhere", pricesUsd: [] },
		});
		expect(bare).toEqual([]);
	});
});

describe("buildListingTour", () => {
	it("returns null without enough tagged rooms", () => {
		const hotspots = buildHotspots([photo("a", "kitchen")], ctx);
		expect(
			buildListingTour(hotspots, { sqft: 1870, beds: 3, yearBuilt: 2006 }),
		).toBeNull();
	});

	it("builds a generic 3-stop tour when coverage allows", () => {
		const hotspots = buildHotspots(
			[photo("a", "exterior"), photo("b", "kitchen"), photo("c", "backyard")],
			ctx,
		);
		const tour = buildListingTour(hotspots, {
			sqft: 1870,
			beds: 3,
			yearBuilt: 2006,
		});
		expect(tour?.stops).toHaveLength(3);
		expect(tour?.generic).toBe(true);
		// The iron law: every stop cites something real.
		for (const stop of tour?.stops ?? []) {
			expect(stop.evidence.length).toBeGreaterThan(0);
			expect(stop.evidence[0]?.count).toBeGreaterThan(0);
		}
	});

	it("returns null when there are no facts to cite honestly", () => {
		const hotspots = buildHotspots(
			[photo("a", "exterior"), photo("b", "kitchen"), photo("c", "backyard")],
			ctx,
		);
		expect(buildListingTour(hotspots, {})).toBeNull();
	});
});

describe("transitionSignals", () => {
	it("is empty for a generic tour — no invented preferences", () => {
		const hotspots = buildHotspots(
			[photo("a", "exterior"), photo("b", "kitchen"), photo("c", "backyard")],
			ctx,
		);
		const tour = buildListingTour(hotspots, {
			sqft: 1870,
			beds: 3,
			yearBuilt: 2006,
		});
		expect(tour).not.toBeNull();
		if (tour) expect(transitionSignals(tour)).toEqual([]);
	});
});
