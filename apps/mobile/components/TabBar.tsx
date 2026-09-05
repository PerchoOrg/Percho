/**
 * TabBar (§0.6 #6) — 4-tab bar, 62pt + home indicator inset. Warm-paper base
 * with a hairline top border; active = green, inactive = neutral gray.
 *
 * Presentational only (owner-approved #8): it takes tabs + active key +
 * onSelect. Wiring to expo-router `Tabs` and preserving per-tab nav stacks is a
 * later task's concern.
 *
 * 2026-09-05 (owner: the icons are "not interesting, immersive, cute"): the bar
 * keeps its flat geometry and gains four things, all chosen off the hosted
 * demo at `/demos/tabbar-redesign`:
 *   1. New glyphs — house-line / compass / heart / hand-waving.
 *   2. Icon 24 / label 12 (was 22 / 12.5), so the drawing leads and the word
 *      reads as its caption.
 *   3. A soft green pill behind the ACTIVE icon (10% accent), the only
 *      container in the bar.
 *   4. The active icon is duotone (fill glyph at 22% under the outline) and
 *      pops + tilts when it is selected.
 * No floating capsule: the bar stays flush to the bottom edge (owner,
 * 2026-08-14), and the cards stay the visual centre.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, redline } from "../theme/tokens";
import {
	TAB_BAR_BOX_CENTER_Y,
	TAB_BAR_FONT,
	TAB_BAR_FONT_FILL,
	TAB_BAR_GLYPH,
	TAB_BAR_GLYPH_CENTER_Y,
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
/** Icon size (owner, 2026-09-05: demo step B1 — 24 icon over a 12 label). */
const ICON_SIZE = 24;
/** Icon ↔ label gap. */
const ICON_LABEL_GAP = 5;
/** The pill behind the active icon — 2× the icon wide, 1.36× tall (demo B). */
const PILL_WIDTH = ICON_SIZE * 2;
const PILL_HEIGHT = Math.round(ICON_SIZE * 1.36);
/** Active tab colour — Percho green (redline accent, the only accent). */
const ACTIVE_GREEN = redline.accent;
/** Inactive — neutral gray (owner: NOT the warm beige ink). */
const INACTIVE_GRAY = "#9B9B94";
/** The active pill: the same green, at the weight of a tint rather than a fill. */
const PILL_BG = "rgba(14,107,87,0.10)";
/** Opacity of the fill glyph under the outline on the active tab. */
const DUOTONE_OPACITY = 0.22;

export function TabBar({ tabs, activeKey, onSelect }: TabBarProps) {
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[
				styles.bar,
				{ height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
			]}
		>
			{tabs.map((t) => (
				<Tab
					key={t.key}
					item={t}
					active={t.key === activeKey}
					onSelect={onSelect}
				/>
			))}
		</View>
	);
}

/**
 * One tab. Split out of the map so each gets its own `useSharedValue` — hooks
 * cannot run in a loop, and the pop animation is per-tab state.
 */
function Tab({
	item,
	active,
	onSelect,
}: {
	item: TabItem;
	active: boolean;
	onSelect: (key: string) => void;
}) {
	const name = item.key as TabBarIconName;
	const glyph = TAB_BAR_GLYPH[name];
	const fontSize =
		ICON_SIZE * TAB_BAR_OPTICAL_SCALE * TAB_BAR_GLYPH_SCALE[name];
	/** Centre the drawing in the line box — see `TAB_BAR_GLYPH_CENTER_Y`. */
	const translateY =
		(TAB_BAR_GLYPH_CENTER_Y[name] - TAB_BAR_BOX_CENTER_Y) * fontSize;

	const pop = useSharedValue(0);
	useEffect(() => {
		// Only the tab being switched TO animates; going inactive is silent.
		if (!active) return;
		pop.value = withSequence(
			withTiming(1, { duration: 160 }),
			withTiming(0, { duration: 260 }),
		);
	}, [active, pop]);

	const popStyle = useAnimatedStyle(() => ({
		transform: [
			{ scale: 1 + pop.value * 0.22 },
			{ rotate: `${pop.value * -9}deg` },
		],
	}));

	const color = active ? ACTIVE_GREEN : INACTIVE_GRAY;
	/**
	 * The glyph's 1 em box is BIGGER than the icon box in both axes (`fontSize`
	 * is ICON_SIZE × 1.13), so it is placed explicitly rather than left to Yoga:
	 * `top`/`left` centre the em box over the icon box, `translateY` then
	 * centres the drawing inside it. Both layers get the same numbers, which is
	 * what keeps them registered.
	 *
	 * `width` is the horizontal half of that, and it is not optional: a `<Text>`
	 * pinned `left: 0, right: 0` inside the 24pt box gets a 24pt line — narrower
	 * than the glyph's 1 em advance (27.1pt) — and iOS lays the glyph out from
	 * the left of that line and CLIPS the overflow instead of letting it hang.
	 * Measured off the owner's screenshot (2026-09-05): every icon rendered
	 * 0.6–1.4pt narrower than its own outline, cut down the right-hand side —
	 * the heart lost its right lobe, hand-waving its thumb. Heights matched
	 * exactly, which is what pointed at the width.
	 */
	const glyphStyle = {
		fontSize,
		lineHeight: fontSize,
		top: (ICON_SIZE - fontSize) / 2,
		left: (ICON_SIZE - fontSize) / 2,
		width: fontSize,
		transform: [{ translateY }],
	};

	return (
		<Pressable
			style={styles.tab}
			onPress={() => onSelect(item.key)}
			accessibilityRole="tab"
			accessibilityState={{ selected: active }}
		>
			<View style={[styles.pill, active && styles.pillActive]}>
				<Animated.View
					style={[
						styles.iconBox,
						{ width: ICON_SIZE, height: ICON_SIZE },
						popStyle,
					]}
				>
					{active ? (
						<Text
							allowFontScaling={false}
							style={[
								styles.icon,
								glyphStyle,
								{
									fontFamily: TAB_BAR_FONT_FILL,
									color,
									opacity: DUOTONE_OPACITY,
								},
							]}
						>
							{glyph}
						</Text>
					) : null}
					<Text
						allowFontScaling={false}
						style={[
							styles.icon,
							glyphStyle,
							{ fontFamily: TAB_BAR_FONT, color },
						]}
					>
						{glyph}
					</Text>
				</Animated.View>
			</View>
			<Text style={[styles.label, active ? styles.active : styles.inactive]}>
				{item.label}
			</Text>
		</Pressable>
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
	/** Sized on every tab so the icon row never shifts when the pill appears. */
	pill: {
		width: PILL_WIDTH,
		height: PILL_HEIGHT,
		borderRadius: PILL_HEIGHT / 2,
		alignItems: "center",
		justifyContent: "center",
	},
	pillActive: { backgroundColor: PILL_BG },
	iconBox: { alignItems: "center", justifyContent: "center" },
	/**
	 * Glyph text — the two duotone layers are absolutely positioned so they
	 * stack in the same box. `includeFontPadding` off stops Android's line box
	 * from adding invisible space above the art.
	 */
	icon: {
		position: "absolute",
		includeFontPadding: false,
		textAlign: "center",
	},
	/** Label — 12/500, no uppercase, no tracking; 600 when active. */
	label: {
		fontFamily: "System",
		fontSize: 12,
		fontWeight: "500",
	},
	active: { color: ACTIVE_GREEN, fontWeight: "600" },
	inactive: { color: INACTIVE_GRAY },
});
