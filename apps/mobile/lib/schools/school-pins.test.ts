import { describe, expect, it } from "vitest";
import {
	MAX_PINS,
	type MapRegion,
	NAMED_MAX,
	PROFICIENCY_BANDS,
	PROFICIENCY_LEGEND,
	type SchoolPin,
	levelsForZoom,
	parseSchoolPins,
	proficiencyStep,
	schoolNote,
	shortSchoolName,
	shouldLabel,
	visibleSchools,
} from "./school-pins";

function pin(over: Partial<SchoolPin> = {}): SchoolPin {
	return {
		id: over.id ?? "s1",
		name: "Milton High",
		level: "high",
		lat: 33.75,
		lng: -84.39,
		...over,
	};
}

/** The metro at rest, as `search.tsx` opens it. */
const METRO: MapRegion = {
	latitude: 33.749,
	longitude: -84.388,
	latitudeDelta: 0.55,
	longitudeDelta: 0.45,
};

describe("parsing the payload", () => {
	it("keeps a well-formed school", () => {
		const { schools } = parseSchoolPins({
			state: "GA",
			schools: [
				{
					id: "s1",
					name: "Milton High",
					level: "high",
					lat: 34.13,
					lng: -84.3,
					district: "Fulton County",
					proficiencyPct: 67,
				},
			],
		});
		expect(schools).toHaveLength(1);
		expect(schools[0]?.proficiencyPct).toBe(67);
		expect(schools[0]?.district).toBe("Fulton County");
	});

	it("keeps a school with no published score rather than dropping it", () => {
		// An unrated school is still a school a buyer can see standing there.
		const { schools } = parseSchoolPins({
			schools: [
				{ id: "s1", name: "New Charter", level: "middle", lat: 33, lng: -84 },
			],
		});
		expect(schools).toHaveLength(1);
		expect(schools[0]?.proficiencyPct).toBeUndefined();
	});

	it("drops a row with no coordinate — it cannot be drawn", () => {
		const { schools } = parseSchoolPins({
			schools: [
				{ id: "s1", name: "Nowhere High", level: "high", lat: null, lng: -84 },
				{ id: "s2", name: "Elsewhere High", level: "high" },
			],
		});
		expect(schools).toHaveLength(0);
	});

	it("drops a level outside the ladder the map draws", () => {
		// `k8` and `other` are real values in the table; the zoom rule has no
		// rung for them, so the layer does not pretend to place them.
		const { schools } = parseSchoolPins({
			schools: [
				{ id: "s1", name: "K-8 Academy", level: "k8", lat: 33, lng: -84 },
				{ id: "s2", name: "Real High", level: "high", lat: 33, lng: -84 },
			],
		});
		expect(schools.map((s) => s.name)).toEqual(["Real High"]);
	});

	it("survives a payload that is not what we expect at all", () => {
		expect(parseSchoolPins(null).schools).toEqual([]);
		expect(parseSchoolPins({ schools: "nope" }).schools).toEqual([]);
		expect(parseSchoolPins({ schools: [42, null] }).schools).toEqual([]);
	});
});

describe("the zoom ladder", () => {
	it("shows high schools at metro and county range", () => {
		// 0.55 is the opening frame; 0.5 is where a county tap lands.
		expect(levelsForZoom(0.55)).toEqual(["high"]);
		expect(levelsForZoom(0.5)).toEqual(["high"]);
	});

	it("holds city range to high schools, so the names fit", () => {
		// 0.18 is where a city drill lands. Retuned in phase275: high + middle
		// is 29 pins over downtown Atlanta, which is fine as dots and a wall of
		// overlapping labels with names on. High-only holds that frame at 13.
		expect(levelsForZoom(0.18)).toEqual(["high"]);
	});

	it("adds middles once the frame is a neighbourhood", () => {
		expect(levelsForZoom(0.1)).toEqual(["high", "middle"]);
	});

	it("shows everything at street range", () => {
		// 0.06 is a single search hit.
		expect(levelsForZoom(0.06)).toEqual(["high", "middle", "elementary"]);
	});

	it("draws nothing when pinched out past the metro", () => {
		// At state range the pins are a smear over the county colours, which are
		// the answer the lens is already giving.
		expect(levelsForZoom(2)).toEqual([]);
		expect(levelsForZoom(Number.NaN)).toEqual([]);
	});
});

describe("which schools get drawn", () => {
	it("draws nothing at all when no lens-worthy zoom applies", () => {
		expect(visibleSchools([pin()], { ...METRO, latitudeDelta: 3 })).toEqual([]);
	});

	it("leaves out a school outside the view", () => {
		const here = pin({ id: "here", lat: 33.75, lng: -84.39 });
		const savannah = pin({ id: "far", lat: 32.08, lng: -81.09 });
		const drawn = visibleSchools([here, savannah], METRO);
		expect(drawn.map((s) => s.id)).toEqual(["here"]);
	});

	it("leaves out a level this zoom does not show", () => {
		const high = pin({ id: "h", level: "high" });
		const elem = pin({ id: "e", level: "elementary" });
		expect(visibleSchools([high, elem], METRO).map((s) => s.id)).toEqual(["h"]);
		// Zoomed in, both.
		const close = { ...METRO, latitudeDelta: 0.05, longitudeDelta: 0.04 };
		expect(
			visibleSchools([high, elem], close)
				.map((s) => s.id)
				.sort(),
		).toEqual(["e", "h"]);
	});

	it("caps the pin count for a viewport that is too full", () => {
		const many = Array.from({ length: MAX_PINS + 40 }, (_, i) =>
			pin({ id: `s${i}`, lat: 33.749 + i * 0.0005 }),
		);
		expect(visibleSchools(many, METRO)).toHaveLength(MAX_PINS);
	});

	it("caps by distance from the centre, never by score", () => {
		// A layer that thinned itself by proficiency would draw a map where the
		// good schools are the only ones that exist. The near school is the
		// worst-scoring one on purpose.
		const near = pin({
			id: "near",
			lat: 33.749,
			lng: -84.388,
			proficiencyPct: 9,
		});
		const far = pin({
			id: "far",
			lat: 33.95,
			lng: -84.388,
			proficiencyPct: 99,
		});
		expect(visibleSchools([far, near], METRO, 1).map((s) => s.id)).toEqual([
			"near",
		]);
	});

	it("is stable for two schools the same distance out", () => {
		// Ties break on name, so a pin does not swap in and out between renders.
		const a = pin({ id: "a", name: "Avery", lat: 33.759 });
		const b = pin({ id: "b", name: "Bell", lat: 33.739 });
		expect(visibleSchools([b, a], METRO, 1).map((s) => s.name)).toEqual([
			"Avery",
		]);
	});
});

describe("colouring a pin by its score", () => {
	it("spreads the published range across the whole ramp", () => {
		expect(proficiencyStep(20)).toBe(0);
		expect(proficiencyStep(30)).toBe(1);
		expect(proficiencyStep(50)).toBe(2);
		expect(proficiencyStep(60)).toBe(3);
		expect(proficiencyStep(80)).toBe(4);
	});

	it("has no step for a school the state never scored", () => {
		// Which is what makes the pin grey rather than "average" — "we don't
		// know" is a different claim from a middling one.
		expect(proficiencyStep(undefined)).toBeUndefined();
		expect(proficiencyStep(Number.NaN)).toBeUndefined();
	});

	it("does not use a quantile of what is on screen", () => {
		// Fixed bands: the same school must not change colour because the buyer
		// panned. 67% is step 3 whether or not anything else is in view.
		expect(proficiencyStep(67)).toBe(3);
		expect(proficiencyStep(67)).toBe(proficiencyStep(67));
	});
});

describe("naming a pin", () => {
	it("drops the word every school ends in", () => {
		// The dot already said it is a school.
		expect(shortSchoolName("Milton High School")).toBe("Milton High");
	});

	it("keeps the level but shortens it", () => {
		// At a zoom showing both, the level word is the only thing telling two
		// pins a block apart from each other.
		expect(shortSchoolName("Hollis Hand Elementary School")).toBe(
			"Hollis Hand Elem.",
		);
		expect(shortSchoolName("Trickum Middle School")).toBe("Trickum Mid.");
	});

	it("truncates a name too long for a map pin", () => {
		const out = shortSchoolName(
			"Dr Martin Luther King Junior Memorial Academy School",
		);
		expect(out.length).toBeLessThanOrEqual(22);
		expect(out.endsWith("…")).toBe(true);
	});

	it("never returns an empty label", () => {
		// A row literally named "School" would otherwise render as a blank chip.
		expect(shortSchoolName("School")).toBe("School");
		expect(shortSchoolName("  Grady   High   School ")).toBe("Grady High");
	});
});

describe("deciding whether names fit", () => {
	it("labels a handful", () => {
		expect(shouldLabel(1)).toBe(true);
		expect(shouldLabel(NAMED_MAX)).toBe(true);
	});

	it("falls back to bare dots past the limit", () => {
		// Past two dozen the labels stack on each other and the layer becomes
		// less legible than the dots alone.
		expect(shouldLabel(NAMED_MAX + 1)).toBe(false);
	});

	it("says no when there is nothing to label", () => {
		expect(shouldLabel(0)).toBe(false);
	});
});

describe("the pin scale is not the county scale", () => {
	it("keeps its own absolute bands", () => {
		// The county fill is a quantile rank over 29 averages spanning 22-67%.
		// Borrowing it would put every school above ~49% in the darkest step,
		// so a 55% school and a 99% school would be one colour.
		expect(PROFICIENCY_BANDS).toEqual([25, 40, 55, 70]);
		expect(proficiencyStep(55)).not.toBe(proficiencyStep(99));
	});

	it("labels both ends the way the legend prints them", () => {
		expect(PROFICIENCY_LEGEND.low).toBe("<25%");
		expect(PROFICIENCY_LEGEND.high).toBe("70%+");
	});

	it("puts a band edge in the higher step", () => {
		// A school sitting exactly on 40 is in the 40-55 band, not below it.
		expect(proficiencyStep(39.9)).toBe(1);
		expect(proficiencyStep(40)).toBe(2);
	});
});

describe("the callout line", () => {
	it("names the level and the score", () => {
		expect(schoolNote(pin({ proficiencyPct: 67 }))).toBe(
			"High · 67% proficient",
		);
		expect(schoolNote(pin({ level: "elementary", proficiencyPct: 41 }))).toBe(
			"Elementary · 41% proficient",
		);
	});

	it("says plainly that there is no score rather than showing a zero", () => {
		expect(schoolNote(pin({ level: "middle" }))).toBe(
			"Middle · no state score published",
		);
	});
});
