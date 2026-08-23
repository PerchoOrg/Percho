import { describe, expect, it } from "vitest";
import { buildRoomGroups, roomGroupForTag } from "./rooms";

const tagged = (room: string | null) => ({
	tags: { room_type: room },
});
const untagged = () => ({});

describe("roomGroupForTag", () => {
	it("collapses the tagger's 17 rooms into display groups", () => {
		expect(roomGroupForTag("kitchen")).toBe("kitchen");
		expect(roomGroupForTag("pool")).toBe("yard");
		expect(roomGroupForTag("balcony")).toBe("yard");
		expect(roomGroupForTag("office")).toBe("bedroom");
		expect(roomGroupForTag("hallway")).toBe("other");
		expect(roomGroupForTag("floorplan")).toBe("other");
	});

	it("treats untagged / unknown as other", () => {
		expect(roomGroupForTag(undefined)).toBe("other");
		expect(roomGroupForTag(null)).toBe("other");
		expect(roomGroupForTag("  KITCHEN ")).toBe("kitchen");
	});
});

describe("buildRoomGroups", () => {
	it("orders groups by first appearance and never reorders photos", () => {
		const { groups, keyByIndex } = buildRoomGroups([
			tagged("exterior"),
			tagged("kitchen"),
			tagged("kitchen"),
			tagged("living"),
			tagged("kitchen"),
		]);
		expect(groups.map((g) => g.key)).toEqual(["exterior", "kitchen", "living"]);
		expect(groups[1]).toMatchObject({ count: 3, firstPhotoIndex: 1 });
		expect(keyByIndex).toEqual([
			"exterior",
			"kitchen",
			"kitchen",
			"living",
			"kitchen",
		]);
	});

	it("puts `other` last regardless of where those photos sit", () => {
		const { groups } = buildRoomGroups([
			untagged(),
			tagged("kitchen"),
			tagged("hallway"),
		]);
		expect(groups.map((g) => g.key)).toEqual(["kitchen", "other"]);
		expect(groups[1]?.count).toBe(2);
	});

	it("returns NO groups when nothing carries a real room (untagged import)", () => {
		const { groups, keyByIndex } = buildRoomGroups([untagged(), untagged()]);
		expect(groups).toEqual([]);
		expect(keyByIndex).toEqual(["other", "other"]);
	});

	it("handles an empty photo list", () => {
		expect(buildRoomGroups([]).groups).toEqual([]);
	});
});
