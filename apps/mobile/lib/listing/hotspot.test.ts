import { describe, expect, it } from "vitest";
import {
	type HotspotAction,
	MIN_ACTIONS,
	type TaggedPhoto,
	buildHotspot,
	emojiForRoom,
	hasConcreteData,
	pinFromBbox,
} from "./hotspot";

/** Three actions that all carry a number — the happy path. */
const goodActions: HotspotAction[] = [
	{ kind: "why", label: "Why this matters", sub: "Connects to 7 likes" },
	{
		kind: "compare",
		label: "Compare with similar homes",
		sub: "Island kitchens in Duluth: 8 of 24 active",
	},
	{ kind: "save", label: "Save this feature", sub: "1 of 3 saved features" },
];

const kitchenPhoto: TaggedPhoto = {
	id: "photo-1",
	url: "https://example.test/kitchen.jpg",
	tags: {
		room_type: "kitchen",
		caption: "Bright kitchen with marble island and stainless appliances",
		style_signals: ["marble", "modern_kitchen"],
		subject_bbox: [0.2, 0.3, 0.4, 0.2],
		usable: true,
	},
};

describe("buildHotspot — §2.5 'fewer than 3 actions does not ship'", () => {
	it("builds a hotspot when three actions carry real data", () => {
		const h = buildHotspot({
			photo: kitchenPhoto,
			candidateActions: goodActions,
		});
		expect(h).not.toBeNull();
		expect(h?.room).toBe("kitchen");
		expect(h?.actions).toHaveLength(3);
	});

	it("returns null at two actions — absent, not greyed out or padded", () => {
		expect(MIN_ACTIONS).toBe(3);
		const h = buildHotspot({
			photo: kitchenPhoto,
			candidateActions: goodActions.slice(0, 2),
		});
		expect(h).toBeNull();
	});

	it("drops vague copy and can therefore fall BELOW the floor", () => {
		const vague: HotspotAction[] = [
			goodActions[0] as HotspotAction,
			{ kind: "compare", label: "Compare", sub: "See similar homes nearby" },
			{ kind: "save", label: "Save", sub: "Add this to your profile" },
		];
		// Only one survives the concrete-data gate → no hotspot at all.
		expect(
			buildHotspot({ photo: kitchenPhoto, candidateActions: vague }),
		).toBeNull();
	});

	it("caps at five actions", () => {
		const five: HotspotAction[] = [
			...goodActions,
			{ kind: "renovate", label: "Renovation estimate", sub: "$4–8K" },
			{
				kind: "ask_ai",
				label: "Ask AI",
				sub: "3 questions asked",
				disabled: true,
			},
			{ kind: "why", label: "Extra", sub: "6th action with 1 number" },
		];
		const h = buildHotspot({ photo: kitchenPhoto, candidateActions: five });
		expect(h?.actions).toHaveLength(5);
	});
});

describe("buildHotspot — photo eligibility", () => {
	it("rejects an unusable photo", () => {
		const h = buildHotspot({
			photo: { ...kitchenPhoto, tags: { ...kitchenPhoto.tags, usable: false } },
			candidateActions: goodActions,
		});
		expect(h).toBeNull();
	});

	it("rejects a room that is not worth navigating to", () => {
		for (const room of ["hallway", "closet", "laundry", "floorplan", "other"]) {
			const h = buildHotspot({
				photo: {
					...kitchenPhoto,
					tags: { ...kitchenPhoto.tags, room_type: room },
				},
				candidateActions: goodActions,
			});
			expect(h, room).toBeNull();
		}
	});

	it("rejects a photo with no caption to title it", () => {
		for (const caption of [null, "", "   "]) {
			const h = buildHotspot({
				photo: { ...kitchenPhoto, tags: { ...kitchenPhoto.tags, caption } },
				candidateActions: goodActions,
			});
			expect(h).toBeNull();
		}
	});

	it("normalises room casing and whitespace from the tagger", () => {
		const h = buildHotspot({
			photo: {
				...kitchenPhoto,
				tags: { ...kitchenPhoto.tags, room_type: " Kitchen " },
			},
			candidateActions: goodActions,
		});
		expect(h?.room).toBe("kitchen");
	});
});

describe("buildHotspot — dated detection drives the Renovate row (§2.5 #1)", () => {
	it("flags a dated feature", () => {
		const h = buildHotspot({
			photo: {
				...kitchenPhoto,
				tags: { ...kitchenPhoto.tags, style_signals: ["dated", "carpet"] },
			},
			candidateActions: goodActions,
		});
		expect(h?.dated).toBe(true);
	});

	it("leaves `dated` absent on a modern feature", () => {
		const h = buildHotspot({
			photo: kitchenPhoto,
			candidateActions: goodActions,
		});
		expect(h?.dated).toBeUndefined();
	});
});

describe("pinFromBbox", () => {
	it("pins the centre of the subject box", () => {
		expect(pinFromBbox([0.2, 0.3, 0.4, 0.2])).toEqual({ x: 0.4, y: 0.4 });
	});

	it("clamps a pin that would render half off the photo", () => {
		const p = pinFromBbox([0, 0, 0, 0]);
		expect(p.x).toBeGreaterThanOrEqual(0.06);
		expect(p.y).toBeGreaterThanOrEqual(0.06);
		const q = pinFromBbox([1, 1, 0, 0]);
		expect(q.x).toBeLessThanOrEqual(0.94);
		expect(q.y).toBeLessThanOrEqual(0.94);
	});

	it("centres when the tagger gave nothing usable", () => {
		expect(pinFromBbox(null)).toEqual({ x: 0.5, y: 0.5 });
		expect(pinFromBbox(undefined)).toEqual({ x: 0.5, y: 0.5 });
		expect(pinFromBbox([0.1, 0.2])).toEqual({ x: 0.5, y: 0.5 });
		expect(pinFromBbox([Number.NaN, 0, 0.5, 0.5])).toEqual({ x: 0.5, y: 0.5 });
	});
});

describe("hasConcreteData", () => {
	it("passes copy with a number and fails copy without one", () => {
		expect(hasConcreteData("Island kitchens in Duluth: 8 of 24 active")).toBe(
			true,
		);
		expect(hasConcreteData("$4–8K rule of thumb")).toBe(true);
		expect(hasConcreteData("A lovely space to gather")).toBe(false);
		expect(hasConcreteData("")).toBe(false);
	});
});

describe("emojiForRoom", () => {
	it("gives every navigable room a pin glyph", () => {
		expect(emojiForRoom("kitchen")).toBe("🍳");
		expect(emojiForRoom("backyard")).toBe("🌳");
		expect(emojiForRoom("bathroom")).toBe("🛁");
	});
});
