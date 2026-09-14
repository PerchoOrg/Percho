import { describe, expect, it } from "vitest";
import {
	type CommunityCompareTable,
	NEARBY_ROW_LIMIT,
	buildCommunityCompareTable,
} from "./compare-communities";
import type { CommunityDetailDTO } from "./detail-dto";

function community(over: Partial<CommunityDetailDTO> = {}): CommunityDetailDTO {
	return {
		id: "id-1",
		slug: "slug-1",
		name: "Ashley Crossing",
		city: "Woodstock",
		state: "GA",
		heroUrl: "https://example.test/hero.jpg",
		topReasons: [],
		moreReasons: [],
		stats: [],
		interests: [],
		...over,
	};
}

const basicFor = (t: CommunityCompareTable, label: string) =>
	t.basics.find((r) => r.label === label);

const aspectRow = (t: CommunityCompareTable, key: string, label: string) =>
	t.aspects.find((a) => a.key === key)?.rows.find((r) => r.label === label);

describe("buildCommunityCompareTable", () => {
	it("carries one header per community, in the caller's order", () => {
		const t = buildCommunityCompareTable([
			community({ id: "a", slug: "a-slug", name: "Alpha" }),
			community({ id: "b", slug: "b-slug", name: "Beta", city: "", state: "" }),
		]);
		expect(t.headers.map((h) => h.id)).toEqual(["a", "b"]);
		expect(t.headers[0]?.place).toBe("Woodstock, GA");
		// Neither half present — an empty string, not a stray comma.
		expect(t.headers[1]?.place).toBe("");
	});

	it("always emits the owner's four aspects, in his order", () => {
		const t = buildCommunityCompareTable([community(), community()]);
		expect(t.aspects.map((a) => a.key)).toEqual([
			"schools",
			"convenience",
			"safety",
			"potential",
		]);
	});

	it("drops a row no community has a figure for", () => {
		const t = buildCommunityCompareTable([community(), community()]);
		// Nothing was supplied at all, so every row should have been filtered.
		expect(t.basics).toEqual([]);
		for (const a of t.aspects) expect(a.rows).toEqual([]);
	});

	it("never scores safety, whatever the communities carry", () => {
		const t = buildCommunityCompareTable([
			community({
				reviews: { count: 9, avgRating: 4.8, dimensionAvgs: {}, items: [] },
			}),
			community({ nearby: [{ bucket: "civic", count: 12 }] }),
		]);
		const safety = t.aspects.find((a) => a.key === "safety");
		expect(safety?.rows).toEqual([]);
		expect(safety?.note).toContain("not scored on purpose");
	});

	it("pivots the server's verbatim stats without reformatting them", () => {
		const t = buildCommunityCompareTable([
			community({ stats: [{ label: "Owner-occupied", value: "35%" }] }),
			community({ stats: [{ label: "Median adult age", value: "42" }] }),
		]);
		// Printed exactly as the column holds it — the page must not round a
		// number the seed did not round. Owner-occupied is the Potential
		// section's one signal; age stays in the basics.
		expect(aspectRow(t, "potential", "Owner-occupied")?.cells).toEqual([
			"35%",
			undefined,
		]);
		expect(basicFor(t, "Median age")?.cells).toEqual([undefined, "42"]);
	});

	it("prints the review score with a correctly pluralised count, and a meter", () => {
		const t = buildCommunityCompareTable([
			community({
				reviews: { count: 1, avgRating: 4.25, dimensionAvgs: {}, items: [] },
			}),
			community({
				reviews: { count: 12, avgRating: 3.5, dimensionAvgs: {}, items: [] },
			}),
		]);
		const row = basicFor(t, "Rating");
		expect(row?.cells).toEqual(["4.3 · 1 review", "3.5 · 12 reviews"]);
		// The bar is the resident's own number drawn, out of 5 — not our verdict.
		expect(row?.meter).toEqual([4.25, 3.5]);
		expect(row?.meterMax).toBe(5);
	});

	it("puts Walkable under Convenience and leaves the rest in the basics", () => {
		const t = buildCommunityCompareTable([
			community({
				reviews: {
					count: 3,
					avgRating: 4,
					dimensionAvgs: { quiet: 4.5, walkable: 3 },
					items: [],
				},
			}),
			community({
				reviews: {
					count: 2,
					avgRating: 4,
					dimensionAvgs: { walkable: 2 },
					items: [],
				},
			}),
		]);
		expect(aspectRow(t, "convenience", "Walkable")?.cells).toEqual([
			"3.0",
			"2.0",
		]);
		expect(basicFor(t, "Quiet")?.cells).toEqual(["4.5", undefined]);
		// Walkable must not appear twice.
		expect(basicFor(t, "Walkable")).toBeUndefined();
		// `friendly` is labelled "Neighbourly" and nobody rated it — no row.
		expect(basicFor(t, "Neighbourly")).toBeUndefined();
	});

	it("sums errands, shops and food into one convenience count", () => {
		const t = buildCommunityCompareTable([
			community({
				nearby: [
					{ bucket: "daily_errands", count: 4 },
					{ bucket: "shopping", count: 6 },
					{ bucket: "dining", count: 10 },
				],
			}),
			community({ nearby: [{ bucket: "outdoor", count: 3 }] }),
		]);
		expect(aspectRow(t, "convenience", "Errands")?.cells).toEqual([
			"20",
			undefined,
		]);
	});

	it("puts the schools count in its own aspect, not in the nearby rows", () => {
		const t = buildCommunityCompareTable([
			community({ nearby: [{ bucket: "schools", count: 3 }] }),
			community({ nearby: [] }),
		]);
		expect(aspectRow(t, "schools", "Nearby")?.cells).toEqual(["3", undefined]);
		expect(basicFor(t, "Schools")).toBeUndefined();
	});

	it("ranks nearby buckets by the total across the set and caps the rows", () => {
		const many = Object.fromEntries(
			// Ten labelled buckets, so the cap has something to cut. The four an
			// aspect section consumes are excluded from the basics.
			[
				"outdoor",
				"waterfront",
				"fitness",
				"healthcare",
				"transit",
				"nightlife",
				"pets",
				"kids",
				"amenities",
				"civic",
			].map((b, i) => [b, i + 1]),
		);
		const t = buildCommunityCompareTable([
			community({
				nearby: Object.entries(many).map(([bucket, count]) => ({
					bucket,
					count,
				})),
			}),
			community({ nearby: [{ bucket: "outdoor", count: 2 }] }),
		]);
		const nearbyLabels = t.basics
			.map((r) => r.label)
			.filter((l) =>
				["Civic", "Amenities", "Kids", "Pets", "Nightlife", "Transit"].includes(
					l,
				),
			);
		expect(nearbyLabels).toHaveLength(NEARBY_ROW_LIMIT);
		// `civic` has the highest count, so it leads.
		expect(nearbyLabels[0]).toBe("Civic");
	});

	it("skips a bucket the phone cannot name rather than printing it raw", () => {
		const t = buildCommunityCompareTable([
			community({
				nearby: [
					{ bucket: "outdoor", count: 3 },
					// `other` is the tagger's shrug — `bucketLabel` returns null.
					{ bucket: "other", count: 99 },
				],
			}),
			community({ nearby: [{ bucket: "other", count: 50 }] }),
		]);
		expect(basicFor(t, "Parks")?.cells).toEqual(["3", undefined]);
		expect(t.basics.map((r) => r.label)).not.toContain("other");
	});

	it("leaves a missing nearby count blank rather than calling it zero", () => {
		// The server omits a bucket it counted as zero AND one it never swept.
		// Printing "0" would state an absence we did not measure.
		const t = buildCommunityCompareTable([
			community({ nearby: [{ bucket: "outdoor", count: 4 }] }),
			community({ nearby: [] }),
		]);
		expect(basicFor(t, "Parks")?.cells).toEqual(["4", undefined]);
	});

	it("marks no winner in any row", () => {
		// The deliberate difference from `compare-areas.ts` — see the header.
		const t = buildCommunityCompareTable([
			community({ stats: [{ label: "Owner-occupied", value: "35%" }] }),
			community({ stats: [{ label: "Owner-occupied", value: "80%" }] }),
		]);
		for (const row of t.basics) {
			for (const cell of row.cells) {
				expect(typeof cell === "string" || cell === undefined).toBe(true);
			}
		}
		expect(JSON.stringify(t)).not.toContain("best");
	});

	it("orders the basics by what the buyer said matters, dropping nothing", () => {
		const HOMES = [
			community({
				id: "a",
				nearby: [
					{ bucket: "transit", count: 5 },
					{ bucket: "outdoor", count: 2 },
				],
				stats: [{ label: "Median adult age", value: "40" }],
			}),
			community({ id: "b", nearby: [{ bucket: "transit", count: 1 }] }),
		];
		const neutral = buildCommunityCompareTable(HOMES);
		const commuteFirst = buildCommunityCompareTable(HOMES, {
			schools: 1,
			cost: 1,
			commute: 3,
			community: 1,
		});
		expect(commuteFirst.basics[0]?.label).toBe("Transit");
		expect(commuteFirst.basics.map((r) => r.label).sort()).toEqual(
			neutral.basics.map((r) => r.label).sort(),
		);
	});
});
