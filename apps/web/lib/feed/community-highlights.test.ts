/**
 * Guards for the community card's three highlight tiles.
 *
 * The bug these exist to prevent: the feed route shipped for weeks sending no
 * `dims` at all for communities, so `CommunityFace` skipped its whole tiles row
 * and the redline's highlights band was blank. Nothing in the suite could see
 * it — the card rendered "successfully" with a hole in it. Owner caught it on
 * device: 「少了community highlights ... 这一部分不能空」.
 *
 * So these tests assert the two things that were actually broken: that real seed
 * rows produce tiles, and that the projection carries them into the DTO.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
	COMMUNITY_HIGHLIGHT_COUNT,
	communityHighlightDims,
} from "./community-highlights";
import { projectCommunityPool } from "./community-pool";

describe("communityHighlightDims", () => {
	it("returns at most the three tiles the redline draws", () => {
		const dims = communityHighlightDims({
			attributes: [
				"Peaceful",
				"Family Friendly",
				"Walkability",
				"Schools",
				"Trees",
			],
		});
		expect(dims).toHaveLength(COMMUNITY_HIGHLIGHT_COUNT);
		expect(dims).toEqual(["quiet", "family", "walkable"]);
	});

	it("maps a real Nextdoor seed row (Abernathy, Atlanta)", () => {
		// Verbatim from the live `communities` row.
		expect(
			communityHighlightDims({
				attributes: [
					"Community",
					"Dog Friendly",
					"Family Friendly",
					"Food",
					"Freeway Access",
					"Location",
					"Peaceful",
					"Restaurants",
					"Safe",
					"Well Maintained",
				],
			}),
			// 'Community' / 'Dog Friendly' / 'Freeway Access' / 'Location' / 'Safe' are
			// intentionally unmapped — none of them is one of the 11 dims.
		).toEqual(["family", "hip", "quiet"]);
	});

	it("never repeats a dim, even when several attributes map to it", () => {
		const dims = communityHighlightDims({
			attributes: ["Peaceful", "Quiet", "Privacy", "Secluded", "Trees"],
		});
		expect(dims).toEqual(["quiet", "outdoors"]);
	});

	it("tops up from interests only after attributes are exhausted", () => {
		const dims = communityHighlightDims({
			attributes: ["Peaceful"],
			interests: ["Hiking & Trails", "Dinner Parties", "Cooking"],
		});
		// Attributes first, then the weaker behavioural signal fills the rest.
		expect(dims).toEqual(["quiet", "trails", "entertaining"]);
	});

	it("ignores interests entirely when attributes already fill the row", () => {
		const dims = communityHighlightDims({
			attributes: ["Peaceful", "Family Friendly", "Walkability"],
			interests: ["Hiking & Trails"],
		});
		expect(dims).toEqual(["quiet", "family", "walkable"]);
	});

	it("returns nothing rather than inventing highlights", () => {
		// 206 of 8,679 feed-eligible communities look like this. The card must
		// render no tiles — a fabricated "Family Friendly" is worse than a gap.
		expect(
			communityHighlightDims({ attributes: null, interests: null }),
		).toEqual([]);
		expect(communityHighlightDims({ attributes: [], interests: [] })).toEqual(
			[],
		);
	});

	it("drops the seed vocabulary long tail instead of forcing a dim", () => {
		// Real values in the live column. Per-business spam and jokes must not
		// become neighbourhood claims.
		expect(
			communityHighlightDims({
				attributes: [
					"Traceylynn Consultant",
					"Needs More Raging Parties",
					"Lash Strips",
					"Dine-In",
					"I Can Deer Hunt In My Yard Lol",
				],
			}),
		).toEqual([]);
	});

	it("reads the Spanish seed values (multilingual buyer pool, English labels)", () => {
		expect(
			communityHighlightDims({
				attributes: ["Tranquilo", "Parques", "Para caminar"],
			}),
		).toEqual(["quiet", "outdoors", "walkable"]);
	});

	it("tolerates the trailing whitespace the seed carries", () => {
		// e.g. 'Casas ', 'perros ' exist verbatim in the column.
		expect(communityHighlightDims({ attributes: ["Peaceful "] })).toEqual([
			"quiet",
		]);
	});

	it("skips non-string entries without throwing", () => {
		expect(
			communityHighlightDims({
				attributes: [
					null as unknown as string,
					42 as unknown as string,
					"Quiet",
				],
			}),
		).toEqual(["quiet"]);
	});
});

describe("projectCommunityPool highlight tiles", () => {
	// `publicCoverImageUrl` builds an absolute storage URL and throws without
	// this. The tests below assert on `dims`, not on the URL, so any base works.
	beforeAll(() => {
		process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
	});

	const row = {
		id: "c1",
		slug: "abernathy",
		name: "Abernathy",
		city: "Atlanta",
		state: "GA",
		description: "A leafy street grid.",
		cover_storage_path: "nextdoor/abernathy.jpg",
		attributes: ["Peaceful", "Family Friendly", "Walkability"],
		interests: null,
	};

	it("carries dims into the DTO so the card has tiles to draw", () => {
		const dtos = projectCommunityPool([row]);
		expect(dtos).toHaveLength(1);
		expect(dtos[0]?.dims).toEqual(["quiet", "family", "walkable"]);
	});

	it("OMITS dims rather than sending [] when there is no signal", () => {
		// `CommunityFace` gates its tiles row on presence. An empty array would
		// render three empty glass boxes, which is worse than no row at all.
		const dtos = projectCommunityPool([
			{ ...row, attributes: null, interests: null },
		]);
		expect(dtos).toHaveLength(1);
		expect(dtos[0] && "dims" in dtos[0]).toBe(false);
	});
});
