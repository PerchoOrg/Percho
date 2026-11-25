/**
 * Keeps the launch screen up until the feed has something to show.
 *
 * Without this the launch screen left as soon as the first view mounted, and
 * a cold open then sat on an empty card-shaped placeholder until the feed
 * answered — about two seconds when the CDN has no warm copy (owner,
 * 2026-11-25: 「第一次打开延迟2秒 才出第一个feed 有没有办法过渡」). Now the
 * mark stays and cross-fades straight into the first card.
 *
 * The launch screen must never be able to stay for good, so it is released by
 * whichever comes first: the feed (`releaseSplash`), any screen that is not
 * the feed (a shared link opens on its own page), or the timer below — which
 * is armed here, outside React, so no render path can skip it.
 */
import * as SplashScreen from "expo-splash-screen";

/** Longest the launch screen waits for the first card before giving up. */
const SPLASH_MAX_MS = 3000;
/** The cross-fade from the mark to the app. */
const SPLASH_FADE_MS = 350;

let released = false;

/** Call once, at module scope of the root layout. */
export function holdSplash(): void {
	try {
		SplashScreen.setOptions({ duration: SPLASH_FADE_MS, fade: true });
	} catch {
		// Older native module without options: it still hides, just without the fade.
	}
	SplashScreen.preventAutoHideAsync().catch(() => {});
	setTimeout(releaseSplash, SPLASH_MAX_MS);
}

/** Idempotent: every caller after the first is a no-op. */
export function releaseSplash(): void {
	if (released) return;
	released = true;
	SplashScreen.hideAsync().catch(() => {});
}
