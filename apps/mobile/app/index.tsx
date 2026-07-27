/**
 * Entry route — redirects into the tab group.
 *
 * A `Redirect` rather than a landing screen: the old index was a "Homes that fit
 * your vibe" splash with an "Open feed →" button, which put a tap between the
 * buyer and the only thing the app does. 05 §5.1 has no signup wall and no
 * splash gate, so the feed IS the landing surface.
 *
 * This also removes the last of the pre-v3 hardcoded hex literals from `app/`.
 */
import { Redirect } from "expo-router";

export default function Index() {
	return <Redirect href="/feed" />;
}
