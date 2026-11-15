import { router } from "expo-router";

/**
 * Back, or to the deck when there is nothing to go back to (phase335). A
 * shared link opens the community or city page as the app's FIRST screen, and
 * `router.back()` there does nothing — the buyer would be stuck on the page.
 * The deck is where they go on to explore everything else.
 */
export function backOrFeed(): void {
	if (router.canGoBack()) router.back();
	else router.replace("/feed");
}
