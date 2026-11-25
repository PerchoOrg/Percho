/**
 * Two one-way flags that tie the launch animation to the app underneath it
 * (`components/LaunchAnimation.tsx`):
 *
 *   · `launchReady` — the app has something to show. Set by the feed (first
 *     card's still is in), by any route that is not the feed, or by the gate's
 *     timer. The animation waits for it before leaving.
 *   · `launchDone`  — the animation has started to leave. The feed holds its
 *     first film until then, so nobody hears a narration under a logo or
 *     meets a film that is already two seconds in.
 *
 * Pure on purpose: the code that sets a flag and the code that reads it live
 * in different trees, and the rule that matters — a flag only goes from false
 * to true, and every listener hears about it once — is testable without a
 * native module.
 */
export interface LaunchFlag {
	/** Idempotent: every call after the first is a no-op. */
	mark: () => void;
	get: () => boolean;
	/** `useSyncExternalStore`-shaped: returns the unsubscribe. */
	subscribe: (listener: () => void) => () => void;
}

export function createLaunchFlag(): LaunchFlag {
	let on = false;
	const listeners = new Set<() => void>();
	return {
		mark() {
			if (on) return;
			on = true;
			for (const listener of listeners) listener();
		},
		get: () => on,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export const launchReady = createLaunchFlag();
export const launchDone = createLaunchFlag();
