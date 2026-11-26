import { beforeEach, describe, expect, it } from "vitest";
import { type Playing, letGo, takeOver } from "./one-player";

function player(): Playing & { paused: number } {
	return {
		muted: false,
		paused: 0,
		pause() {
			this.paused += 1;
		},
	};
}

describe("one film at a time", () => {
	const card = player();
	const hero = player();

	beforeEach(() => {
		letGo(card);
		letGo(hero);
		card.muted = false;
		card.paused = 0;
		hero.muted = false;
		hero.paused = 0;
	});

	it("lets the first player play", () => {
		expect(takeOver(card, "feed card")).toBeNull();
		expect(card.paused).toBe(0);
	});

	it("stops and mutes the one that was playing when another starts", () => {
		takeOver(card, "feed card");
		expect(takeOver(hero, "explore film")).toBe("feed card");
		expect(card.paused).toBe(1);
		expect(card.muted).toBe(true);
		expect(hero.paused).toBe(0);
	});

	it("leaves a player alone when it plays again", () => {
		takeOver(card, "feed card");
		expect(takeOver(card, "feed card")).toBeNull();
		expect(card.paused).toBe(0);
	});

	it("hands back: the first takes over again and stops the second", () => {
		takeOver(card, "feed card");
		takeOver(hero, "explore film");
		expect(takeOver(card, "feed card")).toBe("explore film");
		expect(hero.paused).toBe(1);
	});

	it("never touches a player that has been let go", () => {
		takeOver(hero, "explore film");
		letGo(hero);
		expect(takeOver(card, "feed card")).toBeNull();
		expect(hero.paused).toBe(0);
	});
});
