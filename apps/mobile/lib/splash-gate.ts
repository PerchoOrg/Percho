/**
 * The hand-over from the native launch screen to the app.
 *
 * The native launch screen cannot animate, so it is now only the warm paper
 * (`assets/splash-icon.png` is blank). It stays until the JS launch layer
 * (`components/LaunchAnimation.tsx`) has laid out on the same paper, which
 * draws the mark and then waits for the feed's first card before it fades —
 * so a cold open is one drawing and one fade, with no empty placeholder in
 * between (owner, 2026-11-25).
 *
 * Nothing here may be able to hang: the native screen is hidden by the launch
 * layer's first layout OR the timer below, and the flags in
 * `lib/launch-ready.ts` are set by their owners OR that same timer. The timer
 * is armed outside React, so no render path can skip it.
 */
import * as SplashScreen from "expo-splash-screen";
import { launchDone, launchReady } from "./launch-ready";
import { LAUNCH_MAX_MS } from "./launch-timeline";

/** Call once, at module scope of the root layout. */
export function holdSplash(): void {
	SplashScreen.preventAutoHideAsync().catch(() => {});
	setTimeout(() => {
		hideNativeSplash();
		launchReady.mark();
		launchDone.mark();
	}, LAUNCH_MAX_MS);
}

/** The JS launch layer is on screen; the native one underneath can go. */
export function hideNativeSplash(): void {
	SplashScreen.hideAsync().catch(() => {});
}

/**
 * The app has something to show — the launch layer may leave once its drawing
 * is done. Idempotent. (The name is phase398's, when this hid the native
 * screen directly.)
 */
export function releaseSplash(): void {
	launchReady.mark();
}
