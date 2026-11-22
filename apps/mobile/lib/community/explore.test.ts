import type { CommunityProfile } from "@percho/shared/community-profile";
import { describe, expect, it } from "vitest";
import {
	CURVE_STEPS,
	againstBaseline,
	axisTop,
	closeBy,
	homeRanks,
	localDay,
	milesOf,
	monotoneSlopes,
	nearbyStops,
	otherRanks,
	pointAt,
	rankGroups,
	schoolName,
	schoolRanks,
	strokes,
	topShare,
	upcomingEvents,
	usdShort,
} from "./explore";

const seg = (name: string, distance: string, bucket: string) => ({
	name,
	distance,
	bucket,
	endFraction: 0,
});

describe("nearbyStops", () => {
	const film = [
		seg("Windward Pool", "0 mi", "amenities"),
		seg("Trader Joe's", "1.4 mi", "daily_errands"),
		seg("Trader Joe's", "1.4 mi", "daily_errands"),
		seg("Halcyon", "4.8 mi", "shopping"),
		seg("Vinny's", "2.1 mi", "dining"),
		seg("Lake Windward Drive", "0.9 mi", "waterfront"),
		seg("Alpharetta High School", "1.9 mi", "schools"),
		seg("Avalon", "2.9 mi", "kids"),
	];

	it("reads the miles out of a distance label", () => {
		expect(milesOf("1.4 mi")).toBe(1.4);
		expect(milesOf("0 mi")).toBe(0);
		expect(milesOf("")).toBeNull();
		expect(milesOf(undefined)).toBeNull();
	});

	it("counts each place once and leaves the community's own amenities out", () => {
		const view = nearbyStops(film);
		expect(view?.stops.map((s) => s.name)).toEqual([
			"Lake Windward Drive",
			"Trader Joe's",
			"Alpharetta High School",
			"Vinny's",
			"Avalon",
			"Halcyon",
		]);
		expect(view?.axisMiles).toBe(5);
	});

	it("draws five kinds of stop in a fixed order, empty rows dropped", () => {
		expect(nearbyStops(film)?.rows.map((r) => r.group)).toEqual([
			"Errands",
			"Food & drink",
			"Outdoors",
			"Schools",
			"More",
		]);
	});

	it("names one place of each kind for the tile, the closest filmed", () => {
		const view = nearbyStops([
			...film,
			seg("Publix", "0.6 mi", "shopping"),
			seg("Big Creek Greenway", "2.4 mi", "outdoor"),
		]);
		expect(view && closeBy(view)).toEqual([
			{ group: "Errands", name: "Publix", miles: 0.6 },
			{ group: "Food & drink", name: "Vinny's", miles: 2.1 },
			{ group: "Outdoors", name: "Lake Windward Drive", miles: 0.9 },
		]);
	});

	it("falls back to whatever was filmed when no everyday kind was", () => {
		const view = nearbyStops([
			seg("Alpharetta High School", "1.9 mi", "schools"),
			seg("Webb Bridge Middle School", "2.2 mi", "schools"),
			seg("Avalon", "2.9 mi", "kids"),
			seg("City Hall", "3.1 mi", "civic"),
		]);
		expect(view && closeBy(view).map((s) => s.group)).toEqual([
			"Schools",
			"More",
		]);
	});

	it("says nothing about a film that names too few places", () => {
		expect(nearbyStops(film.slice(0, 4))).toBeNull();
		expect(nearbyStops(undefined)).toBeNull();
	});
});

describe("schoolName", () => {
	it("puts back the ending the stored row leaves off", () => {
		expect(schoolName({ label: "Elementary", note: "Cumming" })).toBe(
			"Cumming Elementary School",
		);
		expect(schoolName({ label: "High", note: "Forsyth Central" })).toBe(
			"Forsyth Central High School",
		);
	});

	it("leaves a name alone when it already says its kind", () => {
		expect(schoolName({ label: "Elementary", note: "Matt Elementary" })).toBe(
			"Matt Elementary",
		);
		expect(schoolName({ label: "High", note: "Alpharetta HS" })).toBe(
			"Alpharetta HS",
		);
		expect(schoolName({ label: "High", note: "Alliance Academy" })).toBe(
			"Alliance Academy",
		);
		// "High" inside a word is not the level.
		expect(schoolName({ label: "Middle", note: "Highland" })).toBe(
			"Highland Middle School",
		);
	});

	it("does not dress a remark as a name", () => {
		expect(schoolName({ label: "Elementary", note: "two serve it" })).toBe(
			"Elementary · two serve it",
		);
		expect(schoolName({ label: "Middle" })).toBe("Middle");
	});
});

describe("ranks", () => {
	const rows = [
		{ group: "Schools", label: "Elementary", tile: "#3–6" },
		{ group: "Schools", label: "Middle", tile: "#7" },
		{ group: "Homes", label: "Home value", tile: "#7" },
		{ group: "Homes", label: "5-year growth" },
		{ group: "People", label: "Size", tile: "#6" },
		{ group: "People", label: "Extra", tile: "#9" },
	].map((r) => ({ rank: "#1", of: "of 2", percentile: 50, ...r }));

	it("keeps schools, prices and the rest apart", () => {
		// Owner 2026-11-22: "school和price分开吧".
		expect(schoolRanks({ rows }).map((r) => r.label)).toEqual([
			"Elementary",
			"Middle",
		]);
		expect(homeRanks({ rows }).map((r) => r.label)).toEqual([
			"Home value",
			"5-year growth",
		]);
		expect(otherRanks({ rows }).map((r) => r.label)).toEqual(["Size", "Extra"]);
		expect(schoolRanks(undefined)).toEqual([]);
		expect(homeRanks(undefined)).toEqual([]);
	});

	it("says a rank as a share someone can read", () => {
		// Sawnee Village's tile read "#452 / of 1,220 in GA" — owner 2026-11-22:
		// "看了数字跟没看一样".
		const row = (rank: string, of: string, percentile = 50) => ({
			rank,
			of,
			percentile,
		});
		expect(topShare(row("#452", "of 1,220 in GA"))).toBe("Top 38%");
		expect(topShare(row("#11", "of 146 metro cities"))).toBe("Top 8%");
		// Never better than the rank: #3 of 1,220 is 0.25%, not "Top 0%".
		expect(topShare(row("#3", "of 1,220 in GA"))).toBe("Top 1%");
		// Two schools in one row: the worse of the two.
		expect(topShare(row("#3 · #6", "of 1,220 in GA"))).toBe("Top 1%");
		expect(topShare(row("#1,100", "of 1,220 in GA"))).toBe("Top 91%");
		// A rank that is not a number falls back to the share ranked below.
		expect(topShare(row("top tier", "statewide", 93.2))).toBe("Top 7%");
	});

	it("groups rows under their headings in profile order", () => {
		expect(rankGroups(rows).map((g) => [g.group, g.rows.length])).toEqual([
			["Schools", 2],
			["Homes", 2],
			["People", 2],
		]);
	});
});

describe("againstBaseline", () => {
	const value = (v: number, baseline: number) =>
		({
			area: "Cumming",
			display: "$586K",
			change: "+58% since 2020",
			headline: "Up 58% since 2020.",
			baseline: "Metro Atlanta",
			series: [
				{ year: 2025, value: 600_000, baseline: 380_000 },
				{ year: 2026, value: v, baseline },
			],
		}) satisfies NonNullable<CommunityProfile["homeValue"]>;

	it("says how far the newest value sits from its baseline", () => {
		expect(againstBaseline(value(586_393, 375_898))).toBe(
			"56% above Metro Atlanta",
		);
		expect(againstBaseline(value(300_000, 375_000))).toBe(
			"20% below Metro Atlanta",
		);
		expect(againstBaseline(value(380_000, 375_000))).toBe(
			"In line with Metro Atlanta",
		);
	});

	it("says nothing without a baseline to compare", () => {
		expect(againstBaseline(value(586_393, 0))).toBeNull();
		expect(againstBaseline({ ...value(1, 1), series: [] })).toBeNull();
	});
});

describe("upcomingEvents", () => {
	const events: CommunityProfile["events"] = [
		{
			date: "2026-12-04",
			until: "2027-01-04",
			title: "Lights on the Loop",
			where: "Alpha Loop",
		},
		{ date: "2026-11-21", title: "Tree lighting", where: "Downtown" },
		{
			date: "2026-11-22",
			until: "2027-01-18",
			title: "Avalon on Ice",
			where: "Avalon",
			url: "https://example.com",
		},
	];

	it("lists what is ahead, soonest first, with the weekday of a single day", () => {
		expect(upcomingEvents(events, "2026-11-15").map((e) => e.when)).toEqual([
			"Sat Nov 21",
			"From Nov 22",
			"From Dec 4",
		]);
	});

	it("drops what has passed, and says when a running thing ends", () => {
		const view = upcomingEvents(events, "2026-12-10");
		expect(view.map((e) => [e.title, e.when])).toEqual([
			["Avalon on Ice", "To Jan 18"],
			["Lights on the Loop", "To Jan 4"],
		]);
		expect(upcomingEvents(events, "2027-02-01")).toEqual([]);
		expect(upcomingEvents(undefined, "2026-11-15")).toEqual([]);
	});

	it("reads today off the device's own calendar", () => {
		expect(localDay(new Date(2026, 10, 5, 23, 59))).toBe("2026-11-05");
	});
});

describe("lines", () => {
	it("places a value in its box, largest at the top", () => {
		expect(pointAt([0, 50, 100], 2, 200, 100, 100)).toEqual({ x: 200, y: 0 });
		expect(pointAt([0, 50, 100], 1, 200, 100, 100)).toEqual({ x: 100, y: 50 });
	});

	it("joins the points with a smooth run of short pieces", () => {
		const pieces = strokes([0, 100, 100], 200, 100, 100);
		expect(pieces).toHaveLength(2 * CURVE_STEPS);
		// Rising on screen is a negative (anticlockwise) turn; the flat end is level.
		expect(pieces[0]?.angle).toBeLessThan(0);
		expect(pieces.at(-1)?.angle).toBeCloseTo(0);
		// No corner: neighbouring pieces turn by a few degrees at most.
		for (let i = 1; i < pieces.length; i++) {
			const turn = Math.abs(
				(pieces[i]?.angle ?? 0) - (pieces[i - 1]?.angle ?? 0),
			);
			expect(turn).toBeLessThan(0.35);
		}
		expect(strokes([5], 200, 100, 100)).toEqual([]);
	});

	it("never swings past the data between two points", () => {
		// Rising then flat: the curve must not overshoot the top (y = 0).
		const pieces = strokes([0, 100, 100, 100], 300, 100, 100);
		for (const p of pieces) expect(p.cy).toBeGreaterThanOrEqual(-1e-9);
		expect(monotoneSlopes([0, 10, 10])).toEqual([10, 0, 0]);
	});

	it("rounds a money axis up, and prints money short", () => {
		expect(axisTop([414000, 759000])).toBe(800000);
		expect(usdShort(747000)).toBe("$747K");
		expect(usdShort(1200000)).toBe("$1.2M");
	});
});
