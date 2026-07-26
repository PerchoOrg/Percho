/**
 * TabBar (§0.6 #6) — 4-tab bar, 62pt + home indicator inset. Warm-paper base
 * with a hairline top border; active = full ink, inactive = 50% ink-2.
 *
 * Presentational only (owner-approved #8): it takes tabs + active key +
 * onSelect. Wiring to expo-router `Tabs` and preserving per-tab nav stacks is a
 * later task's concern.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/tokens";
import { textStyles } from "../theme/typography";

export interface TabItem {
	key: string;
	label: string;
}

interface TabBarProps {
	/** Exactly 4 (§0.6 #6). */
	tabs: readonly [TabItem, TabItem, TabItem, TabItem];
	activeKey: string;
	onSelect: (key: string) => void;
}

const BAR_HEIGHT = 62;

export function TabBar({ tabs, activeKey, onSelect }: TabBarProps) {
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[
				styles.bar,
				{ height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
			]}
		>
			{tabs.map((t) => {
				const active = t.key === activeKey;
				return (
					<Pressable
						key={t.key}
						style={styles.tab}
						onPress={() => onSelect(t.key)}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
					>
						<Text
							style={[styles.label, active ? styles.active : styles.inactive]}
						>
							{t.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		backgroundColor: colors.bg,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
	label: { ...textStyles.caption },
	active: { color: colors.ink, opacity: 1 },
	inactive: { color: colors.ink2, opacity: 0.5 },
});
