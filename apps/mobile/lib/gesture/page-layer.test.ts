import { describe, expect, it } from "vitest";
import { EDGE_RESISTANCE, cardPageX, pageDrag, pageStep } from "./page-layer";

const PITCH = 373;

describe("cardPageX — where a card is drawn", () => {
	it("lays the cards out one pitch apart around the cursor", () => {
		expect(cardPageX(-1, 0, PITCH)).toBe(-PITCH);
		expect(cardPageX(0, 0, PITCH)).toBe(0);
		expect(cardPageX(1, 0, PITCH)).toBe(PITCH);
	});

	it("moves every card by the drag", () => {
		expect(cardPageX(0, -40, PITCH)).toBe(-40);
		expect(cardPageX(1, -40, PITCH)).toBe(PITCH - 40);
	});

	it("is unchanged by the handoff, forwards and back", () => {
		// The turn ends with the drag at -step * pitch; the handoff then moves
		// the cursor by `step` and zeroes the drag in one frame.
		for (const step of [1, -1]) {
			for (const index of [3, 4, 5]) {
				const cursor = 4;
				const before = cardPageX(index - cursor, -step * PITCH, PITCH);
				const after = cardPageX(index - (cursor + step), 0, PITCH);
				expect(after).toBe(before);
			}
		}
	});
});

describe("pageDrag — the first card resists", () => {
	it("follows the finger when there is a card to go back to", () => {
		expect(pageDrag(120, true)).toBe(120);
		expect(pageDrag(-120, true)).toBe(-120);
	});

	it("gives a quarter of a pull back when there is none", () => {
		expect(pageDrag(120, false)).toBe(120 * EDGE_RESISTANCE);
	});

	it("never resists going forward", () => {
		expect(pageDrag(-120, false)).toBe(-120);
	});
});

describe("pageStep — which way a release turns", () => {
	it("left is the next card", () => {
		expect(pageStep("left", true)).toBe(1);
		expect(pageStep("left", false)).toBe(1);
	});

	it("right is the one before, when there is one", () => {
		expect(pageStep("right", true)).toBe(-1);
		expect(pageStep("right", false)).toBe(0);
	});

	it("an undecided release turns nothing", () => {
		expect(pageStep("none", true)).toBe(0);
	});
});
