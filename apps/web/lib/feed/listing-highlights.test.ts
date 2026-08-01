import { describe, expect, it } from "vitest";
import { listingHighlightDims } from "./listing-highlights";

describe("listingHighlightDims", () => {
	it("returns nothing for an absent or empty description", () => {
		expect(listingHighlightDims(undefined)).toEqual([]);
		expect(listingHighlightDims(null)).toEqual([]);
		expect(listingHighlightDims([])).toEqual([]);
		expect(listingHighlightDims(["   "])).toEqual([]);
	});

	it("caps at three chips — a fourth would wrap the redline's row", () => {
		const dims = listingHighlightDims([
			"Top-rated schools, walkable to town, walking trails, quiet cul-de-sac, private backyard, family-friendly, move-in ready.",
		]);
		expect(dims).toHaveLength(3);
	});

	it("prefers locational claims over boilerplate puffery", () => {
		// "spacious" / "open concept" match 79% / 54% of all listings and would
		// otherwise crowd out the claim that actually helps a buyer decide.
		expect(
			listingHighlightDims([
				"Spacious and oversized with an open concept plan, and top-rated schools nearby.",
			]),
		).toEqual(["schools", "entertaining", "space"]);
	});

	it("orders by PRIORITY, not by order of appearance in the prose", () => {
		expect(
			listingHighlightDims([
				"Move-in ready. Private backyard. Award-winning schools.",
			]),
		).toEqual(["schools", "outdoors", "move_in"]);
	});

	// ── Real rows from the live database (source = 'fmls') ────────────────────

	it("extracts from 735 Westwind Lane's real prose", () => {
		const dims = listingHighlightDims([
			"Professional photos coming on Friday July 17th. This wonderful home is one that you have to see inside, MUCH bigger inside than appears from exterior. Ideal for multi-generational living, 6 bedrooms PLUS a dedicated office. Close to schools (students can walk to Alpharetta High School) and there is neighborhood access to The Big Creek Parkway Walking Trails. EV charger plug in garage.",
		]);
		// "Walking Trails" is the greenway signal and is printed.
		//
		// "students can walk to Alpharetta High School" is deliberately NOT a
		// schools match: it is a proximity claim, and the chip this dim renders
		// says "Top Schools" — a quality claim the sentence never makes.
		expect(dims).toEqual(["trails"]);
	});

	it("extracts from 80 Club Court's real prose", () => {
		const dims = listingHighlightDims([
			"Excellent schools and a family-friendly street. Walking distance to the village. Newly renovated throughout with expansive living areas perfect for entertaining.",
		]);
		expect(dims).toEqual(["schools", "walkable", "family"]);
	});

	// ── Claims we deliberately refuse to make ────────────────────────────────

	it("does not claim Top Schools from a bare school-district mention", () => {
		// Every house is in a school district — the phrase asserts no quality.
		expect(
			listingHighlightDims(["Located in the Fulton County school district."]),
		).toEqual([]);
	});

	it("does not claim a private backyard from the word 'yard' alone", () => {
		expect(
			listingHighlightDims(["The home has a yard and a driveway."]),
		).toEqual([]);
	});

	it("never emits hip or nightlife from adjectives like 'vibrant'", () => {
		// 'vibrant' appears in listings 40 minutes from anything; it carries no
		// locational content, so no Cultural Scene chip may come from it.
		const dims = listingHighlightDims([
			"A vibrant and trendy home in a wonderful setting with nightlife nearby.",
		]);
		expect(dims).not.toContain("hip");
		expect(dims).not.toContain("nightlife");
	});

	it("does not match a dim word buried inside another word", () => {
		expect(
			listingHighlightDims(["The sidewalkable pattern is unusual."]),
		).not.toContain("walkable");
	});

	it("is case-insensitive — agents write chunks in ALL CAPS", () => {
		expect(
			listingHighlightDims(["LEVEL BACKYARD and BRAND NEW construction."]),
		).toEqual(["outdoors", "move_in"]);
	});

	it("reads across all paragraphs, not just the first", () => {
		expect(
			listingHighlightDims(["A lovely home.", "Quiet cul-de-sac location."]),
		).toEqual(["quiet"]);
	});

	// ── Recall widened 2026-08-01 (owner: at least three chips) ───────────────
	// Each of these asserts a claim the dim ALREADY makes, in wording the
	// original patterns did not list. They exist because 3+ coverage was 47.3%.

	it("counts a screened porch as outdoor living space", () => {
		expect(
			listingHighlightDims(["Enjoy the large screened porch out back."]),
		).toContain("outdoors");
	});

	it("counts community tennis courts and a playground as family amenities", () => {
		expect(
			listingHighlightDims([
				"The neighborhood offers a clubhouse, tennis courts and a playground.",
			]),
		).toContain("family");
	});

	it("counts new roof / new HVAC as move-in ready", () => {
		expect(
			listingHighlightDims(["Major updates done: new roof and new HVAC."]),
		).toContain("move_in");
	});

	it("counts walk-to-school as a walkability claim", () => {
		expect(
			listingHighlightDims(["Walk to schools and the park from your door."]),
		).toContain("walkable");
	});

	it("counts a nature preserve as trails", () => {
		expect(
			listingHighlightDims(["Minutes from the Blue Heron Nature Preserve."]),
		).toContain("trails");
	});

	it("does NOT claim move-in ready from a freshly painted FENCE", () => {
		// Caught while reviewing real matched sentences: one live listing says
		// "back deck overlooking a freshly painted backyard fence". Painting a
		// fence is not the "nothing left to do" claim `move_in` makes.
		expect(
			listingHighlightDims([
				"A back deck overlooking a freshly painted backyard fence.",
			]),
		).not.toContain("move_in");
	});

	it("still claims move-in ready from freshly painted interiors", () => {
		expect(
			listingHighlightDims(["Freshly painted inside with new flooring."]),
		).toContain("move_in");
	});
});
