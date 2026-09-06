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
import { fonts, redline } from "../../theme/tokens";

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
	/** Scoped, the city's numbers; unscoped, the metro's. Never nothing. */
	const stats = scopeName ? scopeStatsLine(unit) : metroStatsLine(units);

	return (
		<View style={styles.wrap}>
			{/*
			 * ONE line, all of it (owner, 2026-09-06: 「Make all text in one line,
			 * ok? If too big to fit in, just use smaller size」).
			 *
			 * It is a single `<Text>` with nested runs rather than a row of Views,
			 * and that is what makes "just use smaller size" work:
			 * `adjustsFontSizeToFit` scales every run by ONE factor until the line
			 * fits, so "Peachtree Corners" — which needs 522pt at full size against
			 * a 428pt screen — shrinks instead of wrapping or truncating. The
			 * chevron is a character for the same reason: a `View` cannot ride
			 * inside a Text that is being scaled.
			 *
			 * `minimumFontScale` 0.6 is the floor; below that the line would be
			 * smaller than the numbers beside it and unreadable, and the right
			 * answer at that point is a shorter string, not smaller type.
			 */}
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={`Scope: ${scopeName ?? SCOPE_ROOT_LABEL}. Change`}
				hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
				style={({ pressed }) => [styles.lineWrap, pressed && styles.pressed]}
			>
				<Text
					numberOfLines={1}
					adjustsFontSizeToFit
					minimumFontScale={0.6}
					style={styles.line}
				>
					{scopeName ? (
						<>
							<Text style={styles.metro}>{SCOPE_ROOT_LABEL}</Text>
							<Text style={styles.sep}> › </Text>
						</>
					) : null}
					<Text style={styles.city}>{scopeName ?? SCOPE_ROOT_LABEL}</Text>
					<Text style={styles.chevron}> ▾</Text>
					{stats ? <Text style={styles.stats}>{`  ·  ${stats}`}</Text> : null}
				</Text>
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
	wrap: { zIndex: 100, paddingTop: 4 },
	lineWrap: { paddingHorizontal: 20 },
	pressed: { opacity: 0.6 },
	/**
	 * The line's own box. `textAlign: center` centres it, and the height is the
	 * city's line box — the smaller runs sit on the same baseline.
	 */
	line: { textAlign: "center", lineHeight: 30 },
	/** The metro, ahead of the city and quieter than it. */
	metro: {
		fontFamily: fonts.ui,
		fontSize: 13,
		fontWeight: "600",
		color: redline.ink2,
	},
	sep: { fontFamily: fonts.ui, fontSize: 13, color: redline.ink3 },
	/**
	 * The place. 24pt serif — the wordmark's face, stepped down twice: it now
	 * shares a line with two runs of UI type, and at 30 the whole line was
	 * being scaled down by `adjustsFontSizeToFit` on every city with a long
	 * name, which made the SMALL runs unreadable to keep the big one big.
	 */
	city: {
		fontFamily: DM_SERIF_FONT,
		fontSize: 24,
		letterSpacing: -0.4,
		color: redline.ink,
	},
	/** A character, not a View — see the note on the line above. */
	chevron: { fontFamily: fonts.ui, fontSize: 12, color: redline.ink3 },
	/** The numbers, closing the line. */
	stats: {
		fontFamily: fonts.ui,
		fontSize: 12.5,
		color: redline.ink3,
	},
});

/**
 * The height of the two type rows — everything this header draws except the
 * strip its child renders.
 *
 * 4 padding + a 30pt line box. The feed needs it BEFORE layout to
 * work out what height is left for the squares (`coverSize`), and measuring it
 * would make that circular: the strip's size would feed back into the height
 * being measured. Fixed type, so a constant is honest here — and
 * `theme/card-aspect.test.ts` computes the whole page from it.
 */
export const PLACE_HEADER_TEXT_HEIGHT = 4 + 30;
