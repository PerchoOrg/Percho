/**
 * `milestoneFor` tests. The §1.5 card is a CEREMONY, which makes it the single
 * most tempting place in the app to invent a number ("47 homes matched!") or to
 * congratulate a buyer on a preference they never expressed. Every test here
 * exists to prove the chips are a recap of real signal and nothing else.
 */
import { describe, expect, it } from "vitest";
import type { GeoUnit } from "./geo-unit";
import { milestoneFor } from "./milestone";
import { EMPTY_SIGNALS, type SignalState } from "./signals";

const unit = (id: string, name: string): GeoUnit => ({
	id,
	level: "city",
	name,
	state: "GA",
	centroid: { lat: 33.9, lng: -84.3 },
	communityCount: 12,
	sampleCommunityNames: [],
	stats: {},
});

const UNITS: GeoUnit[] = [
	unit("city:decatur-ga", "Decatur"),
	unit("city:marietta-ga", "Marietta"),
	unit("city:alpharetta-ga", "Alpharetta"),
];

const withSignals = (over: Partial<SignalState>): SignalState => ({
	...EMPTY_SIGNALS,
	...over,
});

describe("identity", () => {
	it("ids one card per transition, so a repeat can be suppressed (B3)", () => {
		const m = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: EMPTY_SIGNALS,
			units: [],
		});
		expect(m?.id).toBe("milestone-0-1");
		expect(m?.fromStage).toBe(0);
		expect(m?.toStage).toBe(1);
	});

	it("has real copy for every reachable transition", () => {
		for (const to of [1, 2, 3, 4] as const) {
			const m = milestoneFor({
				fromStage: 0,
				toStage: to,
				signals: EMPTY_SIGNALS,
				units: [],
			});
			expect(m?.headline.length).toBeGreaterThan(0);
			expect(m?.sub.length).toBeGreaterThan(0);
		}
	});

	it("returns null for stage 0 — there is no ceremony for the start", () => {
		expect(
			milestoneFor({
				fromStage: 0,
				toStage: 0,
				signals: EMPTY_SIGNALS,
				units: [],
			}),
		).toBeNull();
	});
});

describe("chips are a recap of REAL signal only", () => {
	it("shows no chips at all when the buyer has told us nothing", () => {
		const m = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: EMPTY_SIGNALS,
			units: UNITS,
		});
		// A short ceremony card, not a padded one. This is the case that would
		// otherwise invite a placeholder chip.
		expect(m?.chips).toEqual([]);
	});

	it("names a place only from a unit really in the pool", () => {
		const m = milestoneFor({
			fromStage: 1,
			toStage: 2,
			signals: withSignals({
				geo: [{ unitId: "city:decatur-ga", level: "city", right: 3, left: 0 }],
			}),
			units: UNITS,
		});
		expect(m?.chips).toContain("Decatur");
	});

	it("drops a signal whose unit is not in the pool rather than showing its id", () => {
		const m = milestoneFor({
			fromStage: 1,
			toStage: 2,
			signals: withSignals({
				geo: [{ unitId: "city:nowhere-ga", level: "city", right: 5, left: 0 }],
			}),
			units: UNITS,
		});
		// "city:nowhere-ga" is a slug, not buyer-facing copy.
		expect(m?.chips).toEqual([]);
	});

	it("does not name a place the buyer swiped AWAY from", () => {
		const m = milestoneFor({
			fromStage: 1,
			toStage: 2,
			signals: withSignals({
				geo: [{ unitId: "city:marietta-ga", level: "city", right: 0, left: 3 }],
			}),
			units: UNITS,
		});
		expect(m?.chips).not.toContain("Marietta");
	});

	it("orders places by real right-swipe weight, strongest first", () => {
		const m = milestoneFor({
			fromStage: 1,
			toStage: 2,
			signals: withSignals({
				geo: [
					{ unitId: "city:decatur-ga", level: "city", right: 1, left: 0 },
					{ unitId: "city:marietta-ga", level: "city", right: 6, left: 0 },
				],
			}),
			units: UNITS,
		});
		expect(m?.chips[0]).toBe("Marietta");
	});

	it("shows a budget band exactly as the buyer narrowed it, never a midpoint", () => {
		const both = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: withSignals({ budget: { minUsd: 350_000, maxUsd: 500_000 } }),
			units: [],
		});
		expect(both?.chips).toContain("$350K–$500K");

		const open = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: withSignals({ budget: { minUsd: 850_000 } }),
			units: [],
		});
		// An open-ended band stays open-ended — no invented ceiling.
		expect(open?.chips).toContain("Over $850K");

		const under = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: withSignals({ budget: { maxUsd: 500_000 } }),
			units: [],
		});
		expect(under?.chips).toContain("Under $500K");
	});

	it("omits the budget chip entirely when no band was captured", () => {
		const m = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: withSignals({ dims: { schools: 3 } }),
			units: [],
		});
		expect(m?.chips.some((c) => c.includes("$"))).toBe(false);
	});

	it("shows a dim only once it has net-positive weight", () => {
		const negative = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: withSignals({ dims: { schools: -1, walkable: 0 } }),
			units: [],
		});
		// A trade-off's discarded side goes NEGATIVE (-0.5). Reporting it as a
		// confirmed preference would invert what the buyer said.
		expect(negative?.chips).toEqual([]);

		const positive = milestoneFor({
			fromStage: 0,
			toStage: 1,
			signals: withSignals({ dims: { schools: 2 } }),
			units: [],
		});
		expect(positive?.chips.length).toBe(1);
	});

	it("caps the recap at 4 chips", () => {
		const m = milestoneFor({
			fromStage: 1,
			toStage: 2,
			signals: withSignals({
				budget: { maxUsd: 500_000 },
				dims: { schools: 5, walkable: 4, quiet: 3, outdoors: 2, family: 1 },
				geo: [
					{ unitId: "city:decatur-ga", level: "city", right: 4, left: 0 },
					{ unitId: "city:marietta-ga", level: "city", right: 3, left: 0 },
				],
			}),
			units: UNITS,
		});
		expect(m?.chips.length).toBe(4);
		// Places lead: where the buyer is looking is the more concrete confirmation.
		expect(m?.chips.slice(0, 2)).toEqual(["Decatur", "Marietta"]);
	});

	it("is deterministic — same signals in, same card out", () => {
		const input = {
			fromStage: 1 as const,
			toStage: 2 as const,
			signals: withSignals({
				dims: { schools: 3, walkable: 3 },
				geo: [
					{
						unitId: "city:decatur-ga",
						level: "city" as const,
						right: 3,
						left: 0,
					},
				],
			}),
			units: UNITS,
		};
		expect(milestoneFor(input)).toEqual(milestoneFor(input));
	});
});

describe("no fabricated statistics", () => {
	it("never puts a count of matched homes or communities in the copy", () => {
		const m = milestoneFor({
			fromStage: 3,
			toStage: 4,
			signals: withSignals({
				likedCommunityIds: ["c1", "c2"],
				dims: { schools: 4 },
			}),
			units: UNITS,
		});
		const text = `${m?.headline} ${m?.sub}`;
		// No stage copy may quote a number: nothing at this point knows how many
		// homes match, and §1.5's ceremony framing is exactly what invites one.
		expect(text).not.toMatch(/\d/);
	});
});
