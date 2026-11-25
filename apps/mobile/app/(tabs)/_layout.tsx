/**
 * The 4-tab shell (§0.6 #6 / 05 §5.1). Feed is the landing tab.
 *
 * `TabBar` is task-0's presentational component and has had no consumer until
 * now, so it is driven here rather than replaced by Expo Router's own tab bar:
 * §0.6 pins the bar's geometry (62pt + home-indicator inset, hairline top
 * border, active = full ink) and the built-in bar does not express that without
 * being restyled into the same component anyway.
 *
 * `Tabs` still owns navigation, so each tab keeps its own nav stack and the
 * feed's `activeIndex` survives a push to a detail screen and back (§1.9).
 */
import { Tabs } from "expo-router";
import { TabBar, type TabItem } from "../../components/TabBar";

/** Exactly 4 (§0.6 #6) — `TabBar` types this as a 4-tuple. */
const TABS: readonly [TabItem, TabItem, TabItem, TabItem] = [
	{ key: "feed", label: "Feed" },
	{ key: "search", label: "Search" },
	{ key: "saved", label: "Saved" },
	{ key: "you", label: "You" },
];

export default function TabsLayout() {
	return (
		<Tabs
			screenOptions={{ headerShown: false }}
			tabBar={({ state, navigation }) => (
				<TabBar
					tabs={TABS}
					activeKey={state.routeNames[state.index] ?? "feed"}
					onSelect={(key) => navigation.navigate(key)}
				/>
			)}
		>
			{/* Order fixes the bar order, so it must match TABS. */}
			<Tabs.Screen name="feed" />
			<Tabs.Screen name="search" />
			<Tabs.Screen name="saved" />
			<Tabs.Screen name="you" />
		</Tabs>
	);
}
