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
import { type } from "../theme/typography";

export interface TabItem {
	key: string;
	label: string;
	icon?: string;
}

interface TabBarProps {
	tabs: TabItem[];
	activeKey: string;
	onSelect: (key: string) => void;
}

const BAR_HEIGHT = 62;

export function TabBar({ tabs, activeKey, onSelect }: TabBarProps) {
	const insets = useSafeAreaInsets();
	return (
		<View style={[styles.bar, { paddingBottom: insets.bottom }]}>
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
						{!!t.icon && (
							<Text
								style={[styles.icon, active ? styles.active : styles.inactive]}
							>
								{t.icon}
							</Text>
						)}
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
		height: BAR_HEIGHT,
		backgroundColor: colors.bg,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
	icon: { fontSize: 20 },
	label: { ...type.caption },
	active: { color: colors.ink, opacity: 1 },
	inactive: { color: colors.ink2, opacity: 0.5 },
});
