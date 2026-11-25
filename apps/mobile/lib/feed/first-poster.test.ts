import { describe, expect, it } from "vitest";
import type { FeedCardV3 } from "./card-types";
import { cardPoster } from "./first-poster";

/** Only the fields `cardPoster` reads; the rest of each card is irrelevant here. */
const card = (c: unknown) => c as FeedCardV3;

describe("cardPoster", () => {
	it("is the hero of a community or listing card", () => {
		expect(
			cardPoster(card({ kind: "community", heroUrl: "https://x/c.jpg" })),
		).toBe("https://x/c.jpg");
		expect(
			cardPoster(card({ kind: "listing", heroUrl: "https://x/l.jpg" })),
		).toBe("https://x/l.jpg");
	});

	it("is the unit's hero on an area card", () => {
		expect(
			cardPoster(card({ kind: "area", unit: { heroUrl: "https://x/a.jpg" } })),
		).toBe("https://x/a.jpg");
	});

	it("is undefined when there is no picture to wait for", () => {
		expect(cardPoster(card({ kind: "area", unit: {} }))).toBeUndefined();
		// A city film card is built with an empty hero when the unit has none.
		expect(
			cardPoster(card({ kind: "community", heroUrl: "" })),
		).toBeUndefined();
		expect(cardPoster(card({ kind: "tradeoff" }))).toBeUndefined();
	});
});
