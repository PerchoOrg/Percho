import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ supabase: () => ({}) }));

import {
	REVIEW_BODY_MAX,
	draftProblem,
	parseDimensions,
	reviewMonth,
} from "./reviews";

describe("draftProblem", () => {
	it("needs a rating and a real paragraph", () => {
		expect(draftProblem({ rating: 0, dimensions: {}, body: "" })).toMatch(
			/rating/,
		);
		expect(draftProblem({ rating: 4, dimensions: {}, body: "short" })).toMatch(
			/at least 20/,
		);
		expect(
			draftProblem({
				rating: 4,
				dimensions: {},
				body: "x".repeat(REVIEW_BODY_MAX + 1),
			}),
		).toMatch(/under 1200/);
		expect(
			draftProblem({
				rating: 5,
				dimensions: { quiet: 4 },
				body: "  Quiet streets, friendly neighbours, easy to walk.  ",
			}),
		).toBeNull();
	});
});

describe("parseDimensions", () => {
	it("keeps only known keys scored 1–5", () => {
		expect(
			parseDimensions({ quiet: 3, walkable: 9, friendly: "5", crime: 1 }),
		).toEqual({ quiet: 3 });
		expect(parseDimensions(null)).toEqual({});
	});
});

describe("reviewMonth", () => {
	it("prints month and year only", () => {
		expect(reviewMonth("2026-08-15T12:00:00Z")).toBe("Aug 2026");
		expect(reviewMonth("junk")).toBe("");
	});
});
