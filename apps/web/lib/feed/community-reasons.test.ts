/**
 * Tests for the community card's "why people love it" tiles (layout E).
 *
 * The invariants worth asserting here are mostly about RESTRAINT — what the
 * module refuses to render — because every failure mode of this feature is a
 * fabricated claim on a real neighbourhood, not a crash:
 *
 *   · a reason is the resident's word verbatim, never paraphrased
 *   · a number appears only under a reason it is evidence FOR
 *   · two tiles never wear the same glyph
 *   · zero reasons is a valid answer (the card falls back to dims)
 */
import { describe, expect, it } from "vitest";
import {
	COMMUNITY_REASON_COUNT,
	communityReasons,
	communityReasonsAll,
	reasonPrevalence,
} from "./community-reasons";

describe("communityReasons", () => {
	it("renders the resident's own words, not a Percho category label", () => {
		// The dim path would turn these into "Cultural Scene" / "Outdoor Space" /
		// "Walkable". Layout E exists precisely so the card says what was said.
		const out = communityReasons({
			attributes: ["Convenient", "Dog Friendly", "Safe"],
		});
		expect(out.map((r) => r.label)).toEqual([
			"Convenient",
			"Dog Friendly",
			"Safe",
		]);
	});

	it("orders RAREST first, not alphabetically", () => {
		// The seed hands these over in alphabetical order. `Clean` (40.0% of all
		// communities) would have taken tile 1 and `Schools` (7.7%) would have been
		// pushed out of the row — the exact failure this ordering fixes.
		const out = communityReasons({
			attributes: ["Clean", "Peaceful", "Safe", "Schools", "Trails"],
		});
		// Trails 3.8% < Schools 7.7% < Clean 40.0% — and note Clean edges out Safe
		// (41.4%) by a hair, which is the ranking being literal about the corpus
		// rather than about how meaningful "clean" feels.
		expect(out.map((r) => r.label)).toEqual(["Trails", "Schools", "Clean"]);
	});

	it("ranks on the reason alone, not on whether a fact exists", () => {
		// "Well Maintained" (31.9%) is the only one here with a fact available.
		// Promoting it above the rarer "Lake" (4.7%) would let our data coverage
		// decide what the neighbourhood is known for.
		const out = communityReasons({
			attributes: ["Lake", "Well Maintained"],
			facts: { homeownersPct: 35 },
		});
		expect(out.map((r) => r.label)).toEqual(["Lake", "Well Maintained"]);
		expect(out[1]?.fact).toBe("35% owner-occupied");
	});

	it("gives every whitelisted label a prevalence figure", () => {
		// A newly-mapped attribute with no entry in REASON_PREVALENCE sorts last
		// forever and silently never reaches a card. This is that guard.
		const everyLabel = [
			"Peaceful", "Quiet", "Privacy", "Secluded", "Family Friendly",
			"Friendly", "Welcoming", "Neighbors", "Community", "Safe",
			"Well Maintained", "Clean", "Beautiful", "Charm", "Dog Friendly",
			"Trees", "Woods", "Nature", "Parks", "Wildlife", "Birds",
			"Landscaping", "Gardens", "Green", "Walkability", "Walking",
			"Sidewalks", "Convenient", "Location", "Proximity", "Freeway Access",
			"Restaurants", "Food", "Shopping", "Stores", "Downtown", "Schools",
			"Trails", "Hiking", "Lake", "Creek", "River", "Pond", "Yards",
			"Large", "Open", "Events", "Pool", "Golf", "Tennis",
		];
		const missing = everyLabel.filter((l) => reasonPrevalence(l) === 0);
		expect(missing).toEqual([]);
	});

	it("caps at three", () => {
		expect(
			communityReasons({
				attributes: ["Peaceful", "Dog Friendly", "Safe", "Trees", "Convenient"],
			}),
		).toHaveLength(3);
	});

	it("never repeats a glyph, even when two attributes are distinct words", () => {
		// "Peaceful" and "Quiet" are different tokens that draw the same moon. A row
		// with two identical icons reads as a rendering bug, so the second is
		// skipped and a later attribute takes the slot.
		const out = communityReasons({
			attributes: ["Peaceful", "Quiet", "Dog Friendly"],
		});
		// "Quiet" loses the moon to "Peaceful" (first appearance wins), then the row
		// is ordered by rarity: Dog Friendly 35.8% ahead of Peaceful 61.2%.
		expect(out.map((r) => r.label)).toEqual(["Dog Friendly", "Peaceful"]);
		expect(new Set(out.map((r) => r.icon)).size).toBe(out.length);
	});

	it("gives safety, neighbourliness and upkeep three DIFFERENT glyphs", () => {
		// Before 2026-08-02 the 14-glyph set forced "Safe" and "Well Maintained"
		// onto one check-circle and "Friendly" onto the family icon — three claims,
		// two pictures, one of them asserting children. Regression guard.
		const out = communityReasons({
			attributes: ["Safe", "Friendly", "Well Maintained"],
		});
		// Rarity order: Well Maintained 31.9% → Safe 41.4% → Friendly 47.7%.
		expect(out.map((r) => r.icon)).toEqual([
			"check",
			"shieldCheck",
			"handshake",
		]);
	});

	it("ignores the vocabulary's junk tail instead of rendering it", () => {
		// Real values from the seed's 193-value long tail.
		const out = communityReasons({
			attributes: [
				"Traceylynn Consultant",
				"Lash Strips",
				"Needs More Raging Parties",
				"Take-out",
				"Peaceful",
			],
		});
		expect(out.map((r) => r.label)).toEqual(["Peaceful"]);
	});

	it("returns empty rather than inventing a reason", () => {
		expect(communityReasons({ attributes: null })).toEqual([]);
		expect(communityReasons({ attributes: [] })).toEqual([]);
		expect(communityReasons({ attributes: ["Lash Strips"] })).toEqual([]);
	});

	it("trims the seed's stray trailing spaces", () => {
		// Real shape in the Nextdoor seed: "Casas ", "perros ".
		expect(
			communityReasons({ attributes: ["Dog Friendly "] })[0]?.label,
		).toBe("Dog Friendly");
	});

	it("prints an English label for a Spanish source token", () => {
		// CLAUDE.md §1: buyer-facing chrome is English even though the seed has
		// Spanish-language neighbourhoods. The token is real; the label is ours.
		const out = communityReasons({
			attributes: ["Tranquilo", "Ideal para familias"],
		});
		// Ranked by the ENGLISH label's prevalence: Family Friendly 58.8% before
		// Peaceful 61.2%. The Spanish token's own rarity is irrelevant — it is the
		// same claim, just left in another language.
		expect(out.map((r) => r.label)).toEqual(["Family Friendly", "Peaceful"]);
	});

	describe("sub-facts", () => {
		it("attaches owner-occupancy under Well Maintained", () => {
			const out = communityReasons({
				attributes: ["Well Maintained"],
				facts: { homeownersPct: 35 },
			});
			expect(out[0]?.fact).toBe("35% owner-occupied");
		});

		it("attaches the resident count under a neighbourliness reason", () => {
			const out = communityReasons({
				attributes: ["Welcoming"],
				facts: { residentsCount: 1343 },
			});
			// Thousands separator: "1343 residents" reads as an id, not a count.
			expect(out[0]?.fact).toBe("1,343 residents");
		});

		it("omits the fact when the DB has no row for it", () => {
			const out = communityReasons({
				attributes: ["Well Maintained", "Welcoming"],
				facts: {},
			});
			expect(out.every((r) => r.fact === undefined)).toBe(true);
			// The tile still renders — label-only is the canon 84pt tile.
			expect(out).toHaveLength(2);
		});

		it("treats zero as no data rather than printing '0%'", () => {
			const out = communityReasons({
				attributes: ["Well Maintained", "Welcoming"],
				facts: { homeownersPct: 0, residentsCount: 0 },
			});
			expect(out.every((r) => r.fact === undefined)).toBe(true);
		});

		it("does NOT put average age under Family Friendly", () => {
			// The average age of adults on Nextdoor is not evidence that children
			// live there. It reads as proof and is not, so there is deliberately no
			// `avgAge` input to this module at all — asserted via the type surface
			// plus this case, so a future 'helpful' addition trips a red test.
			const out = communityReasons({
				attributes: ["Family Friendly"],
				facts: { residentsCount: 343, homeownersPct: 35 },
			});
			expect(out[0]?.label).toBe("Family Friendly");
			expect(out[0]?.fact).toBeUndefined();
		});

		it("does not leak a fact onto an unrelated reason", () => {
			// `homeownersPct` is evidence for upkeep only. Under "Dog Friendly" it
			// would read as though 35% of something were dog-related.
			const out = communityReasons({
				attributes: ["Dog Friendly", "Peaceful", "Trees"],
				facts: { homeownersPct: 35, residentsCount: 343 },
			});
			expect(out.every((r) => r.fact === undefined)).toBe(true);
		});
	});

	/**
	 * The columns are TEXT. Every fixture above passes a plain number, which is
	 * exactly why the bug below survived to a device report: `homeowners_pct` in
	 * the DB is `"35%"` and `residents_count` is `"1,050"`, and the old code did
	 * `pct > 0` on the raw value — a NaN comparison, always false, so the
	 * owner-occupied line had never rendered for any community.
	 */
	describe("DB text columns (the real row shape)", () => {
		it('parses a percent-suffixed homeowners_pct ("35%")', () => {
			const out = communityReasons({
				attributes: ["Well Maintained"],
				facts: { homeownersPct: "35%" },
			});
			expect(out[0]?.fact).toBe("35% owner-occupied");
		});

		it('parses a thousands-separated residents_count ("1,050")', () => {
			const out = communityReasons({
				attributes: ["Friendly"],
				facts: { residentsCount: "1,050" },
			});
			expect(out[0]?.fact).toBe("1,050 residents");
		});

		it("treats an unparseable text figure as absent, not as zero", () => {
			const out = communityReasons({
				attributes: ["Well Maintained"],
				facts: { homeownersPct: "n/a" },
			});
			expect(out[0]?.fact).toBeUndefined();
		});
	});

	/**
	 * `interests` — the column that took ≥1-sub-fact coverage from 36.2% to
	 * 82.3% of cards. `community_pois` (the demo's source) holds rows for 1 of
	 * 8,679 communities, so it could never back a second card.
	 */
	describe("resident-interest evidence", () => {
		const interests = [
			"Home Improvement & DIY",
			"Dogs",
			"Gardening & Landscape",
			"Walking",
		];

		it("cites the community's own ranking of the paired interest", () => {
			const out = communityReasons({
				attributes: ["Dog Friendly"],
				facts: { interests },
			});
			// The ORDINAL is the fact: printing "Dogs" under "Dog Friendly" would
			// restate the label.
			expect(out[0]?.fact).toBe("#2 resident interest");
		});

		it("prefers a demographic figure over an ordinal", () => {
			// A percentage is a measurement; a rank is a preference.
			const out = communityReasons({
				attributes: ["Well Maintained"],
				facts: { homeownersPct: "35%", interests },
			});
			expect(out[0]?.fact).toBe("35% owner-occupied");
		});

		it("falls back to the ordinal when the demographic figure is missing", () => {
			const out = communityReasons({
				attributes: ["Well Maintained"],
				facts: { interests },
			});
			expect(out[0]?.fact).toBe("#1 resident interest");
		});

		it("omits the fact when the paired interest is not in this community's list", () => {
			const out = communityReasons({
				attributes: ["Walkability"],
				facts: { interests: ["Dogs", "Cooking"] },
			});
			expect(out[0]?.label).toBe("Walkability");
			expect(out[0]?.fact).toBeUndefined();
		});

		it("leaves Safe label-only — no interest asserts safety", () => {
			const out = communityReasons({
				attributes: ["Safe"],
				facts: { interests: [...interests, "Emergency Preparedness (CERT/NERT)"] },
			});
			expect(out[0]?.label).toBe("Safe");
			expect(out[0]?.fact).toBeUndefined();
		});

		it("leaves Schools label-only — parenting is not school quality", () => {
			// `Parenting School-Age Kids` says children live here (the Family
			// Friendly claim); it says nothing about how good the schools are.
			const out = communityReasons({
				attributes: ["Schools"],
				facts: { interests: ["Parenting School-Age Kids"] },
			});
			expect(out[0]?.label).toBe("Schools");
			expect(out[0]?.fact).toBeUndefined();
		});
	});

	/**
	 * The community detail screen shows the card's three, then the rest. Both
	 * surfaces must agree, so the card's picker IS the full picker, sliced.
	 */
	describe("communityReasonsAll", () => {
		const attributes = [
			"Convenient",
			"Dog Friendly",
			"Friendly",
			"Restaurants",
			"Safe",
			"Trees",
			"Walkability",
			"Well Maintained",
		];

		it("returns every reason, unsliced", () => {
			const all = communityReasonsAll({ attributes });
			expect(all.length).toBeGreaterThan(COMMUNITY_REASON_COUNT);
		});

		it("opens on exactly the three the card shows, in the card's order", () => {
			// If these diverged, the detail page would read as the app disagreeing
			// with the card the user just tapped.
			const all = communityReasonsAll({ attributes });
			const card = communityReasons({ attributes });
			expect(all.slice(0, COMMUNITY_REASON_COUNT)).toEqual(card);
		});
	});
});
