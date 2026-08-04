/**
 * §2.4 #2 section-nav tests.
 *
 * Two failure modes are worth pinning, because both present as "the app forgot
 * what I tapped" and neither shows up in a screenshot:
 *   - a chip for a section that isn't on the page (a dead jump);
 *   - the wrong chip highlighted, especially at the top of the page before
 *     anything has laid out.
 */
import { describe, expect, it } from "vitest";
import type { Hotspot, HotspotRoom } from "./hotspot";
import { buildNavChips, currentNavKey, navKey } from "./section-nav";

const hotspot = (id: string, room: HotspotRoom): Hotspot => ({
	id,
	room,
	title: `${room} feature`,
	mediaUrl: `https://example.test/${id}.jpg`,
	pin: { x: 0.5, y: 0.5 },
	actions: [],
});

const NONE = {
	hasMonthly: false,
	hasComps: false,
	hasCosts: false,
	hasCommunity: false,
};

describe("buildNavChips", () => {
	it("returns [] when Overview would be the only chip", () => {
		// A one-chip strip can only point at where the buyer already is.
		expect(buildNavChips({ hotspots: [], ...NONE })).toEqual([]);
	});

	it("puts Overview first, then rooms in hotspot order, then fixed sections", () => {
		const chips = buildNavChips({
			hotspots: [hotspot("h1", "kitchen"), hotspot("h2", "backyard")],
			hasMonthly: true,
			hasComps: true,
			hasCosts: true,
			hasCommunity: false,
		});
		expect(chips.map((c) => c.label)).toEqual([
			"Overview",
			"Kitchen",
			"Yard",
			"Monthly",
			"Comps",
			"Costs",
		]);
	});

	it("omits a chip whose section is not rendered", () => {
		const chips = buildNavChips({
			hotspots: [hotspot("h1", "kitchen")],
			hasMonthly: true,
			hasComps: false,
			hasCosts: false,
			hasCommunity: false,
		});
		// No Comps chip: a chip that scrolls nowhere is worse than no chip.
		expect(chips.map((c) => c.key)).toEqual([
			"overview",
			"hotspot:h1",
			"monthly",
		]);
	});

	it("keeps two hotspots of the same room as two separate chips", () => {
		// Merging them would make the chip scroll to whichever laid out last.
		const chips = buildNavChips({
			hotspots: [hotspot("h1", "bedroom"), hotspot("h2", "bedroom")],
			...NONE,
		});
		expect(chips.map((c) => c.key)).toEqual([
			"overview",
			"hotspot:h1",
			"hotspot:h2",
		]);
	});

	it("labels a backyard 'Yard', matching the mockup", () => {
		const chips = buildNavChips({
			hotspots: [hotspot("h1", "backyard")],
			hasMonthly: true,
			hasComps: false,
			hasCosts: false,
			hasCommunity: false,
		});
		expect(chips[1]?.label).toBe("Yard");
	});
});

describe("navKey", () => {
	it("namespaces a hotspot so it cannot collide with a fixed section", () => {
		expect(navKey({ kind: "section", id: "monthly" })).toBe("monthly");
		expect(navKey({ kind: "hotspot", id: "monthly", room: "kitchen" })).toBe(
			"hotspot:monthly",
		);
	});
});

describe("currentNavKey", () => {
	const chips = buildNavChips({
		hotspots: [hotspot("h1", "kitchen")],
		hasMonthly: true,
		hasComps: false,
		hasCosts: false,
		hasCommunity: false,
	});
	const offsets = { overview: 200, "hotspot:h1": 600, monthly: 1000 };

	it("is the first chip at the top of the page", () => {
		expect(currentNavKey(chips, offsets, 0)).toBe("overview");
	});

	it("is the last section whose top has passed the activation line", () => {
		expect(currentNavKey(chips, offsets, 650)).toBe("hotspot:h1");
		expect(currentNavKey(chips, offsets, 1200)).toBe("monthly");
	});

	it("counts a section flush with the line as reached", () => {
		expect(currentNavKey(chips, offsets, 600)).toBe("hotspot:h1");
	});

	it("applies the activation offset, so a heading counts once it clears the strip", () => {
		// scrollY 560 + 46 of sticky chrome = 606, past the 600 heading.
		expect(currentNavKey(chips, offsets, 560, 46)).toBe("hotspot:h1");
		expect(currentNavKey(chips, offsets, 560, 0)).toBe("overview");
	});

	it("skips unmeasured sections instead of treating them as y=0", () => {
		// Monthly has not laid out; a missing offset must not read as the top of
		// the page, which would make every chip look current on first paint.
		expect(currentNavKey(chips, { overview: 200 }, 5000)).toBe("overview");
	});

	it("is null with no chips", () => {
		expect(currentNavKey([], {}, 0)).toBeNull();
	});
});
