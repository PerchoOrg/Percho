/**
 * The two device bugs this layer exists to prevent (§0.6 #7).
 *
 * **Ghosting.** Cards are keyed by item identity so a promoted card keeps its
 * subtree (its `CardVideo` player survives the swipe), which means the animated
 * style on a view could be swapped mid-life. Reanimated does not revert native
 * props a detached style already wrote, so a style that set only `transform`
 * inherited `opacity: 0.5` and the promoted card stayed translucent — two or
 * three titles legible at once. Guard: every call returns the SAME key set.
 *
 * **Post-swipe jump.** The swipe resolves on the UI thread but the deck advances
 * through React state, so the index advance and the drag reset landed on
 * different frames; in between, the outgoing card sat at the top with a zeroed
 * offset and snapped back to centre. Guard: geometry is a function of
 * `rel - advance`, and the handoff moves both by exactly 1, so every card's
 * computed visual is IDENTICAL either side of the handoff frame — asserted below
 * as the continuity case, which is the assertion that would have caught it.
 */
import { describe, expect, it } from "vitest";
import { SWIPE_THRESHOLD_RATIO } from "./decide-swipe";
import {
	type CardStackInput,
	FOLLOW_ROTATION_DEG,
	STACK_RESTING,
	advanceFromDrag,
	cardStackVisual,
} from "./stack-layer";

const W = 300;

/** At rest: no drag, no flyout, cursor at the card's own index. */
const at = (rel: number, over: Partial<CardStackInput> = {}) =>
	cardStackVisual({
		rel,
		advance: 0,
		dragX: 0,
		exitX: 0,
		cardWidth: W,
		...over,
	});

describe("cardStackVisual — prop-key parity (the ghosting invariant)", () => {
	const KEYS = "opacity,rotateDeg,scale,translateX";

	it("returns the identical key set for every depth, at rest", () => {
		const keys = [-1, 0, 1, 2, 3].map((rel) =>
			Object.keys(at(rel)).sort().join(","),
		);
		expect(new Set(keys).size).toBe(1);
		expect(keys[0]).toBe(KEYS);
	});

	it("returns the identical key set mid-drag and mid-handoff too", () => {
		const keys = [-1, 0, 1, 2].flatMap((rel) => [
			Object.keys(at(rel, { dragX: 120, advance: 0.4 }))
				.sort()
				.join(","),
			Object.keys(at(rel, { exitX: -W * 1.6, advance: 1 }))
				.sort()
				.join(","),
		]);
		expect(new Set(keys).size).toBe(1);
		expect(keys[0]).toBe(KEYS);
	});

	it("never returns a non-finite number for any prop at any depth", () => {
		for (const rel of [-2, -1, 0, 1, 2, 5]) {
			for (const dragX of [-W, 0, W]) {
				for (const cardWidth of [0, W]) {
					const v = cardStackVisual({
						rel,
						advance: 0.5,
						dragX,
						exitX: W,
						cardWidth,
					});
					expect(Number.isFinite(v.translateX)).toBe(true);
					expect(Number.isFinite(v.rotateDeg)).toBe(true);
					expect(Number.isFinite(v.scale)).toBe(true);
					expect(Number.isFinite(v.opacity)).toBe(true);
				}
			}
		}
	});
});

describe("cardStackVisual — handoff continuity (the jump invariant)", () => {
	/**
	 * The frame the bug lived in. Before: the committed card is still top
	 * (rel 0) with the stack fully shuffled (advance 1) and the next card at
	 * rel 1. After: the handoff advanced the cursor, so that same next card is
	 * rel 0 and advance is back to 0. Every card must look the same.
	 */
	it("each surviving card's visual is identical across the handoff frame", () => {
		const dest = W * 1.6;
		for (const cardRel of [1, 2, 3]) {
			const before = cardStackVisual({
				rel: cardRel,
				advance: 1,
				dragX: dest,
				exitX: dest,
				cardWidth: W,
			});
			const after = cardStackVisual({
				rel: cardRel - 1,
				advance: 0,
				dragX: 0,
				exitX: dest,
				cardWidth: W,
			});
			expect(after).toEqual(before);
		}
	});

	it("holds for a left swipe as well as a right one", () => {
		const dest = -W * 1.6;
		const before = cardStackVisual({
			rel: 1,
			advance: 1,
			dragX: dest,
			exitX: dest,
			cardWidth: W,
		});
		const after = cardStackVisual({
			rel: 0,
			advance: 0,
			dragX: 0,
			exitX: dest,
			cardWidth: W,
		});
		expect(after).toEqual(before);
	});

	it("holds at every intermediate point of the shuffle", () => {
		for (const p of [0, 0.25, 0.5, 0.75, 1]) {
			const before = cardStackVisual({
				rel: 1,
				advance: p,
				dragX: W * p,
				exitX: 0,
				cardWidth: W,
			});
			const after = cardStackVisual({
				rel: 0,
				advance: p - 1,
				dragX: W * p,
				exitX: 0,
				cardWidth: W,
			});
			expect(after.scale).toBeCloseTo(before.scale, 10);
			expect(after.opacity).toBeCloseTo(before.opacity, 10);
		}
	});

	it("the outgoing card stays parked off-screen, never snapping to centre", () => {
		const dest = W * 1.6;
		// dragX is already 0 for the new top card; the outgoing card must ignore it.
		const v = cardStackVisual({
			rel: -1,
			advance: 0,
			dragX: 0,
			exitX: dest,
			cardWidth: W,
		});
		expect(v.translateX).toBe(dest);
		expect(Math.abs(v.translateX)).toBeGreaterThan(W);
	});

	it("the outgoing card keeps its committed rotation, not a zeroed one", () => {
		const v = cardStackVisual({
			rel: -1,
			advance: 0,
			dragX: 0,
			exitX: -W * 1.6,
			cardWidth: W,
		});
		expect(v.rotateDeg).toBe(-FOLLOW_ROTATION_DEG);
	});

	/**
	 * The tap-driven advances (ask "Skip this topic", insight "Not sure",
	 * milestone "Keep going") move the cursor with no flyout at all, so the card
	 * that just left has `exitX` 0 — nothing ever animated it away.
	 *
	 * Every other assertion in this file is about a card that WAS swiped, which
	 * is why the whole suite stayed green while the device flashed a dismissed
	 * card behind its replacement on every tap.
	 */
	describe("a card dismissed by tap, not by swipe", () => {
		const tapDismissed = (over: Partial<CardStackInput> = {}) =>
			cardStackVisual({
				rel: -1,
				advance: 0,
				dragX: 0,
				exitX: 0,
				cardWidth: W,
				...over,
			});

		it("is invisible — it has no flyout to show", () => {
			// Without this it sat at scale 1 / opacity 1 (restingAt clamps a negative
			// depth to 0) directly behind a card rising from 0.94, so its content
			// showed around the new card's edges for a frame or two.
			expect(tapDismissed().opacity).toBe(0);
		});

		it("is invisible however far the cursor has already moved past it", () => {
			for (const rel of [-1, -2, -3]) {
				expect(tapDismissed({ rel }).opacity).toBe(0);
			}
		});

		it("still reports the full prop set, so nothing is left stale", () => {
			// The ghosting rule (see the header): every layer writes all four keys.
			expect(Object.keys(tapDismissed()).sort()).toEqual(
				["opacity", "rotateDeg", "scale", "translateX"].sort(),
			);
		});

		it("does not hide a card that IS flying out", () => {
			// The guard keys on a zero offset, not on `rel < 0`, so a real flyout is
			// untouched — otherwise the swipe animation would be invisible.
			expect(tapDismissed({ exitX: W * 1.6 }).opacity).toBeGreaterThan(0);
			expect(tapDismissed({ exitX: -W * 1.6 }).opacity).toBeGreaterThan(0);
		});

		it("does not hide any card still in the live stack", () => {
			for (const rel of [0, 1, 2]) {
				expect(
					cardStackVisual({
						rel,
						advance: 0,
						dragX: 0,
						exitX: 0,
						cardWidth: W,
					}).opacity,
				).toBeGreaterThan(0);
			}
		});
	});
});

describe("cardStackVisual — resting geometry", () => {
	it("holds the spec resting scale/opacity at each depth", () => {
		expect(at(0)).toMatchObject(STACK_RESTING[0] as object);
		expect(at(1)).toMatchObject(STACK_RESTING[1] as object);
		expect(at(2)).toMatchObject(STACK_RESTING[2] as object);
	});

	it("clamps past the last knot — a 4th card looks like the 3rd, never fainter", () => {
		expect(at(3)).toEqual(at(2));
		expect(at(9)).toEqual(at(2));
	});

	it("only the top card translates or rotates", () => {
		expect(at(1, { dragX: 77 }).translateX).toBe(0);
		expect(at(2, { dragX: 77 }).translateX).toBe(0);
		expect(at(1, { dragX: 999 }).rotateDeg).toBe(0);
		expect(at(2, { dragX: 999 }).rotateDeg).toBe(0);
	});

	it("the top card is fully opaque and unscaled at every drag offset", () => {
		for (const dragX of [-W * 2, -W, -1, 0, 1, W, W * 2]) {
			const v = at(0, { dragX });
			expect(v.opacity).toBe(1);
			expect(v.scale).toBe(1);
			expect(v.translateX).toBe(dragX);
		}
	});

	it("reaches ±8° exactly at the 35% commit threshold, then clamps", () => {
		const span = W * SWIPE_THRESHOLD_RATIO;
		expect(at(0, { dragX: span }).rotateDeg).toBeCloseTo(
			FOLLOW_ROTATION_DEG,
			5,
		);
		expect(at(0, { dragX: -span }).rotateDeg).toBeCloseTo(
			-FOLLOW_ROTATION_DEG,
			5,
		);
		expect(at(0, { dragX: span * 4 }).rotateDeg).toBe(FOLLOW_ROTATION_DEG);
		expect(at(0, { dragX: 0 }).rotateDeg).toBe(0);
	});
});

describe("cardStackVisual — the shuffle", () => {
	it("the next card rises to exactly the top card's values at advance 1", () => {
		const v = at(1, { advance: 1 });
		expect(v.scale).toBeCloseTo(1, 10);
		expect(v.opacity).toBeCloseTo(1, 10);
	});

	it("the third card rises to the second's values, not past them", () => {
		expect(at(2, { advance: 1 })).toMatchObject(STACK_RESTING[1] as object);
	});

	it("no card ever exceeds opacity 1 or scale 1, even past a full shuffle", () => {
		for (const rel of [0, 1, 2]) {
			const v = at(rel, { advance: 3 });
			expect(v.opacity).toBeLessThanOrEqual(1);
			expect(v.scale).toBeLessThanOrEqual(1);
		}
	});
});

describe("advanceFromDrag", () => {
	it("is 0 at rest and 1 at a full-width drag", () => {
		expect(advanceFromDrag(0, W)).toBe(0);
		expect(advanceFromDrag(W, W)).toBe(1);
	});

	it("is symmetric — a left drag shuffles as much as a right one", () => {
		expect(advanceFromDrag(-150, W)).toBe(advanceFromDrag(150, W));
	});

	it("clamps past a full-width drag", () => {
		expect(advanceFromDrag(W * 3, W)).toBe(1);
	});

	it("is 0 for a zero cardWidth (first frame, before layout)", () => {
		expect(advanceFromDrag(50, 0)).toBe(0);
	});
});
