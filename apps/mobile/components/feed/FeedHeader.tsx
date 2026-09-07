/**
 * The feed's above-card header — the owner's implementation handoff
 * (`percho-header-redlines.svg`, map control **B**), settled over three
 * demos and five decisions.
 *
 * Two rows in the area above the card, and nothing else on the page moves:
 *
 *     Atlanta metro › Canton           ← context   18 high, 13/18
 *     River Green ›  [◎ Map]           ← main      44 high, serif 36
 *
 *     20 above, 66 of content, then 12 of paper, then the card.
 *
 * ── What went, and why the header moved down (owner, 2026-09-07) ────────────
 *
 * 「Remove the community, home and tradeoff text from header - the empty space
 * between card and header is too big, move header a little down?」
 *
 * The uppercase type row (HOME TOUR / COMMUNITY TOUR / CITY TOUR / TRADE-OFF)
 * is gone — the card's own badge already says what kind of card it is — and
 * 8 of the 20 points it held went into `PAD_TOP` (12 → 20), which is the
 * "move header a little down" half of the ask. The header is 86 where it was
 * 98.
 *
 * The other half — the band between the header and the card — could NOT be
 * closed here, and this is worth knowing before someone tries: the card is
 * capped at the film's own shape, so every point the header gives back to the
 * stage returns as SLACK, and under an even split half of it lands straight
 * back above the card. Handing the whole 20 to the stage would have made his
 * complaint worse. Closing the band took two changes outside this file:
 * `CARD_INSET.top` 16 → 12 and `SwipeStack`'s `restTop`, which now puts a
 * THIRD of the slack above the card and two thirds below it.
 *
 * What the owner actually sees, on a Pro Max: the gap from the last line of
 * text to the card was 64 (title → type row → 16 → half the slack) and is now
 * 37.
 *
 * ── What this replaced ──────────────────────────────────────────────────────
 *
 * `PlaceHeader` (phase181–182.1): the "Percho" wordmark over one
 * auto-shrinking place line that ended in the communities count. The handoff
 * removes both by name — "Do not introduce a Percho wordmark, community
 * count, floating overlay on the video, or another map-button variant" — and
 * spends the room on the card's own place, a navigable title, and the Map
 * control the feed has never had.
 *
 * ── The five decisions this file encodes (owner, 2026-09-07) ────────────────
 *
 * Off `percho.co/demos/feed-header-v3` and `-v4`:
 *
 *   1. **Map follows the name.** The pill sits 12 after the chevron, not at
 *      the header's right edge. The title slot only SHRINKS (`flexShrink`, no
 *      `flexGrow`), so at any name length the two read as one object —
 *      「map button应该和community name在同一行呼应 而不是不相干的两个部分」.
 *      Right-aligned, the city fallback left ~150pt of nothing between the
 *      word and the button, which is the disconnect he reported.
 *   2. **The city on both lines** while a home has no community — that rule
 *      lives in `lib/feed/feed-header.ts`, not here.
 *   3. **12 above** the context row: 「area和city上面有些空间 不是完全顶头 但是
 *      也不要太大」.
 *   4. **A long name shrinks, it is not cut** (see `TITLE_MIN_SCALE`).
 *   5. **Every number scales with the screen** (`theme/header-scale.ts`), so
 *      the proportion he approved at 390 holds on the mini and the Max.
 *
 * Because of (5) the sizes cannot live in a module-level `StyleSheet`: `sheet`
 * is a factory of one, memoised per scale. The base numbers stay declared at
 * the top of this file so `theme/feed-header.test.ts` can read them and
 * `theme/card-aspect.test.ts` can spend them.
 *
 * ── The scope sheet still opens from the context row ────────────────────────
 *
 * The handoff calls that row "explanatory text, not a feed filter", but the
 * line it replaced was the only control that opened `ScopeSheet` anywhere in
 * the feed (`ExhaustedCard`'s "Adjust my scope" only appears on a dry deck).
 * So the row keeps that job. It lost its ▾ in phase183.1 — the owner's demo
 * draws it as plain grey text — so the tap is there with nothing advertising
 * it. NOT a control on a trade-off ("Your preferences" is not a place) or on
 * a home with no resolvable location (the row is empty).
 */
import { useMemo } from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import type { FeedHeaderModel } from "../../lib/feed/feed-header";
import {
	mapAccessibilityLabel,
	titleAccessibilityLabel,
} from "../../lib/feed/feed-header";
import { DM_SERIF_FONT } from "../../theme/fonts";
import { headerScale } from "../../theme/header-scale";
import { colors, feedHeader, fonts } from "../../theme/tokens";

// ─── Geometry (handoff §2, logical units at 390) ─────────────────────
/**
 * The two row heights and the gap between them. With `PAD_TOP` the header owns
 * 86 above the card's own 12pt gap — `theme/feed-header.test.ts` reads these
 * declarations and `theme/card-aspect.test.ts` spends the total, per device,
 * through `headerScale`.
 */
const CONTEXT_ROW = 18;
const ROW_GAP = 4;
const MAIN_ROW = 44;
/**
 * Decision 3 (「area和city上面有些空间 不是完全顶头 但是也不要太大」), then the
 * 2026-09-07 pass: 12 → 20, 「move header a little down」. Paid for out of the
 * type row rather than taken from the card.
 */
const PAD_TOP = 20;

/**
 * "Header left = existing card left + 8". The card's own margin is `GUTTER`
 * (16) in `app/(tabs)/feed.tsx`, so the header sits 24 from the screen edge —
 * asserted against that constant rather than repeated by hand.
 */
const CARD_EDGE_INSET = 8;
const EDGE = 16 + CARD_EDGE_INSET;

/** Title → Map. The handoff's floor, and the width the title gives up first. */
const TITLE_MAP_GAP = 12;

// ─── Type ────────────────────────────────────────────────────────────
const CONTEXT_SIZE = 13;
/**
 * 36, measured off the owner's demo rather than taken from the handoff's
 * table (which said 30): the demo renders one pixel per point at 390 wide and
 * the title's CAP height there is 25pt, against DM Serif's 0.70 em caps.
 */
const TITLE_SIZE = 36;
/**
 * The floor `adjustsFontSizeToFit` may shrink to — decision 4, 「Don't cut the
 * community name if it is too long, use smaller size instead」.
 *
 * 0.5 is picked off the real pool, not by feel. At full size the row fits
 * about 13 characters, so most names shrink a little ("Bellmoore Park" lands
 * at 36.2 of 39.5 on a 428). The longest community name the mobile feed
 * serves today is 24 characters ("1250 West Powder Springs"), which needs 54%
 * — so nothing in the data truncates. Below 50% an ellipsis is still the
 * answer: an 18pt title under a 13pt breadcrumb has stopped being a title.
 */
const TITLE_MIN_SCALE = 0.5;
const MAP_LABEL_SIZE = 14;

// ─── Map control B ───────────────────────────────────────────────────
const MAP_WIDTH = 84;
const MAP_HEIGHT = 44;
const MAP_RADIUS = 22;
/** Pin → "Map". */
const MAP_GAP = 6;
const MAP_PAD = 12;

// ─── The pin (handoff §4: outlined, 18 wide, 1.75 stroke) ────────────
//
// Composed from `View`s — the technique `CommunityFace`'s place pill and
// bookmark already use. The app bundles no SVG renderer (`react-native-svg`
// is not a dependency, and adding one is a CLAUDE.md §8 conversation), and
// the 14-glyph icon-font subset carries no pin
// (`components/cards/redline/icon-font.ts`).
//
// ONE box, not four: a square with three corners rounded to 50% and the
// fourth left sharp, rotated 45° so the sharp corner points down. That is a
// teardrop — the drawing in the owner's demo — and it is one continuous
// outline, so there is no seam where a head meets a tail. An earlier pass
// drew a ring plus two legs and had a visible notch between them at this size.
//
// `borderBottomRightRadius: 0` is the sharp corner and a clockwise 45° is
// what puts it at the bottom (checked by rendering the same box model before
// writing it).
//
// ── Sized by the ICON, not by its head (owner, 2026-09-07) ──────────────────
//
// 「Map icon is too big, make it a bit smaller?」 — and he was right twice
// over. The head was set to the handoff's 18 and the tip hangs √½ of the
// head's width below its centre, so the drawing came out 21.7 tall: 20% over
// the 18 × 18 the handoff actually specifies, and on a real 3× screen an
// outlined teardrop that size reads heavier than it did in the mockup.
//
// So `PIN_SIZE` is the whole icon now and the head is derived from it. The
// stroke comes down with it — 1.75 on a 21.7pt drawing is 8% of its height,
// and holding 1.75 while the drawing shrank would have made it *heavier*,
// which is the opposite of the ask.
const PIN_SIZE = 18;
const PIN_TIP_RATIO = 1.207;
const PIN_HEAD = PIN_SIZE / PIN_TIP_RATIO;
const PIN_STROKE = 1.6;
const PIN_DOT = 3.75;

/**
 * Title chevron — 1.5 stroke (handoff §3). The box is 14 rather than the
 * table's 12: the demo draws it about 9 wide by 14 tall beside the bigger
 * title, and a rotated square spans half its height in width, so a 9pt arm
 * gives both.
 */
const CHEVRON_BOX = 14;
const CHEVRON_ARM = 9;
const CHEVRON_STROKE = 1.5;
/** Text → chevron. */
const CHEVRON_GAP = 6;

/**
 * Vertical slop on the two controls.
 *
 * Below 390 the scale takes the 44pt rows down to 42, under the §0.5 touch
 * floor. Rather than break the proportion the owner approved on one screen
 * size, the missing points come back as `hitSlop` — invisible, and exactly
 * what it is for.
 */
const TOUCH_SLOP = 4;

type HeaderStyles = ReturnType<typeof sheet>;

interface FeedHeaderProps {
	model: FeedHeaderModel;
	/** Open the title's community overview. Absent → no chevron, no tap. */
	onOpenTitle?: () => void;
	/** Open the map on the card's place. Absent → no Map button at all. */
	onOpenMap?: () => void;
	/** Open `ScopeSheet` from the context row (see the file header). */
	onOpenScope?: () => void;
}

export function FeedHeader({
	model,
	onOpenTitle,
	onOpenMap,
	onOpenScope,
}: FeedHeaderProps) {
	const { width } = useWindowDimensions();
	const k = headerScale(width);
	const styles = useMemo(() => sheet(k), [k]);

	/**
	 * The context row doubles as the scope control only when it is showing
	 * real parent places. "Your preferences" opens nothing, and neither does
	 * an empty row.
	 */
	const scopeControl =
		onOpenScope !== undefined &&
		model.kind !== "trade-off" &&
		model.contextText !== "";

	const contextRow = (
		<Text
			style={styles.context}
			numberOfLines={1}
			ellipsizeMode="tail"
			accessible={false}
		>
			{model.contextText}
		</Text>
	);

	return (
		<View style={styles.wrap}>
			{scopeControl ? (
				<Pressable
					onPress={onOpenScope}
					accessibilityRole="button"
					accessibilityLabel={`Area: ${model.contextText}. Change`}
					hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}
					style={({ pressed }) => [styles.contextRow, pressed && styles.dim]}
				>
					{contextRow}
				</Pressable>
			) : (
				<View style={styles.contextRow}>{contextRow}</View>
			)}

			<View style={styles.mainRow}>
				{onOpenTitle !== undefined ? (
					<Pressable
						onPress={onOpenTitle}
						accessibilityRole="button"
						accessibilityLabel={titleAccessibilityLabel(model)}
						hitSlop={{ top: TOUCH_SLOP, bottom: TOUCH_SLOP }}
						style={({ pressed }) => [styles.titleSlot, pressed && styles.dim]}
					>
						<Title text={model.title} styles={styles} />
						<View style={styles.chevronBox}>
							<View style={styles.chevronArm} />
						</View>
					</Pressable>
				) : (
					<View
						style={styles.titleSlot}
						accessible
						accessibilityLabel={titleAccessibilityLabel(model)}
					>
						<Title text={model.title} styles={styles} />
					</View>
				)}

				{onOpenMap !== undefined && (
					<Pressable
						onPress={onOpenMap}
						accessible
						accessibilityRole="button"
						accessibilityLabel={mapAccessibilityLabel(model)}
						hitSlop={{ top: TOUCH_SLOP, bottom: TOUCH_SLOP }}
						style={({ pressed }) => [styles.map, pressed && styles.mapPressed]}
					>
						<View style={styles.pinBox}>
							<View style={styles.pinDrop} />
							<View style={styles.pinDot} />
						</View>
						<Text style={styles.mapLabel} numberOfLines={1}>
							Map
						</Text>
					</Pressable>
				)}
			</View>
		</View>
	);
}

/**
 * The title's own text run — the ONLY thing in the header that gives up room:
 * the Map button and the chevron are both laid out first (`flexShrink: 0`),
 * so a long community name can never push either off the header (handoff §6).
 *
 * ── It shrinks, it does not truncate (decision 4) ───────────────────────────
 *
 * `adjustsFontSizeToFit` in a row that can only SHRINK the text's box is
 * exactly the two-pass behaviour wanted here: flex measures the name at 36,
 * hands the slot whatever the row has left after the pill and the chevron,
 * and the type then scales to fit that box. A short name is never touched —
 * its intrinsic width already fits — and a long one comes down as far as
 * `TITLE_MIN_SCALE`.
 *
 * No `lineHeight`: iOS clips auto-shrunk text against an explicit one, and it
 * is not needed here — the row's own `minHeight` fixes the header's height, so
 * a name at 18pt and one at 36 leave the card in exactly the same place.
 */
function Title({ text, styles }: { text: string; styles: HeaderStyles }) {
	return (
		<Text
			style={styles.title}
			numberOfLines={1}
			adjustsFontSizeToFit
			minimumFontScale={TITLE_MIN_SCALE}
			ellipsizeMode="tail"
		>
			{text}
		</Text>
	);
}

/**
 * The header's sheet at one scale (decision 5). Memoised by the component, so
 * this runs once per distinct screen width rather than once per render.
 */
function sheet(k: number) {
	return StyleSheet.create({
		/**
		 * ── Why this needs a z-index (owner on device, 2026-08-31) ────────────
		 *
		 * `SwipeStack`'s `stageClip` is an OPAQUE paper band (`colors.bg`) 120pt
		 * ABOVE the stage, and no ancestor clips it — it hides the behind-card's
		 * top edge and its elevation glow. It carries `pointerEvents="none"`, so
		 * it paints over anything up here while leaving the touch target working:
		 * "看不到卡片上方的东西 但是点击空白居然可以弹窗 community list". Anything
		 * the feed puts above the stage has to out-rank that band; 100 is the
		 * number every header up here has used since. The Map pill makes it
		 * matter more — it is the first real BUTTON drawn above the stage.
		 *
		 * `backgroundColor` is the screen canvas: the handoff keeps the header on
		 * the page's own paper, with no panel, border or shadow.
		 */
		wrap: {
			zIndex: 100,
			paddingTop: PAD_TOP * k,
			paddingHorizontal: EDGE * k,
			backgroundColor: colors.bg,
		},
		/**
		 * Rows carry `minHeight`, not `height`.
		 *
		 * The handoff's 86 describes the DEFAULT text size, and iOS text scaling
		 * stays on (§6: "Do not disable scaling globally"). At a larger setting
		 * each row grows to its own content, the header grows with it, and the
		 * stage below — which is `flex: 1` — gives up the difference. Nothing
		 * overlaps the status bar or the card, and no row ever wraps to a second
		 * line: every text in here is `numberOfLines={1}`.
		 */
		contextRow: { minHeight: CONTEXT_ROW * k, justifyContent: "center" },
		mainRow: {
			minHeight: MAIN_ROW * k,
			marginTop: ROW_GAP * k,
			flexDirection: "row",
			alignItems: "center",
		},
		/** Pressed feedback for the two text controls. The Map pill darkens
		 * instead (handoff §4) — a filled control must not fade. */
		dim: { opacity: 0.6 },

		context: {
			fontFamily: fonts.ui,
			fontSize: CONTEXT_SIZE * k,
			lineHeight: CONTEXT_ROW * k,
			fontWeight: "400",
			color: feedHeader.context,
		},

		/**
		 * The title's 44pt touch target, and the flexible half of the row.
		 *
		 * `flexShrink` WITHOUT `flexGrow` is decision 1: the slot is only as
		 * wide as the name needs, so the Map pill follows the name instead of
		 * being pushed to the header's right edge. Yoga defaults `flexShrink` to
		 * 0, unlike the web, so it has to be said out loud — and `flex: 1` here
		 * would put the pill back on the edge.
		 */
		titleSlot: {
			flexShrink: 1,
			minWidth: 0,
			height: MAIN_ROW * k,
			flexDirection: "row",
			alignItems: "center",
		},
		/**
		 * DM Serif Display — the face this slot already wore (the wordmark's,
		 * and the place line's before it). The handoff asks for the app's
		 * existing serif display family at the closest supported weight, and
		 * this family ships one: 400.
		 */
		title: {
			flexShrink: 1,
			fontFamily: DM_SERIF_FONT,
			fontSize: TITLE_SIZE * k,
			color: feedHeader.title,
		},
		chevronBox: {
			width: CHEVRON_BOX * k,
			height: CHEVRON_BOX * k,
			marginLeft: CHEVRON_GAP * k,
			flexShrink: 0,
			alignItems: "center",
			justifyContent: "center",
		},
		chevronArm: {
			width: CHEVRON_ARM * k,
			height: CHEVRON_ARM * k,
			borderTopWidth: CHEVRON_STROKE * k,
			borderRightWidth: CHEVRON_STROKE * k,
			borderColor: feedHeader.context,
			transform: [{ rotate: "45deg" }],
		},

		/**
		 * Map control B. 84 × 44 at radius 22, the pale sage fill, no border and
		 * no shadow. `minWidth` rather than `width` so the pill widens for a
		 * scaled-up label instead of clipping it.
		 */
		map: {
			minWidth: MAP_WIDTH * k,
			minHeight: MAP_HEIGHT * k,
			marginLeft: TITLE_MAP_GAP * k,
			flexShrink: 0,
			paddingHorizontal: MAP_PAD * k,
			borderRadius: MAP_RADIUS * k,
			backgroundColor: feedHeader.mapFill,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			gap: MAP_GAP * k,
		},
		mapPressed: { backgroundColor: feedHeader.mapPressed },
		mapLabel: {
			fontFamily: fonts.ui,
			fontSize: MAP_LABEL_SIZE * k,
			fontWeight: "600",
			color: feedHeader.accent,
		},

		// ─── Pin art (see the block above the constants) ─────────────────
		pinBox: { width: PIN_HEAD * k, height: PIN_SIZE * k },
		/** The teardrop: one outlined box, three corners round, rotated. */
		pinDrop: {
			position: "absolute",
			left: 0,
			top: 0,
			width: PIN_HEAD * k,
			height: PIN_HEAD * k,
			borderWidth: PIN_STROKE * k,
			borderColor: feedHeader.accent,
			borderTopLeftRadius: (PIN_HEAD / 2) * k,
			borderTopRightRadius: (PIN_HEAD / 2) * k,
			borderBottomLeftRadius: (PIN_HEAD / 2) * k,
			borderBottomRightRadius: 0,
			transform: [{ rotate: "45deg" }],
		},
		/** The hole, on the head's centre — which the rotation leaves put. */
		pinDot: {
			position: "absolute",
			left: ((PIN_HEAD - PIN_DOT) / 2) * k,
			top: ((PIN_HEAD - PIN_DOT) / 2) * k,
			width: PIN_DOT * k,
			height: PIN_DOT * k,
			borderRadius: (PIN_DOT / 2) * k,
			backgroundColor: feedHeader.accent,
		},
	});
}
