/**
 * Root layout. A `Stack` above the `(tabs)` group, so a future detail screen
 * (task 2's listing, task 3's community) pushes OVER the tab bar rather than
 * inside a tab.
 *
 * `SafeAreaProvider` is required here, not optional: `TabBar` reads
 * `useSafeAreaInsets()` to sit above the home indicator (§0.6 #6), and without a
 * provider those insets read 0 and the bar renders under the indicator on every
 * notched device.
 */
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TAB_BAR_FONT, TAB_BAR_FONT_FILL } from "../components/TabBarIconFont";
import { ICON_FONT, OUTLINE_FONT } from "../components/cards/redline/icon-font";
import { createEventsTransport } from "../lib/events-transport";
import { initAuth } from "../state/auth";
import { useEventQueue } from "../state/event-queue";

import { DM_SERIF_FONT } from "../theme/fonts";
import { colors } from "../theme/tokens";

/** Queue depth that triggers an opportunistic mid-session drain. */
const DRAIN_THRESHOLD = 20;

export default function RootLayout() {
	/**
	 * The card icon fonts — Phosphor Fill (main set, see `icon-font.ts`) plus
	 * the outline weight the trade-off card uses, plus BOTH TabBar weights —
	 * its active tab draws the fill glyph under the outline one (duotone), so a
	 * missing fill font would silently flatten the active state (see
	 * `TabBarIconFont.ts`).
	 *
	 * Gated: an unloaded icon font renders PUA codepoints through the system
	 * fallback — a visible tofu/"?" glyph in the trade-off discs and the tab
	 * bar until the first re-render swaps them in (owner report 2026-08-18:
	 * "点一下才切换成正常的icon"). The fonts are tiny (~2–8 KB each) and
	 * bundled, so the gate is a single frame; the tree behind it does not
	 * mount until the glyphs are actually drawable.
	 */
	// Auth session restore + the saved-list sync it triggers (`state/saved.ts`).
	// Before the font gate on purpose: the session read can run while fonts load.
	useEffect(() => {
		initAuth();
	}, []);

	// Telemetry stops being a no-op (phase C): install the real transport,
	// drain whatever survived the last session, and drain again whenever the
	// queue builds up. The feed's reconnect handler still drains on
	// network-return; this threshold covers long browse sessions in between.
	useEffect(() => {
		const q = useEventQueue.getState();
		q.setTransport(createEventsTransport());
		void q.drain();
		return useEventQueue.subscribe((s) => {
			if (s.queue.length >= DRAIN_THRESHOLD && !s.draining) void s.drain();
		});
	}, []);

	const [fontsLoaded, fontsError] = useFonts({
		[ICON_FONT]: require("../assets/fonts/PerchoIcons.ttf"),
		[OUTLINE_FONT]: require("../assets/fonts/PerchoIconsOutline.ttf"),
		[TAB_BAR_FONT]: require("../assets/fonts/TabBarIcons.ttf"),
		[TAB_BAR_FONT_FILL]: require("../assets/fonts/TabBarIconsFill.ttf"),
		[DM_SERIF_FONT]: require("../assets/fonts/DMSerifDisplay-Regular.ttf"),
	});

	// Font load failure must NOT white-screen the app — fall through and let
	// the system fallback render (a few tofu glyphs beat a dead app).
	if (!fontsLoaded && !fontsError) {
		return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<StatusBar style="dark" />
				<Stack screenOptions={{ headerShown: false }} />
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
