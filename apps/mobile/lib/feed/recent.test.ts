/**
 * RECENT entries — the You tab's swipe history (phase140).
 */
import { describe, expect, it } from "vitest";
import type {
	CommunityCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import {
	RECENT_CAP,
	type RecentEntry,
	pushRecent,
	recentEntryFor,
} from "./recent";

const listing: ListingCardV3 = {
	kind: "listing",
	id: "l1",
	slug: "l1",
	address: "9155 Nesbit Ferry Road",
	priceLabel: "$339,000",
	bedBathSqft: "3 bd · 3 ba · 1,386 sqft",
	heroUrl: "https://example.test/l1.jpg",
	locality: "Johns Creek, GA",
	geoUnitId: "city:johns-creek-ga",
};

const community: CommunityCardV3 = {
	kind: "community",
	id: "c1",
	slug: "bellmoore-park",
	name: "Bellmoore Park",
	city: "Johns Creek",
	state: "GA",
	heroUrl: "https://example.test/c1.jpg",
};

describe("recentEntryFor", () => {
	it("snapshots a listing with the price the buyer saw", () => {
		expect(recentEntryFor(listing, "left", 1000)).toEqual({
			id: "l1",
			kind: "listing",
			verdict: "left",
			at: 1000,
			title: "9155 Nesbit Ferry Road",
			subtitle: "$339,000 · Johns Creek, GA",
			thumbUrl: "https://example.test/l1.jpg",
			geoUnitId: "city:johns-creek-ga",
		});
	});

	it("omits a locality the card did not carry rather than inventing one", () => {
		const { locality: _dropped, ...noLocality } = listing;
		expect(recentEntryFor(noLocality, "right", 1)?.subtitle).toBe("$339,000");
	});

	it("snapshots a community", () => {
		const e = recentEntryFor(community, "right", 2000);
		expect(e?.title).toBe("Bellmoore Park");
		expect(e?.subtitle).toBe("Johns Creek, GA");
		expect(e?.geoUnitId).toBeUndefined();
	});

	it("returns null for a trade-off — an answer is not revertible (§1.8)", () => {
		const tradeoff: TradeoffCardV3 = {
			kind: "tradeoff",
			id: "t1",
			theme: "era",
			axis: "era",
			prompt: "Which would you rather?",
			left: { label: "Older charm", support: "Built before 1990" },
			right: { label: "Newer build", support: "Built after 2010" },
		};
		expect(recentEntryFor(tradeoff, "right", 1)).toBeNull();
	});
});

describe("pushRecent", () => {
	const entry = (id: string, at: number): RecentEntry => ({
		id,
		kind: "listing",
		verdict: "left",
		at,
		title: id,
		subtitle: "",
	});

	it("puts the newest first", () => {
		const out = pushRecent([entry("a", 1)], entry("b", 2));
		expect(out.map((e) => e.id)).toEqual(["b", "a"]);
	});

	it("keeps one row per card — a re-emitted card replaces its older verdict", () => {
		const first = pushRecent([], { ...entry("a", 1), verdict: "left" });
		const again = pushRecent(first, { ...entry("a", 9), verdict: "right" });
		expect(again).toHaveLength(1);
		expect(again[0]?.verdict).toBe("right");
		expect(again[0]?.at).toBe(9);
	});

	it("caps the list", () => {
		let list: readonly RecentEntry[] = [];
		for (let i = 0; i < RECENT_CAP + 5; i++)
			list = pushRecent(list, entry(`x${i}`, i));
		expect(list).toHaveLength(RECENT_CAP);
		expect(list[0]?.id).toBe(`x${RECENT_CAP + 4}`);
	});
});
