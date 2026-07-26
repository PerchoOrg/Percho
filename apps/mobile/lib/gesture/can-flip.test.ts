/**
 * §1.1 red line regression: a card with no data face must not flip.
 *
 * The original task-0 bug gated on the `renderBack` *callback* instead of its
 * result, so a mixed deck's ask cards flipped to a blank face. The first test
 * below is that bug, written as the assertion it failed.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { canFlipCard } from "./can-flip";

/** A real React element, so the test exercises the actual ReactNode shape. */
const face = () => createElement("view", null, "4 bd · 3 ba");

describe("canFlipCard", () => {
	it("is false when the deck's shared renderBack returns null for this kind", () => {
		// This is the task-0 bug: `renderBack` exists, but THIS item has no back.
		const renderBack = (kind: string) => (kind === "listing" ? face() : null);
		expect(canFlipCard(renderBack("ask"))).toBe(false);
		expect(canFlipCard(renderBack("tradeoff"))).toBe(false);
		expect(canFlipCard(renderBack("milestone"))).toBe(false);
		expect(canFlipCard(renderBack("listing"))).toBe(true);
	});

	it("is false for undefined (callback omitted entirely)", () => {
		expect(canFlipCard(undefined)).toBe(false);
	});

	it("is false for `false` — the `cond && <Face/>` idiom's falsy result", () => {
		expect(canFlipCard(false)).toBe(false);
	});

	it("is false for an empty string", () => {
		expect(canFlipCard("")).toBe(false);
	});

	it("is false for an array of nothings", () => {
		expect(canFlipCard([null, false, undefined, ""])).toBe(false);
	});

	it("is true for an array with one real child", () => {
		expect(canFlipCard([null, false, face()])).toBe(true);
	});

	it("is true for a real element", () => {
		expect(canFlipCard(face())).toBe(true);
	});

	it("is true for non-empty text — a text-only data face still flips", () => {
		expect(canFlipCard("4 bd · 3 ba")).toBe(true);
	});

	it("is true for 0 — a numeric face is renderable content", () => {
		expect(canFlipCard(0)).toBe(true);
	});
});
