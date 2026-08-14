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
import { colors, redline } from "../theme/tokens";
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
				const Icon = ICONS[t.key];
				return (
					<Pressable
						key={t.key}
						style={styles.tab}
						onPress={() => onSelect(t.key)}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
					>
						{Icon && (
							<View style={active ? styles.iconOn : styles.iconOff}>
								<Icon color={active ? ACTIVE_GREEN : colors.ink2} />
							</View>
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

/**
 * ── Outline tab icons (owner, 2026-08-14) ───────────────────────────────────
 *
 * Lucide-style 1.75-stroke outlines at 20pt, composed from bordered `View`s —
 * the same technique (and for the same two reasons) as `ListingFace`'s arrow
 * and bookmark: the Phosphor subset this project ships is FILL-only, and
 * `react-native-svg` red-screens in Expo Go (DEVLOG 2026-07-30 04:55).
 *
 * Geometry is Lucide's own 24-grid scaled by `K`, not eyeballed:
 *
 *   home      roof (3.5,11)→(12,3.5)→(20.5,11), walls down to y 20.5
 *   search    circle c(10.5,10.5) r 6.5, handle (15.1,15.1)→(20,20)
 *   bookmark  body x 5..19, y 3..21, notch tip (12,16)   [same as ListingFace]
 *   user      head c(12,8) r 4, shoulders as a semicircle x 4..20 from y 13
 *
 * Colour is a prop rather than a style constant because the bar has two
 * states; everything else about each icon is fixed, so the rest of the
 * geometry lives in the StyleSheet below.
 */
const ICON_SIZE = 22;
const K = ICON_SIZE / 24;
const STROKE = 1.75;
/** Active tab colour — icon AND text (owner, 2026-08-14: 「icon 和 text 都变深绿色」). */
const ACTIVE_GREEN = "#0E5C48";

interface IconProps {
	color: string;
}

/** Rotated-bar geometry for one leg of a two-legged shape (roof, notch). */
function bar(run: number, rise: number) {
	return {
		length: Math.hypot(run, rise),
		angle: (Math.atan2(rise, run) * 180) / Math.PI,
	};
}

const HOME_APEX_Y = 3.5 * K;
const HOME_EAVE_Y = 11 * K;
const HOME_BASE_Y = 20.5 * K;
const HOME_LEFT = 3.5 * K;
const HOME_WIDTH = 17 * K;
const HOME_ROOF = bar(HOME_WIDTH / 2, HOME_EAVE_Y - HOME_APEX_Y);

function HomeIcon({ color }: IconProps) {
	return (
		<View style={styles.iconBox}>
			<View
				style={[
					styles.homeRoof,
					styles.homeRoofLeft,
					{ backgroundColor: color },
				]}
			/>
			<View
				style={[
					styles.homeRoof,
					styles.homeRoofRight,
					{ backgroundColor: color },
				]}
			/>
			<View
				style={[
					styles.homeWall,
					styles.homeWallLeft,
					{ backgroundColor: color },
				]}
			/>
			<View
				style={[
					styles.homeWall,
					styles.homeWallRight,
					{ backgroundColor: color },
				]}
			/>
			<View style={[styles.homeBase, { backgroundColor: color }]} />
		</View>
	);
}

const GLASS_D = 13 * K;
const GLASS_LEFT = 4 * K;
const HANDLE = bar(4.9 * K, 4.9 * K);

function SearchIcon({ color }: IconProps) {
	return (
		<View style={styles.iconBox}>
			<View style={[styles.glass, { borderColor: color }]} />
			<View style={[styles.handle, { backgroundColor: color }]} />
		</View>
	);
}

const BM_LEFT = 5 * K;
const BM_WIDTH = 14 * K;
const BM_TOP = 3 * K;
const BM_BOTTOM = 21 * K;
/** Where the V bites into the bottom edge. */
const BM_NOTCH = 16 * K;
const BM_DIAG = bar(BM_WIDTH / 2, BM_BOTTOM - BM_NOTCH);

function BookmarkIcon({ color }: IconProps) {
	return (
		<View style={styles.iconBox}>
			<View style={[styles.bookmarkTop, { backgroundColor: color }]} />
			<View
				style={[
					styles.bookmarkSide,
					styles.bookmarkSideLeft,
					{ backgroundColor: color },
				]}
			/>
			<View
				style={[
					styles.bookmarkSide,
					styles.bookmarkSideRight,
					{ backgroundColor: color },
				]}
			/>
			<View
				style={[
					styles.bookmarkDiag,
					styles.bookmarkDiagLeft,
					{ backgroundColor: color },
				]}
			/>
			<View
				style={[
					styles.bookmarkDiag,
					styles.bookmarkDiagRight,
					{ backgroundColor: color },
				]}
			/>
		</View>
	);
}

/**
 * UserRound (Lucide) — 22px, stroke 1.75 (owner, 2026-08-14). Geometry from
 * Lucide's 24-grid scaled by K, same stroke + box rhythm as Home / Search /
 * Bookmark. Head is r5 (NOT the r4 of plain `user`). The shoulders are a
 * WIDER barrel than Lucide's exact half-disc (owner: 「身子拉出来一点,看不
 * 出来是身子」) — 18 units wide with mostly-straight sides so the body reads
 * as a body at 22px instead of a shallow "U":
 *
 *   circle  c(12,8) r 5          → head
 *   barrel  w 18, y 12.5→24      → shoulders (ALL four borders drawn —
 *                                  top border alone was just an arc with
 *                                  blank space below, the 2026-08-14 bug)
 */
const HEAD_D = 10 * K;
const SHOULDER_W = 18 * K;
/** Top at 12.5, down to the box bottom (24 on the grid). */
const SHOULDER_H = 11.5 * K;
const SHOULDER_R = 7 * K;

function UserIcon({ color }: IconProps) {
	return (
		<View style={styles.iconBox}>
			<View style={[styles.head, { borderColor: color }]} />
			<View style={[styles.shoulders, { borderColor: color }]} />
		</View>
	);
}

/** Keyed by the tab keys `app/(tabs)/_layout.tsx` defines. */
const ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
	feed: HomeIcon,
	search: SearchIcon,
	saved: BookmarkIcon,
	you: UserIcon,
};

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
	tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
	label: { ...textStyles.caption },
	active: { color: ACTIVE_GREEN, opacity: 1 },
	inactive: { color: colors.ink2, opacity: 0.5 },
	/** The icon's half of the same two states — dimming only; colour is a prop. */
	iconOn: { opacity: 1 },
	iconOff: { opacity: 0.5 },

	iconBox: { width: ICON_SIZE, height: ICON_SIZE },

	homeRoof: {
		position: "absolute",
		top: (HOME_APEX_Y + HOME_EAVE_Y) / 2 - STROKE / 2,
		width: HOME_ROOF.length,
		height: STROKE,
		borderRadius: STROKE / 2,
	},
	homeRoofLeft: {
		left: HOME_LEFT + HOME_WIDTH / 4 - HOME_ROOF.length / 2,
		transform: [{ rotate: `${-HOME_ROOF.angle}deg` }],
	},
	homeRoofRight: {
		left: HOME_LEFT + (HOME_WIDTH * 3) / 4 - HOME_ROOF.length / 2,
		transform: [{ rotate: `${HOME_ROOF.angle}deg` }],
	},
	homeWall: {
		position: "absolute",
		top: HOME_EAVE_Y,
		width: STROKE,
		height: HOME_BASE_Y - HOME_EAVE_Y,
	},
	homeWallLeft: { left: HOME_LEFT },
	homeWallRight: { left: HOME_LEFT + HOME_WIDTH - STROKE },
	homeBase: {
		position: "absolute",
		left: HOME_LEFT,
		top: HOME_BASE_Y - STROKE,
		width: HOME_WIDTH,
		height: STROKE,
		borderRadius: STROKE / 2,
	},

	glass: {
		position: "absolute",
		left: GLASS_LEFT,
		top: GLASS_LEFT,
		width: GLASS_D,
		height: GLASS_D,
		borderRadius: GLASS_D / 2,
		borderWidth: STROKE,
	},
	/** The handle runs out of the circle at 45°, Lucide's (15.1,15.1)→(20,20). */
	handle: {
		position: "absolute",
		left: 17.55 * K - HANDLE.length / 2,
		top: 17.55 * K - STROKE / 2,
		width: HANDLE.length,
		height: STROKE,
		borderRadius: STROKE / 2,
		transform: [{ rotate: `${HANDLE.angle}deg` }],
	},

	bookmarkTop: {
		position: "absolute",
		left: BM_LEFT,
		top: BM_TOP,
		width: BM_WIDTH,
		height: STROKE,
		borderRadius: STROKE / 2,
	},
	bookmarkSide: {
		position: "absolute",
		top: BM_TOP,
		width: STROKE,
		height: BM_BOTTOM - BM_TOP,
		borderRadius: STROKE / 2,
	},
	bookmarkSideLeft: { left: BM_LEFT },
	bookmarkSideRight: { left: BM_LEFT + BM_WIDTH - STROKE },
	/** The V: two bars rotated about their own centres onto the notch's legs. */
	bookmarkDiag: {
		position: "absolute",
		top: (BM_BOTTOM + BM_NOTCH) / 2 - STROKE / 2,
		width: BM_DIAG.length,
		height: STROKE,
		borderRadius: STROKE / 2,
	},
	bookmarkDiagLeft: {
		left: BM_LEFT + BM_WIDTH / 4 - BM_DIAG.length / 2,
		transform: [{ rotate: `${-BM_DIAG.angle}deg` }],
	},
	bookmarkDiagRight: {
		left: BM_LEFT + (BM_WIDTH * 3) / 4 - BM_DIAG.length / 2,
		transform: [{ rotate: `${BM_DIAG.angle}deg` }],
	},

	head: {
		position: "absolute",
		left: (ICON_SIZE - HEAD_D) / 2,
		top: 4 * K,
		width: HEAD_D,
		height: HEAD_D,
		borderRadius: HEAD_D / 2,
		borderWidth: STROKE,
	},
	/**
	 * UserRound's shoulders: a rounded-top barrel running from under the
	 * head down to the box baseline. ALL FOUR borders are drawn — the
	 * earlier version drew only `borderTopWidth`, so the body rendered as a
	 * top arc with blank space below (owner: 「身子不够长,下面是空白」).
	 */
	shoulders: {
		position: "absolute",
		left: (ICON_SIZE - SHOULDER_W) / 2,
		top: 12.5 * K,
		width: SHOULDER_W,
		height: SHOULDER_H,
		borderTopWidth: STROKE,
		borderLeftWidth: STROKE,
		borderRightWidth: STROKE,
		borderBottomWidth: STROKE,
		borderTopLeftRadius: SHOULDER_R,
		borderTopRightRadius: SHOULDER_R,
	},
});
