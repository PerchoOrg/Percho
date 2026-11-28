import { beforeEach, describe, expect, it } from "vitest";
import { useTutorialStore } from "./tutorial";

beforeEach(() => {
	useTutorialStore.setState({ done: false });
});

describe("the feed tutorial", () => {
	it("is owed to a buyer who has not seen it", () => {
		expect(useTutorialStore.getState().done).toBe(false);
	});

	it("does not come back once finished or skipped", () => {
		useTutorialStore.getState().finish();
		expect(useTutorialStore.getState().done).toBe(true);
	});
});
