/**
 * The heart and the thumbs-down, away from the deck. The saved store is a
 * stand-in here: its own contract — the sign-in gate, the server round trip —
 * is `saved.test.ts`'s.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = { ids: new Set<string>(), signedIn: true };
vi.mock("./saved", () => ({
	useSavedStore: {
		getState: () => ({
			isSaved: (id: string) => saved.ids.has(id),
			// As the real one: signed out, nothing changes and the old state is
			// handed back.
			toggle: (id: string) => {
				if (!saved.signedIn) return saved.ids.has(id);
				if (saved.ids.has(id)) saved.ids.delete(id);
				else saved.ids.add(id);
				return saved.ids.has(id);
			},
		}),
	},
}));

import { EMPTY_SIGNALS } from "../lib/feed/signals";
import { useFeedSession } from "./feed-session";
import { clearLike, toggleDislike, toggleLike } from "./verdict";

const s = () => useFeedSession.getState();
const place = {
	id: "c1",
	kind: "community" as const,
	title: "Bellmoore Park",
	subtitle: "Johns Creek, GA",
};

beforeEach(() => {
	saved.ids.clear();
	saved.signedIn = true;
	useFeedSession.setState({
		signals: EMPTY_SIGNALS,
		seenIds: [],
		recent: [],
		swipedThisRun: [],
		hiddenIds: [],
	});
});

describe("toggleLike", () => {
	it("saves the place and records the like", () => {
		expect(toggleLike(place)).toBe(true);
		expect(saved.ids.has("c1")).toBe(true);
		expect(s().signals.likedCommunityIds).toEqual(["c1"]);
	});

	it("takes both back on a second tap", () => {
		toggleLike(place);
		expect(toggleLike(place)).toBe(false);
		expect(saved.ids.has("c1")).toBe(false);
		expect(s().signals.likedCommunityIds).toEqual([]);
		expect(s().recent).toEqual([]);
	});

	it("records nothing for a buyer who is not signed in", () => {
		saved.signedIn = false;
		expect(toggleLike(place)).toBe(false);
		expect(s().signals).toBe(EMPTY_SIGNALS);
	});

	it("un-hides a place that was hidden", () => {
		toggleDislike(place);
		toggleLike(place);
		expect(s().hiddenIds).toEqual([]);
		expect(s().signals.passedCommunityIds).toEqual([]);
		expect(s().signals.likedCommunityIds).toEqual(["c1"]);
	});
});

describe("toggleDislike", () => {
	it("hides the place", () => {
		expect(toggleDislike(place)).toBe(true);
		expect(s().hiddenIds).toEqual(["c1"]);
		expect(s().recent[0]).toMatchObject({ id: "c1", verdict: "left" });
	});

	it("wins over the heart: the like and the save go", () => {
		toggleLike(place);
		toggleDislike(place);
		expect(saved.ids.has("c1")).toBe(false);
		expect(s().signals.likedCommunityIds).toEqual([]);
		expect(s().signals.passedCommunityIds).toEqual(["c1"]);
		expect(s().hiddenIds).toEqual(["c1"]);
	});

	it("takes the hide back on a second tap", () => {
		toggleDislike(place);
		expect(toggleDislike(place)).toBe(false);
		expect(s().hiddenIds).toEqual([]);
		expect(s().recent).toEqual([]);
	});

	it("needs no account", () => {
		saved.signedIn = false;
		expect(toggleDislike(place)).toBe(true);
		expect(s().hiddenIds).toEqual(["c1"]);
	});
});

describe("clearLike", () => {
	it("says whether there was a heart, and takes it away", () => {
		expect(clearLike("c1", "community")).toBe(false);
		toggleLike(place);
		expect(clearLike("c1", "community")).toBe(true);
		expect(saved.ids.has("c1")).toBe(false);
		expect(s().signals.likedCommunityIds).toEqual([]);
	});
});
