import { describe, expect, it } from "vitest";
import type { ListingDetailDTO, QuestionAnswerDTO } from "./detail-dto";
import { houseEraAnswer, mergeAnswers, rankQuestions } from "./questions";

const base: ListingDetailDTO = {
	id: "l1",
	slug: "s",
	address: "10404 NE 198th St",
	city: "Bothell",
	state: "WA",
	photos: [],
	comps: { cohortLabel: "Bothell", pricesUsd: [] },
};

function ans(id: string, decisiveness: 1 | 2 | 3 = 2): QuestionAnswerDTO {
	return {
		id,
		answer: `answer for ${id}`,
		basis: [{ type: "road", note: "measured" }],
		decisiveness,
		form: "text",
	};
}

describe("houseEraAnswer", () => {
	it("is null without a year — no invented checklist", () => {
		expect(houseEraAnswer(undefined)).toBeNull();
		expect(houseEraAnswer(Number.NaN)).toBeNull();
	});

	it("names the decade and cites the listing record as its basis", () => {
		const a = houseEraAnswer(1967);
		expect(a?.id).toBe("house.era");
		expect(a?.answer).toContain("A 1960s build");
		expect(a?.answer).toContain("Federal Pacific");
		expect(a?.basis).toEqual([
			{ type: "assessor", note: "Built 1967 (listing record)" },
		]);
		expect(a?.form).toBe("checklist");
	});

	it("gives every decade a non-empty list", () => {
		for (const y of [1910, 1950, 1975, 1985, 1995, 2005, 2015, 2024]) {
			expect(houseEraAnswer(y)?.answer.split("\n").length).toBeGreaterThan(1);
		}
	});
});

describe("mergeAnswers", () => {
	it("adds the era rule when the server did not answer house.era", () => {
		const out = mergeAnswers({ ...base, yearBuilt: 1967 });
		expect(out.map((a) => a.id)).toEqual(["house.era"]);
	});

	it("lets a server house.era win over the local rule", () => {
		const server = { ...ans("house.era"), form: "checklist" };
		const out = mergeAnswers({
			...base,
			yearBuilt: 1967,
			questions: [server],
		});
		expect(out).toEqual([server]);
	});

	it("is empty with no year and no server answers — section stays absent", () => {
		expect(mergeAnswers(base)).toEqual([]);
	});
});

describe("rankQuestions", () => {
	it("pins the cold-start five above a higher-decisiveness answer while affinity is empty", () => {
		const out = rankQuestions(
			[ans("sound.freeway", 3), ans("logistics.turn", 1)],
			{},
		);
		expect(out.map((r) => r.def.id)).toEqual([
			"logistics.turn",
			"sound.freeway",
		]);
	});

	it("drops the pin once the buyer has opened anything, and weights by theme affinity", () => {
		const out = rankQuestions(
			[ans("logistics.turn", 2), ans("sound.freeway", 2)],
			{ sound: 2 },
		);
		expect(out.map((r) => r.def.id)).toEqual([
			"sound.freeway",
			"logistics.turn",
		]);
	});

	it("breaks ties in bank order so the list is stable", () => {
		const out = rankQuestions(
			[ans("sound.planes", 2), ans("vibe.porch", 2), ans("people.tenure", 2)],
			{ vibe: 1 },
		);
		// vibe.porch scores 2×2=4; the other two score 2 and fall to bank order.
		expect(out.map((r) => r.def.id)).toEqual([
			"vibe.porch",
			"people.tenure",
			"sound.planes",
		]);
	});

	it("silently drops unknown and reserved ids", () => {
		const out = rankQuestions(
			[ans("made.up"), ans("people.demographics"), ans("kids.zone")],
			{},
		);
		expect(out.map((r) => r.def.id)).toEqual(["kids.zone"]);
	});
});
