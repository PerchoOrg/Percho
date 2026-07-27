/**
 * `canFlipCard` — the §1.1 red line as a pure predicate.
 *
 * Extracted from `SwipeStack` because the bug it prevents is a *logic* bug, not
 * a rendering one, and it should be provable without a simulator or a React
 * renderer. `SwipeStack` calls this; `can-flip.test.ts` pins it.
 *
 * ── The bug this exists to prevent (task-0, shipped in 026d3f8b) ─────────────
 * `SwipeStack` gated the back face on `!!renderBack` — the *callback* — which is
 * always truthy once any caller supplies it. A mixed deck passes ONE `renderBack`
 * that returns null for kinds with no data face (ask / tradeoff / milestone), so
 * every card looked flippable. Tapping an ask card crossfaded the visible face
 * out to an empty one: the exact failure §1.1 lists as a red line.
 *
 * The fix is to ask the rendered *result*, per item, which is what this does.
 */

/**
 * Everything React treats as "renders nothing". `false` and `''` matter because
 * `cond && <Face/>` — the idiomatic way a caller writes a conditional face —
 * evaluates to `false`, not null, when the condition fails.
 */
export function canFlipCard(back: React.ReactNode): boolean {
	if (back === null || back === undefined) return false;
	if (back === false || back === true) return false;
	if (back === "") return false;
	if (Array.isArray(back)) return back.some((child) => canFlipCard(child));
	return true;
}
