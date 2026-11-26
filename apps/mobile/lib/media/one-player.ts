/**
 * One film plays at a time, app-wide (phase404.6).
 *
 * Every surface pauses its own film when another page covers it — the feed
 * card (`suspended`), the Explore hero (`useIsFocused`) — and each of those
 * rules was added after the owner heard two films at once: 2026-08-25 ("the
 * card music does not stop and overlaps with the explore page one"),
 * 2026-11-26 (「点进去后音乐overlap了 旧的音乐要停止」), then the same day a
 * voice that trembled on a place's first card (「声音颤抖」) — what one film's
 * sound does when a second copy plays a moment behind it.
 *
 * So the rule is held here as well, once, instead of by every screen getting
 * its focus right: a player about to play takes over, and the one that was
 * playing is paused and muted. Whoever is in front resumes its own when it
 * is back in front, and takes over again.
 *
 * In a development bundle a takeover is reported to Metro's log, so an
 * overlap the screens should have prevented shows up as the pair involved.
 *
 * Pure: no react, no react-native.
 */

/** The part of an expo-video player this needs. */
export interface Playing {
	muted: boolean;
	pause(): void;
}

let current: { player: Playing; who: string } | null = null;

/**
 * `player` is about to play. The player that was playing stops; its `who` is
 * returned (null when there was none, or it was this one).
 *
 * @param who what the player is, for the development log: "feed card"…
 */
export function takeOver(player: Playing, who: string): string | null {
	const before = current;
	current = { player, who };
	if (before === null || before.player === player) return null;
	before.player.pause();
	before.player.muted = true;
	if (typeof __DEV__ !== "undefined" && __DEV__) {
		console.warn(`[one-player] ${who} started while ${before.who} was playing`);
	}
	return before.who;
}

/**
 * `player` is being released. Called from its component's cleanup, so a
 * player that no longer exists is never paused.
 */
export function letGo(player: Playing): void {
	if (current?.player === player) current = null;
}
