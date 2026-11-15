import type { CommunityProfile } from "@percho/shared/community-profile";
import { describe, expect, it } from "vitest";
import {
	axisTop,
	dotAt,
	localDay,
	milesOf,
	nearbyStops,
	pointAt,
	rankGroups,
	strokes,
	tileRanks,
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
		expect(view?.near).toBe(5);
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

	it("says nothing about a film that names too few places", () => {
		expect(nearbyStops(film.slice(0, 4))).toBeNull();
		expect(nearbyStops(undefined)).toBeNull();
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

	it("puts the first four tile ranks on the tile", () => {
		expect(tileRanks({ rows }).map((r) => r.label)).toEqual([
			"Elementary",
			"Middle",
			"Home value",
			"Size",
		]);
		expect(tileRanks(undefined)).toEqual([]);
	});

	it("groups rows under their headings in profile order", () => {
		expect(rankGroups(rows).map((g) => [g.group, g.rows.length])).toEqual([
			["Schools", 2],
			["Homes", 2],
			["People", 2],
		]);
	});

	it("keeps a dot off the ends of its track", () => {
		expect(dotAt(99.8)).toBe("97%");
		expect(dotAt(0)).toBe("3%");
		expect(dotAt(42)).toBe("42%");
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

	it("joins the points with rotated pieces", () => {
		const [up, flat] = strokes([0, 100, 100], 200, 100, 100);
		expect(up?.cx).toBe(50);
		expect(up?.cy).toBe(50);
		expect(up?.length).toBeCloseTo(Math.hypot(100, 100));
		// Rising on screen is a negative (anticlockwise) turn.
		expect(up?.angle).toBeCloseTo(-Math.PI / 4);
		expect(flat?.angle).toBeCloseTo(0);
		expect(strokes([5], 200, 100, 100)).toEqual([]);
	});

	it("rounds a money axis up, and prints money short", () => {
		expect(axisTop([414000, 759000])).toBe(800000);
		expect(usdShort(747000)).toBe("$747K");
		expect(usdShort(1200000)).toBe("$1.2M");
	});
});
