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
import { TAB_BAR_FONT } from "../components/TabBarIconFont";
import { ICON_FONT, OUTLINE_FONT } from "../components/cards/redline/icon-font";
import { initAuth } from "../state/auth";
import { DM_SERIF_FONT } from "../theme/fonts";
import { colors } from "../theme/tokens";

export default function RootLayout() {
	/**
	 * The card icon fonts — Phosphor Fill (main set, see `icon-font.ts`) plus
	 * the outline weight the trade-off card uses, plus the TabBar's outline
	 * set (see `TabBarIconFont.ts`).
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

	const [fontsLoaded, fontsError] = useFonts({
		[ICON_FONT]: require("../assets/fonts/PerchoIcons.ttf"),
		[OUTLINE_FONT]: require("../assets/fonts/PerchoIconsOutline.ttf"),
		[TAB_BAR_FONT]: require("../assets/fonts/TabBarIcons.ttf"),
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
