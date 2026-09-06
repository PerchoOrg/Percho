/**
 * The feed's header — the PLACE, not the product (phase181, owner pick "R3").
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * The feed opened with the "Percho" wordmark (2026-08-14) and, under it, a
 * one-line scope crumb (phase140 "S3", cut back to one line by phase179). The
 * owner's 2026-09-05 call: 「remove Percho app name, starts with area-city
 * directly」 — the page is about where you are looking, and the app already
 * says its name on the launch screen and in the tab bar.
 *
 * So the page opens on the place. Two rows of type, settled over three passes
 * with the owner on 2026-09-06:
 *
 *     line 1  Atlanta Metro ⌄   ·   40 communities · median $594K
 *     line 2  Dallas, GA ⌄
 *     line 3  community squares
 *     line 4  card — never cropped
 *     line 5  what is left over
 *     line 6  tabs
 *
 * The metro moved onto the stats row (「Make Atlanta Metro and Community stuff
 * in one line」) and became a control in its own right (「Atlanta metro
 * dropdown similar to community name」): both rows open the same scope sheet,
 * whose first row is "Anywhere in metro Atlanta" — which is what tapping the
 * metro is asking for.
 *
 * The city keeps the serif the wordmark used to own, alone on its line, and
 * that is deliberate: it is the answer to "where am I", and the numbers beside
 * it were competing with it for the same glance.
 *
 * ── Why a bigger header makes the page SHORTER ──────────────────────────────
 *
 * Counter-intuitive, and it is the whole reason this shape was picked. The
 * stage below is `flex: 1` and the card is anchored to its top (phase179), so
 * every point this header does NOT use ends up as empty paper under the card —
 * 128pt of it on the owner's iPhone, which is what he reported. Deleting the
 * wordmark alone made that 172. The header taking the space back is what
 * closes the hole, and `theme/card-frame.ts` had to stop sizing the card as a
 * share of the stage for that to work.
 *
 * The demo this was picked from: `percho.co/demos/feed-header-v2` (R3).
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import {
	SCOPE_ROOT_LABEL,
	metroStatsLine,
	scopeStatsLine,
} from "../../lib/feed/place-stats";
import { DM_SERIF_FONT } from "../../theme/fonts";
import { redline } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";

interface PlaceHeaderProps {
	/** The picked scope's display name, or null for the whole metro. */
	scopeName: string | null;
	/** The scoped unit, for its numbers. Absent → the metro's are used. */
	unit: GeoUnit | undefined;
	/** Every city unit in the pool, for the metro-level numbers. */
	units: readonly GeoUnit[];
	onPress: () => void;
	/** The community strip, mounted by the feed (it owns the deck). */
	children?: React.ReactNode;
}

export function PlaceHeader({
	scopeName,
	unit,
	units,
	onPress,
	children,
}: PlaceHeaderProps) {
	/**
	 * Row 1 is the NUMBERS row, always. Scoped, they are the city's; unscoped,
	 * the metro's — never nothing, and the metro's name never printed twice.
	 */
	const stats = scopeName ? scopeStatsLine(unit) : metroStatsLine(units);

	return (
		<View style={styles.wrap}>
			{/*
			 * Line 1 — one level up, and how much is in where you are.
			 *
			 * The metro shows here only when a CITY is scoped: then it is the way
			 * back up and the title below is the city. Unscoped, the metro IS the
			 * title, so this row carries the numbers alone instead of printing
			 * "Atlanta Metro" on both rows with no numbers on either.
			 */}
			<View style={styles.metaRow}>
				{scopeName ? (
					<>
						<Pressable
							onPress={onPress}
							accessibilityRole="button"
							accessibilityLabel={`Region: ${SCOPE_ROOT_LABEL}. Change`}
							hitSlop={{ top: 12, bottom: 12, left: 10, right: 6 }}
							style={({ pressed }) => [styles.metro, pressed && styles.pressed]}
						>
							<Text style={styles.metroLabel}>{SCOPE_ROOT_LABEL}</Text>
							<View style={styles.chevronSm} />
						</Pressable>
						{stats ? <Text style={styles.dot}>·</Text> : null}
					</>
				) : null}
				{/* The numbers truncate before anything else on this row. */}
				{stats ? (
					<Text style={styles.stats} numberOfLines={1}>
						{stats}
					</Text>
				) : null}
			</View>

			{/* Line 2 — the city, alone. With no city scoped the metro IS the
			    place, so the title falls back to it rather than sitting empty. */}
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={`Scope: ${scopeName ?? SCOPE_ROOT_LABEL}. Change`}
				hitSlop={{ top: 6, bottom: 8, left: 8, right: 8 }}
				style={({ pressed }) => [styles.titleRow, pressed && styles.pressed]}
			>
				<Text style={styles.title} numberOfLines={1}>
					{scopeName ?? SCOPE_ROOT_LABEL}
				</Text>
				<View style={styles.chevron} />
			</Pressable>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	/**
	 * ── Why this needs a z-index (owner on device, 2026-08-31) ──────────────
	 *
	 * `SwipeStack`'s `stageClip` is an OPAQUE paper band (`colors.bg`) 120pt
	 * ABOVE the stage, and no ancestor clips it — it hides the behind-card's
	 * top edge and its elevation glow. It carries `pointerEvents="none"`, so it
	 * paints over anything up here while leaving the touch target working:
	 * "看不到卡片上方的东西 但是点击空白居然可以弹窗 community list". Anything
	 * the feed puts above the stage has to out-rank that band; 100 is the
	 * number the old wordmark row used.
	 */
	wrap: { zIndex: 100, paddingTop: 4, alignItems: "center" },
	pressed: { opacity: 0.6 },
	/** Line 1 — metro dropdown · the city's numbers. */
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 20,
		maxWidth: "100%",
	},
	metro: { flexDirection: "row", alignItems: "center", gap: 4 },
	/** The metro reads as a control, so it takes ink rather than the muted grey. */
	metroLabel: {
		...redlineText.story,
		fontWeight: "600",
		color: redline.ink2,
	},
	dot: { ...redlineText.story, color: redline.ink3 },
	/** Line 2 — the city and its chevron. */
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 1,
		paddingHorizontal: 20,
		maxWidth: "100%",
	},
	/**
	 * The city, in the serif the wordmark used to own. 30pt is the wordmark's
	 * 34 stepped down: the page keeps a serif anchor at the top, but it now
	 * names the place instead of the app.
	 */
	title: {
		fontFamily: DM_SERIF_FONT,
		fontSize: 30,
		lineHeight: 34,
		letterSpacing: -0.6,
		color: redline.ink,
		flexShrink: 0,
	},
	/** The numbers. First to go when the row runs out of width. */
	stats: { ...redlineText.story, color: redline.ink3, flexShrink: 1 },
	/** The metro's chevron — the city's, one step down. Same two-border trick. */
	chevronSm: {
		width: 6,
		height: 6,
		marginTop: -3,
		borderRightWidth: 1.5,
		borderBottomWidth: 1.5,
		borderColor: redline.ink2,
		transform: [{ rotate: "45deg" }],
	},
	chevron: {
		width: 8,
		height: 8,
		marginTop: -4,
		borderRightWidth: 1.8,
		borderBottomWidth: 1.8,
		borderColor: redline.ink3,
		transform: [{ rotate: "45deg" }],
	},
});

/**
 * The height of the two type rows — everything this header draws except the
 * strip its child renders.
 *
 * 4 padding + 19 meta row + 1 + 34 title. The feed needs it BEFORE layout to
 * work out what height is left for the squares (`coverSize`), and measuring it
 * would make that circular: the strip's size would feed back into the height
 * being measured. Fixed type, so a constant is honest here — and
 * `theme/card-aspect.test.ts` computes the whole page from it.
 */
export const PLACE_HEADER_TEXT_HEIGHT = 4 + 19 + 1 + 34;
