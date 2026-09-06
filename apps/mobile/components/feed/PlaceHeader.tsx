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
 * So the page opens on the place. Settled over several passes with the owner
 * on 2026-09-06 (phase182.1 brought the wordmark back — see below):
 *
 *     line 1  Percho
 *     line 2  Atlanta metro › Dallas ▾  ·  40 communities
 *     line 3  card — never cropped
 *     line 4  what is left over
 *     line 5  tabs
 *
 * The metro moved onto the stats row (「Make Atlanta Metro and Community stuff
 * in one line」) and became a control in its own right (「Atlanta metro
 * dropdown similar to community name」): the line opens the scope sheet,
 * whose first row is "Anywhere in metro Atlanta" — which is what tapping the
 * metro is asking for.
 *
 * phase182 (owner, same day: the strip 「makes the page not well organized and
 * immersive」): the community-squares row between the line and the card is
 * gone, and the line itself became the card ↔ place connection — given a
 * `trail`, it reads the TOP CARD's parent chain and updates as the buyer
 * swipes: `Atlanta metro › Johns Creek › Bellmoore Park ▾` over a home.
 *
 * phase182.1 (owner: 「Being the Percho title back and second line is area
 * and city and communities count」): the wordmark row returns ABOVE the place
 * line, in the exact face it wore before 2026-09-05 (DM Serif 34 in the
 * forest green), and the communities count now rides EVERY state of the
 * line, not just the scope fallback — the trail's leaf city brings its own
 * number (`trailUnit`).
 *
 * ── Why a bigger header makes the page SHORTER ──────────────────────────────
 *
 * Counter-intuitive, and it is the whole reason this shape was picked. The
 * stage below is `flex: 1` and the card was anchored to its top (phase179), so
 * every point this header did NOT use ended up as empty paper under the card —
 * 128pt of it on the owner's iPhone, which is what he reported. Deleting the
 * wordmark alone made that 172. The header taking the space back is what
 * closed the hole, and `theme/card-frame.ts` had to stop sizing the card as a
 * share of the stage for that to work. (History as of phase182: the card is
 * CENTRED in the stage now — 「balance the empty space above and under card」
 * — so the slack splits evenly instead of pooling below.)
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
	/**
	 * The TOP CARD's parent chain below the metro (`placeTrail`) — phase182,
	 * what replaced the community strip's card ↔ place connection. Non-null,
	 * the line reads the card's place: metro › city › community for a home,
	 * metro › city for a community, the metro alone for a city card. Null (a
	 * trade-off, or no card yet), the line falls back to the scope + stats.
	 */
	trail: readonly string[] | null;
	/**
	 * The TOP CARD's own city unit, for the count beside a trail (phase182.1).
	 * Absent when the card's `geoUnitId` resolves to nothing — the line then
	 * shows no number rather than a wrong one.
	 */
	trailUnit: GeoUnit | undefined;
	onPress: () => void;
}

export function PlaceHeader({
	scopeName,
	unit,
	units,
	trail,
	trailUnit,
	onPress,
}: PlaceHeaderProps) {
	/**
	 * The count on the line (owner, phase182.1: 「second line is area and city
	 * and communities count」) — always the leaf's own number. A trail whose
	 * leaf is a city (or a community in one) carries that city's count; a
	 * metro leaf (a city card, or the unscoped fallback) carries the metro's;
	 * the scope fallback keeps the scoped city's. Real or absent throughout.
	 */
	const stats =
		trail !== null
			? trail.length > 0
				? scopeStatsLine(trailUnit)
				: metroStatsLine(units)
			: scopeName
				? scopeStatsLine(unit)
				: metroStatsLine(units);

	/**
	 * The runs the line draws when the top card gives it a place: the metro
	 * root, then the card's parents. The LAST link is the one in ink — the
	 * card's nearest parent; with an empty trail (a city card) that is the
	 * metro itself. Two runs, not a mapped list: everything above the leaf
	 * shares the muted style, so it can be one joined string.
	 */
	const leaf =
		trail === null ? null : (trail[trail.length - 1] ?? SCOPE_ROOT_LABEL);
	const parents =
		trail === null || trail.length === 0
			? null
			: [SCOPE_ROOT_LABEL, ...trail.slice(0, -1)].join(" › ");

	return (
		<View style={styles.wrap}>
			{/*
			 * The wordmark row, back by owner request (phase182.1) in the face it
			 * wore from 2026-08-14 to 2026-09-05: "Percho" centred at the very
			 * top, DM Serif Display 34/400/−0.5 in #086B5B, and the two top
			 * CORNERS stay empty — no features up here.
			 */}
			<View style={styles.chromeRow}>
				<Text style={styles.wordmark}>Percho</Text>
			</View>
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
			 *
			 * With a trail (phase182) the same line reads the TOP CARD's parent
			 * chain instead of the scope — the ink lands on the card's nearest
			 * parent, everything above it steps back a colour. Since phase182.1
			 * the communities count closes the line in every state; on the rare
			 * three-deep chain the whole line simply scales a step further.
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
					{leaf !== null ? (
						<>
							{parents !== null ? (
								<>
									<Text style={styles.metro}>{parents}</Text>
									<Text style={styles.sep}> › </Text>
								</>
							) : null}
							<Text style={styles.city}>{leaf}</Text>
						</>
					) : (
						<>
							{scopeName ? (
								<>
									<Text style={styles.metro}>{SCOPE_ROOT_LABEL}</Text>
									<Text style={styles.sep}> › </Text>
								</>
							) : null}
							<Text style={styles.city}>{scopeName ?? SCOPE_ROOT_LABEL}</Text>
						</>
					)}
					<Text style={styles.chevron}> ▾</Text>
					{stats ? <Text style={styles.stats}>{`  ·  ${stats}`}</Text> : null}
				</Text>
			</Pressable>
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
	/**
	 * The wordmark's row — 44pt tall so it reads as chrome rather than as a
	 * masthead band (its pre-2026-09-05 box, restored by phase182.1).
	 */
	chromeRow: {
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	/**
	 * DM Serif Display 34/400/−0.5 in #086B5B (owner spec, 2026-08-14: 「深墨
	 * 绿 + 优雅衬线」). The one place the redline's forest green crosses into
	 * app CHROME — the wordmark is the app's name, not chrome competing with a
	 * card, so the amber accent stays out of this row.
	 */
	wordmark: {
		fontFamily: DM_SERIF_FONT,
		fontSize: 34,
		fontWeight: "400",
		letterSpacing: -0.5,
		color: "#086B5B",
	},
	lineWrap: { paddingHorizontal: 20 },
	pressed: { opacity: 0.6 },
	/**
	 * The line's own box. `textAlign: center` centres it, and the height is the
	 * city's line box — the smaller runs sit on the same baseline.
	 */
	line: { textAlign: "center", lineHeight: 30 },
	/**
	 * The metro — the city's own size and face (owner, 2026-09-06: 「Atlanta
	 * metro should be bigger size」, and earlier 「dropdown similar to community
	 * name」). It carries the muted ink instead, which is the whole hierarchy
	 * now: same weight of voice, one step back in colour.
	 */
	metro: {
		fontFamily: DM_SERIF_FONT,
		fontSize: 24,
		letterSpacing: -0.4,
		color: redline.ink2,
	},
	sep: { fontFamily: DM_SERIF_FONT, fontSize: 20, color: redline.ink3 },
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
