/**
 * The two verdicts — the heart and the thumbs-down — as every screen gives
 * them (phase416): a feed card, an Explore page's hero, a row of the You tab's
 * RECENT. One place for the rules, so the three cannot drift:
 *
 *   - A lit heart is always in Saved, and a like is always a save. A buyer
 *     who is not signed in is sent to sign in and nothing is recorded
 *     (`useSavedStore.toggle` hands back the old state).
 *   - The thumbs-down wins over the heart (owner, 2026-11-28: 「有爱心的情况
 *     选择大拇指应该尊重大拇指 自动清除爱心」): disliking a liked place takes
 *     its heart and its save away.
 *   - A place has one verdict or none, never both.
 *
 * The feed's own cards record through `recordSwipe` / `hide` instead of
 * `setVerdict` — they have the card, and its time on screen to weigh the
 * verdict by — and come here only for `clearLike`.
 */
import type { RecentPlace } from "../lib/feed/recent";
import { useFeedSession } from "./feed-session";
import { type SavedKind, useSavedStore } from "./saved";

/**
 * Take a place's heart away, if it has one: out of Saved, and the like undone.
 * Returns whether it had one.
 */
export function clearLike(id: string, kind: SavedKind): boolean {
	const saved = useSavedStore.getState();
	if (!saved.isSaved(id)) return false;
	saved.toggle(id, kind);
	useFeedSession.getState().bringBack(id);
	return true;
}

/** The heart, away from the deck. Returns whether the place is liked now. */
export function toggleLike(place: RecentPlace): boolean {
	const saved = useSavedStore.getState();
	const was = saved.isSaved(place.id);
	const now = saved.toggle(place.id, place.kind);
	if (now && !was) {
		useFeedSession.getState().setVerdict(place, "right", Date.now());
	} else if (was && !now) {
		useFeedSession.getState().bringBack(place.id);
	}
	return now;
}

/**
 * The thumbs-down, away from the deck: hide the place, or — tapped on a place
 * already hidden — take that back. Returns whether it is hidden now.
 */
export function toggleDislike(place: RecentPlace): boolean {
	const session = useFeedSession.getState();
	if (session.hiddenIds.includes(place.id)) {
		session.bringBack(place.id);
		return false;
	}
	const saved = useSavedStore.getState();
	if (saved.isSaved(place.id)) saved.toggle(place.id, place.kind);
	session.setVerdict(place, "left", Date.now());
	return true;
}
