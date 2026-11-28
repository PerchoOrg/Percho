import { describe, expect, it } from "vitest";
import { tutorialSteps } from "./tutorial";

describe("tutorialSteps", () => {
	it("starts with the swipe and covers both verdicts and the name", () => {
		expect(tutorialSteps().map((s) => s.target)).toEqual([
			"none",
			"heart",
			"dislike",
			"name",
		]);
	});

	it("adds the way inside only for a card that has one, in its own word", () => {
		const steps = tutorialSteps("Communities");
		expect(steps.at(-1)?.target).toBe("deck");
		expect(steps.at(-1)?.body).toContain("Communities");
		expect(tutorialSteps().some((s) => s.target === "deck")).toBe(false);
	});
});
