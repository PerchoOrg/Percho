/**
 * Semantic haptics — the §0.5 haptics table, one function per meaning.
 * Components call these names ONLY; they must never reach for expo-haptics
 * directly (keeps the "pass = no haptic" invariant enforceable in one place).
 *
 * §0.5 mapping:
 *   swipeThreshold → selectionAsync           (swipe crosses threshold)
 *   cardSettle     → impactAsync(Light)        (card flies out / flip / sheet)
 *   milestone      → notificationAsync(Success) (milestone · insight · persona · save)
 *   pass           → (nothing)                  (left swipe — negative feedback isn't rewarded)
 *
 * All calls are fire-and-forget; a rejected promise (e.g. simulator without a
 * Taptic engine) is swallowed so callers never need to await or try/catch.
 */
import * as Haptics from "expo-haptics";

const swallow = (p: Promise<unknown>) => {
	void p.catch(() => {});
};

/** Swipe crossed the commit threshold (direction decided). */
export function swipeThreshold(): void {
	swallow(Haptics.selectionAsync());
}

/** Card settled after flying out, flip completed, or a sheet popped. */
export function cardSettle(): void {
	swallow(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Milestone card, insight achieved, persona change toast, or save. */
export function milestone(): void {
	swallow(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Left-swipe pass — intentionally emits no haptic (§0.5). */
export function pass(): void {
	// no-op by design — do not add feedback here.
}

export const haptics = { swipeThreshold, cardSettle, milestone, pass };
