/**
 * TabBar (§0.6 #6) — 4-tab bar, 62pt + home indicator inset. Warm-paper base
 * with a hairline top border; active = green, inactive = neutral gray.
 *
 * Presentational only (owner-approved #8): it takes tabs + active key +
 * onSelect. Wiring to expo-router `Tabs` and preserving per-tab nav stacks is a
 * later task's concern.
 *
 * 2026-08-15 (owner): the bar went quiet. Icons are now Phosphor outline glyphs
 * (one library, 22px, ~1.75 stroke — see `TabBarIconFont.ts`), the label is
 * sentence case at 12.5/500 with no tracking, icon↔label gap is 5, and
 * inactive is neutral `#9B9B94` instead of the warm beige ink. No pills, no
 * indicator bar — the cards stay the visual centre.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, redline } from "../theme/tokens";
import {
	TAB_BAR_ART_WIDTH,
	TAB_BAR_FONT,
	TAB_BAR_GLYPH,
	TAB_BAR_GLYPH_SCALE,
	TAB_BAR_OPTICAL_SCALE,
	type TabBarIconName,
} from "./TabBarIconFont";

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
/** Icon size — the owner's 22–24px outline spec, at the low end for a quiet bar. */
const ICON_SIZE = 22;
/** Icon ↔ label gap (owner: 5–6px). */
const ICON_LABEL_GAP = 5;
/** Active tab colour — Percho green (redline accent, the only accent). */
const ACTIVE_GREEN = redline.accent;
/** Inactive — neutral gray (owner: NOT the warm beige ink). */
const INACTIVE_GRAY = "#9B9B94";

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
				const glyph = TAB_BAR_GLYPH[t.key as TabBarIconName];
				const artWidth = TAB_BAR_ART_WIDTH[t.key as TabBarIconName];
				const glyphScale = TAB_BAR_GLYPH_SCALE[t.key as TabBarIconName];
				const fontSize = ICON_SIZE * TAB_BAR_OPTICAL_SCALE * glyphScale;
				return (
					<Pressable
						key={t.key}
						style={styles.tab}
						onPress={() => onSelect(t.key)}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
					>
						<View
							style={[styles.iconBox, { width: ICON_SIZE, height: ICON_SIZE }]}
						>
							<Text
								allowFontScaling={false}
								style={[
									styles.icon,
									{
										fontFamily: TAB_BAR_FONT,
										fontSize,
										lineHeight: fontSize,
										color: active ? ACTIVE_GREEN : INACTIVE_GRAY,
										transform: [
											{
												translateX: (fontSize * (1 - artWidth)) / 2,
											},
										],
									},
								]}
							>
								{glyph}
							</Text>
						</View>
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
		/**
		 * 5% ink rather than `colors.border` (#EADFD0). The bar itself stays flat
		 * and container-less (owner, 2026-08-14); the rule above it only has to
		 * say "the surface ends here", and the warm token read as a drawn line.
		 */
		borderTopColor: "rgba(23,23,21,0.05)",
	},
	tab: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: ICON_LABEL_GAP,
	},
	iconBox: { alignItems: "center", justifyContent: "center" },
	/**
	 * Glyph text — pinned to the icon box, centred, with the art-shift so the
	 * drawing (not the em box) is centred. `includeFontPadding` off stops
	 * Android's line box from adding invisible space above the art.
	 */
	icon: {
		includeFontPadding: false,
		textAlignVertical: "center",
		textAlign: "center",
	},
	/** Label — 12.5/500, no uppercase, no tracking (owner, 2026-08-15). */
	label: {
		fontFamily: "System",
		fontSize: 12.5,
		fontWeight: "500",
	},
	active: { color: ACTIVE_GREEN },
	inactive: { color: INACTIVE_GRAY },
});
