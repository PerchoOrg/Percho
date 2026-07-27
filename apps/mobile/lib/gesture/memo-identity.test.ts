import { readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * The gesture must survive a re-render that happens MID-swipe.
 *
 * `useSwipeCard` builds its `Gesture.Exclusive` inside a `useMemo`. Replacing a
 * live `Gesture.Pan` while a touch is in flight drops that touch, so `onEnd`
 * never fires on the handler that saw `onBegin` — the flyout is never scheduled,
 * the handoff never runs, and the card stays on top. That is the "卡住" bug.
 *
 * The feed re-renders CONSTANTLY while a swipe resolves: a page is appended, the
 * funnel advances, a milestone is spliced in, the undo toast mounts and expires.
 * So "does the memo hold across a render where nothing semantic changed" is a
 * correctness property, not an optimisation.
 *
 * It is testable without a renderer because the answer is decided entirely by
 * dependency IDENTITY. This asserts the dep list contains nothing that
 * `SwipeStack` re-creates per render — which is exactly what `onCommit` was: an
 * inline arrow closing over the current top item.
 *
 * Kept as a pure identity test rather than a react-native render test because
 * this suite runs without an RN runtime (see vitest.config.ts).
 */
import { describe, expect, it } from "vitest";

/** Same comparison React performs on a `useMemo` dependency array. */
function depsUnchanged(a: readonly unknown[], b: readonly unknown[]): boolean {
	return a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
}

/**
 * The dependency list of the gesture memo in `useSwipeCard`, as data.
 *
 * Mirrored rather than imported because the hook cannot be evaluated without a
 * React renderer. `handlerIdentity` stands for whichever callback the memo
 * depends on; everything else is stable by construction (primitives from the
 * resolved capability, `useSharedValue` refs, and `useCallback([])` functions).
 */
function gestureDeps(handlerIdentity: unknown, stable: symbol): unknown[] {
	return [
		343, // cardWidth
		true, // pannable
		true, // commits
		1, // maxDisplacementRatio
		false, // flippable
		900, // revealMs — the challenge card
		handlerIdentity,
		stable, // handoff, tx, advance, crossedRight, flipProgress, committed
	];
}

describe("the swipe gesture's memo identity", () => {
	const stable = Symbol("useCallback([]) and useSharedValue refs");

	it("holds across a render when the handler identity is stable", () => {
		// `fireCommit` is a `useCallback(…, [])` trampoline that reads the live
		// callback off a ref, so its identity is the same object every render.
		const fireCommit = () => {};
		expect(
			depsUnchanged(
				gestureDeps(fireCommit, stable),
				gestureDeps(fireCommit, stable),
			),
		).toBe(true);
	});

	it("would rebuild on EVERY render if it depended on an inline callback", () => {
		// This is what `SwipeStack` passes: `onCommit={(d) => { … }}`, a fresh arrow
		// per render because it closes over the current top item. With that in the
		// dep list the gesture was rebuilt on every render — including the ones
		// that land inside a challenge card's 900ms reveal hold.
		const renderA = (_d: string) => {};
		const renderB = (_d: string) => {};
		expect(
			depsUnchanged(gestureDeps(renderA, stable), gestureDeps(renderB, stable)),
		).toBe(false);
	});

	it("a ref-backed trampoline still forwards to the latest callback", () => {
		// The reason a ref is safe here: stability must not cost staleness.
		const calls: string[] = [];
		const handlers = {
			current: { onCommit: (_d: string) => calls.push("v1") },
		};
		const fireCommit = (d: string) => handlers.current.onCommit(d);

		fireCommit("right");
		// A re-render swaps in a new closure over a new top item.
		handlers.current = { onCommit: (_d: string) => calls.push("v2") };
		fireCommit("left");

		expect(calls).toEqual(["v1", "v2"]);
	});

	/**
	 * The tests above describe the RULE; this one enforces it on the real file.
	 *
	 * Mirroring a dependency array in a test cannot catch someone adding a caller
	 * -supplied callback back into the actual memo, so this reads the source and
	 * asserts the dep list holds no prop that arrives fresh from the caller.
	 */
	it("the real gesture memo depends on no caller-supplied callback", () => {
		const src = readFileSync(
			join(__dirname, "../../hooks/use-swipe-card.ts"),
			"utf8",
		);
		// The memo's dependency array is the last `}, [ … ]);` of the useMemo.
		const deps =
			/return Gesture\.Exclusive\(pan, tap\);\s*},\s*\[([^\]]*)\]/.exec(src);
		expect(deps, "could not locate the gesture memo dep list").not.toBeNull();
		const listed = (deps?.[1] ?? "")
			.split(",")
			.map((s) => s.replace(/\/\/.*$/gm, "").trim())
			.filter((s) => s.length > 0);

		expect(listed.length).toBeGreaterThan(0);
		// These are the hook's own props: they are re-created by SwipeStack on every
		// render, so depending on either rebuilds the gesture mid-touch.
		expect(listed).not.toContain("onCommit");
		expect(listed).not.toContain("onDecision");
	});
});
