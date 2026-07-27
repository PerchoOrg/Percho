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
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<StatusBar style="dark" />
				<Stack screenOptions={{ headerShown: false }} />
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
