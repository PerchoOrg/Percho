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

const rowFor = (t: CommunityCompareTable, label: string) =>
	t.rows.find((r) => r.label === label);

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

	it("drops a row no community has a figure for", () => {
		const t = buildCommunityCompareTable([community(), community()]);
		// Nothing was supplied at all, so every row should have been filtered.
		expect(t.rows).toEqual([]);
	});

	it("pivots the server's verbatim stats without reformatting them", () => {
		const t = buildCommunityCompareTable([
			community({ stats: [{ label: "Owner-occupied", value: "35%" }] }),
			community({ stats: [{ label: "Median adult age", value: "42" }] }),
		]);
		// Printed exactly as the column holds it — the page must not round a
		// number the seed did not round.
		expect(rowFor(t, "Owner-occupied")?.cells).toEqual(["35%", undefined]);
		expect(rowFor(t, "Median adult age")?.cells).toEqual([undefined, "42"]);
	});

	it("prints the review score with a correctly pluralised count", () => {
		const t = buildCommunityCompareTable([
			community({
				reviews: { count: 1, avgRating: 4.25, dimensionAvgs: {}, items: [] },
			}),
			community({
				reviews: { count: 12, avgRating: 3.5, dimensionAvgs: {}, items: [] },
			}),
		]);
		expect(rowFor(t, "Resident rating")?.cells).toEqual([
			"4.3 · 1 review",
			"3.5 · 12 reviews",
		]);
	});

	it("gives each review dimension its own row, blank where unrated", () => {
		const t = buildCommunityCompareTable([
			community({
				reviews: {
					count: 3,
					avgRating: 4,
					dimensionAvgs: { quiet: 4.5 },
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
		expect(rowFor(t, "Quiet")?.cells).toEqual(["4.5", undefined]);
		expect(rowFor(t, "Walkable")?.cells).toEqual([undefined, "2.0"]);
		// `friendly` is labelled "Neighbourly" and nobody rated it — no row.
		expect(rowFor(t, "Neighbourly")).toBeUndefined();
	});

	it("ranks nearby buckets by the total across the set and caps the rows", () => {
		const many = Object.fromEntries(
			// Ten labelled buckets, so the cap has something to cut.
			[
				"schools",
				"dining",
				"shopping",
				"outdoor",
				"waterfront",
				"fitness",
				"healthcare",
				"daily_errands",
				"transit",
				"nightlife",
			].map((b, i) => [b, i + 1]),
		);
		const t = buildCommunityCompareTable([
			community({
				nearby: Object.entries(many).map(([bucket, count]) => ({
					bucket,
					count,
				})),
			}),
			community({ nearby: [{ bucket: "schools", count: 2 }] }),
		]);
		const nearbyLabels = t.rows
			.map((r) => r.label)
			.filter((l) =>
				[
					"Nightlife",
					"Transit",
					"Errands",
					"Health",
					"Fitness",
					"Water",
				].includes(l),
			);
		expect(nearbyLabels).toHaveLength(NEARBY_ROW_LIMIT);
		// `nightlife` has the highest count, so it leads.
		expect(nearbyLabels[0]).toBe("Nightlife");
	});

	it("skips a bucket the phone cannot name rather than printing it raw", () => {
		const t = buildCommunityCompareTable([
			community({
				nearby: [
					{ bucket: "schools", count: 3 },
					// `other` is the tagger's shrug — `bucketLabel` returns null.
					{ bucket: "other", count: 99 },
				],
			}),
			community({ nearby: [{ bucket: "other", count: 50 }] }),
		]);
		expect(rowFor(t, "Schools")?.cells).toEqual(["3", undefined]);
		expect(t.rows.map((r) => r.label)).not.toContain("other");
	});

	it("leaves a missing nearby count blank rather than calling it zero", () => {
		// The server omits a bucket it counted as zero AND one it never swept.
		// Printing "0" would state an absence we did not measure.
		const t = buildCommunityCompareTable([
			community({ nearby: [{ bucket: "outdoor", count: 4 }] }),
			community({ nearby: [] }),
		]);
		expect(rowFor(t, "Parks")?.cells).toEqual(["4", undefined]);
	});

	it("marks no winner in any row", () => {
		// The deliberate difference from `compare-areas.ts` — see the header.
		const t = buildCommunityCompareTable([
			community({ stats: [{ label: "Owner-occupied", value: "35%" }] }),
			community({ stats: [{ label: "Owner-occupied", value: "80%" }] }),
		]);
		for (const row of t.rows) {
			for (const cell of row.cells) {
				expect(typeof cell === "string" || cell === undefined).toBe(true);
			}
		}
		expect(JSON.stringify(t)).not.toContain("best");
	});
});
