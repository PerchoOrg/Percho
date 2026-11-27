/**
 * The block above the feed card (phase378; moved up in phase379; larger and
 * set down on the card in phase380): where the place is, the Map button, and
 * up to three figures the film cannot show.
 *
 *     Alpharetta, GA · Fulton County  [◎ Map]             ← place   44 high
 *     $747K            Top 3%           25 mi             ← figures 48 high
 *     ZIP 30005 homes  schools nearby   north of Atlanta
 *                                                         14
 *     [card]
 *
 * ── What it replaced ────────────────────────────────────────────────────────
 *
 * `FeedHeader` (phase183): a breadcrumb over the card's name at 36pt. Owner
 * 2026-11-23: "感觉还是以填充为主 信息本身也和卡片有重合" — the name was on the
 * card already and its chevron opened the page Explore opens. So the name is
 * said once, on the card, and this says what the card does not.
 *
 * Where it sits took three passes: under the card ("方案2", phase378), then
 * above it in the header's own 86pt with the card unmoved ("numbers above
 * the card", phase379), then — "card下方空隙多了 整体向下或者增大上面的文字" —
 * set down on the card, which hangs 12 above the tab bar, with its text
 * larger. Where it sits is `theme/feed-page.ts`'s; this file only draws.
 *
 * ── Carried over from the header, on purpose ────────────────────────────────
 *
 *   · **Map control B**: the pale sage fill, an outlined pin and the word,
 *     no border and no shadow — at 64 × 30 since phase404.11. The handoff's
 *     84 × 44 was the row's whole height in green, the largest thing above
 *     the card (owner, 2026-11-27: 「map 还是有点突兀可能是背景绿色太大？」;
 *     phase379 had it at 72 × 32). The touch area is still the row's.
 *   · **Every number scales with the screen** (`theme/header-scale.ts`), so
 *     the proportion approved at 390 holds on the mini and the Max. That is
 *     why the sizes cannot live in a module-level `StyleSheet`: `sheet` is a
 *     factory of one, memoised per scale.
 *   · **The place row is one size, always** (owner, 2026-11-26: 「字体不统一
 *     如果社区或者city名字长 前半部分就很小 想想办法」). The place line and the
 *     Map pill are both `PLACE_SIZE`, and neither shrinks to fit: a line
 *     that shrank beside a pill read as a different face. What
 *     gives way instead is the line's second half ("· Fulton County"), which
 *     is left out whole when it does not fit — never cut mid-word; only a
 *     name too long for the row on its own ends in "…". Map follows the
 *     line's last word rather than sitting at the row's far edge. This replaces, for
 *     this row, the 2026-09-07 rule that text shrinks rather than being cut
 *     (said of the 36pt title the row used to sit under). The figures below
 *     still shrink to fit, each one alone in its column.
 *   · **Rows carry `minHeight`, not `height`**: iOS text scaling stays on, and
 *     a row with no text yet is as tall as a full one, so the card does not
 *     move when the first one lands.
 *   · **A rank above the stage's paper band** — see `wrap`.
 *
 * ── Figures are ways in, when there is somewhere to go ──────────────────────
 *
 * A figure opens the place's Explore page on the part it belongs to. With no
 * page (`onOpenCell` absent) it is text and nothing dims under a finger.
 */
import type { GlanceCell } from "@percho/shared/glance";
import { useMemo, useState } from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import type { PlaceBlockModel } from "../../lib/feed/place-block";
import {
	cellAccessibilityLabel,
	isLetterFigure,
	mapAccessibilityLabel,
	placeAccessibilityLabel,
} from "../../lib/feed/place-block";
import { FACTS_ROW, GUTTER, PLACE_ROW, ROW_GAP } from "../../theme/feed-page";
import { headerScale } from "../../theme/header-scale";
import { colors, feedHeader, fonts } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/**
 * "Header left = existing card left + 8", the handoff's rule for anything
 * above the card. The card's left is `GUTTER`.
 */
const CARD_EDGE_INSET = 8;
const EDGE = GUTTER + CARD_EDGE_INSET;

// ─── Type ────────────────────────────────────────────────────────────
const PLACE_SIZE = 16;
/** Wide enough to lay out any place line on one line, to learn its width. */
const MEASURE_WIDTH = 1000;
const FIGURE_SIZE = 26;
const FIGURE_MIN_SCALE = 0.75;
const LABEL_SIZE = 13;
const LABEL_MIN_SCALE = 0.8;
/**
 * Between two figures: this much, a hairline, then this much.
 *
 * The sizes were set against the feed's real cards (2026-11-24, all 17
 * communities and 7 cities, laid out with the system fonts at every shipping
 * width). At 26 / 13 across this block's width, 6 of 24 rows give up a
 * little size and one gives up more — Apremont's "Top 30–63%", to 86%.
 */
const CELL_BEFORE_RULE = 6;
const CELL_AFTER_RULE = 10;

// ─── Map control B (handoff §4) ──────────────────────────────────────
const MAP_WIDTH = 64;
const MAP_HEIGHT = 30;
const MAP_RADIUS = 15;
/**
 * Smaller than the line beside it (owner, 2026-11-26: 「感觉map按键太突兀了」
 * — phase404.6 had made the two one size).
 */
const MAP_LABEL_SIZE = 13;
/** Pin → "Map". */
const MAP_GAP = 5;
const MAP_PAD = 10;
/** What the pill no longer covers of the row, given back to the finger. */
const MAP_SLOP = (PLACE_ROW - MAP_HEIGHT) / 2;
/** Place line → Map. */
const PLACE_MAP_GAP = 12;

// ─── A place's page: the header (phase404.9) ─────────────────────────
const HEADER_NAME_SIZE = 18;
const HEADER_SUB_SIZE = 12;
/** A long place name gives up size before letters; it is alone on its line. */
const HEADER_MIN_SCALE = 0.8;
const BACK_ARM = 9;
const BACK_STROKE = 2;

// ─── The pin (handoff §4: outlined; 14 tall since phase404.11) ───────
//
// Composed from `View`s: the app bundles no SVG renderer and the icon-font
// subset carries no pin. ONE box — a square with three corners rounded and
// the fourth left sharp, rotated 45° so the sharp corner points down. Sized
// by the whole icon (owner, 2026-09-07: 「Map icon is too big」), so the head
// is derived from it and the stroke comes down with it.
const PIN_SIZE = 14;
const PIN_TIP_RATIO = 1.207;
const PIN_HEAD = PIN_SIZE / PIN_TIP_RATIO;
const PIN_STROKE = 1.4;
const PIN_DOT = 3;

/** Below 390 the 44pt place row scales under the touch floor; this gives it back. */
const TOUCH_SLOP = 4;

type BlockStyles = ReturnType<typeof sheet>;

interface PlaceBlockProps {
	model: PlaceBlockModel;
	/** The figures row. False on a screen with room for the place row only. */
	facts: boolean;
	/** Open the map on the card's place. Absent → no Map button at all. */
	onOpenMap?: () => void;
	/**
	 * On a place's own page (phase404.9, option 1 of `/demos/feed-focus-v3`):
	 * the row is the page's header — a round way back, the place and what the
	 * page holds ("Suwanee" over "Communities"), Map — and the per-card place
	 * line is not drawn: every card on the page is in that place. One row at
	 * the place row's height, so the page is laid out exactly as the feed is.
	 */
	header?: { title: string; subtitle: string; onBack: () => void } | undefined;
	/** Open the Explore page on a figure's part. Absent → figures are text. */
	onOpenCell?: (cell: GlanceCell) => void;
}

export function PlaceBlock({
	model,
	facts,
	onOpenMap,
	onOpenCell,
	header,
}: PlaceBlockProps) {
	const { width } = useWindowDimensions();
	const k = headerScale(width);
	const styles = useMemo(() => sheet(k), [k]);

	// What the row is wide and what Map takes of it, so the line knows its room.
	const [rowWidth, setRowWidth] = useState(0);
	const [mapWidth, setMapWidth] = useState(0);
	const mapRoom =
		onOpenMap === undefined
			? 0
			: (mapWidth || MAP_WIDTH * k) + PLACE_MAP_GAP * k;

	return (
		<View style={styles.wrap}>
			<View
				style={styles.placeRow}
				onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
			>
				{header !== undefined ? (
					<>
						<Pressable
							onPress={header.onBack}
							accessibilityRole="button"
							accessibilityLabel="Back"
							hitSlop={{
								top: MAP_SLOP + TOUCH_SLOP,
								bottom: MAP_SLOP + TOUCH_SLOP,
								left: EDGE * k,
								right: MAP_SLOP,
							}}
							style={({ pressed }) => [
								styles.backDisc,
								pressed && styles.mapPressed,
							]}
						>
							<View style={styles.backArm} />
						</Pressable>
						<View
							style={styles.headerTitle}
							pointerEvents="none"
							accessible
							accessibilityRole="header"
							accessibilityLabel={`${header.title}, ${header.subtitle}`}
						>
							<Text
								style={styles.headerName}
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={HEADER_MIN_SCALE}
							>
								{header.title}
							</Text>
							<Text style={styles.headerSub} numberOfLines={1}>
								{header.subtitle}
							</Text>
						</View>
						<View style={styles.fill} />
					</>
				) : (
					<View
						style={styles.placeSlot}
						accessible={model.lead !== ""}
						accessibilityLabel={placeAccessibilityLabel(model)}
					>
						<PlaceLine
							model={model}
							styles={styles}
							room={rowWidth - mapRoom}
						/>
					</View>
				)}

				{onOpenMap !== undefined && (
					<Pressable
						onPress={onOpenMap}
						onLayout={(e) => setMapWidth(e.nativeEvent.layout.width)}
						accessible
						accessibilityRole="button"
						accessibilityLabel={mapAccessibilityLabel(model)}
						hitSlop={{
							top: MAP_SLOP + TOUCH_SLOP,
							bottom: MAP_SLOP + TOUCH_SLOP,
							left: MAP_SLOP,
						}}
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

			{facts && (
				<View style={styles.factsRow}>
					{model.cells.map((cell, i) =>
						onOpenCell !== undefined ? (
							<Pressable
								key={cell.label}
								onPress={() => onOpenCell(cell)}
								accessibilityRole="button"
								accessibilityLabel={cellAccessibilityLabel(cell)}
								style={({ pressed }) => [
									styles.cell,
									i > 0 && styles.cellAfter,
									pressed && styles.dim,
								]}
							>
								<Figure cell={cell} styles={styles} />
							</Pressable>
						) : (
							<View
								key={cell.label}
								style={[styles.cell, i > 0 && styles.cellAfter]}
								accessible
								accessibilityLabel={cellAccessibilityLabel(cell)}
							>
								<Figure cell={cell} styles={styles} />
							</View>
						),
					)}
				</View>
			)}
		</View>
	);
}

/** A figure over what it is a figure of. */
function Figure({ cell, styles }: { cell: GlanceCell; styles: BlockStyles }) {
	// A letter is centred over its label; a number keeps the column's left edge.
	const centred = isLetterFigure(cell.value) && styles.centred;
	return (
		<>
			<Text
				style={[styles.figure, centred]}
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={FIGURE_MIN_SCALE}
			>
				{cell.value}
			</Text>
			<Text
				style={[styles.label, centred]}
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={LABEL_MIN_SCALE}
			>
				{cell.label}
			</Text>
		</>
	);
}

/**
 * `Alpharetta, GA · Fulton County`, at `PLACE_SIZE` whatever is beside it.
 * The second half is shown whole or not at all: both halves are measured
 * off-screen at their own widths, and the second is drawn only when the two
 * fit the room the row has for the line. Nothing is laid out in its place
 * when it is not, so Map sits right after whatever the line says.
 */
function PlaceLine({
	model,
	styles,
	room,
}: {
	model: PlaceBlockModel;
	styles: BlockStyles;
	/** The width the row has for the line, Map and its gap taken off. */
	room: number;
}) {
	const rest = model.rest === "" ? "" : ` · ${model.rest}`;
	const [leadWidth, setLeadWidth] = useState(0);
	const [restWidth, setRestWidth] = useState(0);
	const fits =
		rest !== "" &&
		leadWidth > 0 &&
		restWidth > 0 &&
		leadWidth + restWidth <= room + 0.5;
	return (
		<View style={styles.line}>
			<Text style={[styles.place, styles.placeLead]} numberOfLines={1}>
				{model.lead}
			</Text>
			{fits && (
				<Text style={styles.place} numberOfLines={1}>
					{rest}
				</Text>
			)}
			<View style={styles.measure} pointerEvents="none">
				<Text
					style={[styles.place, styles.placeLeadWeight]}
					numberOfLines={1}
					onLayout={(e) => setLeadWidth(e.nativeEvent.layout.width)}
				>
					{model.lead}
				</Text>
				<Text
					style={styles.place}
					numberOfLines={1}
					onLayout={(e) => setRestWidth(e.nativeEvent.layout.width)}
				>
					{rest}
				</Text>
			</View>
		</View>
	);
}

/** The block's sheet at one scale. Memoised by the component. */
function sheet(k: number) {
	return StyleSheet.create({
		/**
		 * ── Why this needs a z-index (owner on device, 2026-08-31) ────────────
		 *
		 * `SwipeStack`'s `stageClip` is an OPAQUE paper band 120pt ABOVE the
		 * stage, and no ancestor clips it. It carries `pointerEvents="none"`, so
		 * it paints over anything up here while leaving the touch targets
		 * working: "看不到卡片上方的东西 但是点击空白居然可以弹窗". Every header
		 * above the stage has out-ranked it at 100, and this block is the
		 * header's successor.
		 *
		 * `backgroundColor` is the page's own paper: no panel, border or shadow.
		 */
		wrap: {
			zIndex: 100,
			paddingHorizontal: EDGE * k,
			backgroundColor: colors.bg,
		},
		placeRow: {
			minHeight: PLACE_ROW * k,
			flexDirection: "row",
			alignItems: "center",
		},
		/**
		 * The line's box: as wide as what it says and no wider, so Map follows
		 * the words (phase404.12; owner, 2026-11-27: 「把map放到title后面」) —
		 * it used to fill the row and push Map to the far edge.
		 */
		placeSlot: {
			flexShrink: 1,
			minWidth: 0,
			minHeight: PLACE_ROW * k,
			flexDirection: "row",
			alignItems: "center",
		},
		/** A place's page: what keeps Map at the far edge of its header. */
		fill: { flex: 1 },
		/** A place's page: the way back, in the Map pill's material and height. */
		backDisc: {
			width: MAP_HEIGHT * k,
			minHeight: MAP_HEIGHT * k,
			borderRadius: MAP_RADIUS * k,
			flexShrink: 0,
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: feedHeader.mapFill,
		},
		/** A chevron from two borders, pointing left; nudged to sit centred. */
		backArm: {
			width: BACK_ARM * k,
			height: BACK_ARM * k,
			marginLeft: (BACK_ARM / 3) * k,
			borderLeftWidth: BACK_STROKE * k,
			borderBottomWidth: BACK_STROKE * k,
			borderColor: feedHeader.accent,
			transform: [{ rotate: "45deg" }],
		},
		/**
		 * Centred on the SCREEN, not between the two controls — the disc is
		 * narrower than Map — so it lies over the row and keeps Map's width clear
		 * on both sides.
		 */
		headerTitle: {
			position: "absolute",
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			paddingHorizontal: (MAP_WIDTH + PLACE_MAP_GAP) * k,
			alignItems: "center",
			justifyContent: "center",
		},
		headerName: {
			fontFamily: fonts.display,
			fontSize: HEADER_NAME_SIZE * k,
			fontWeight: "600",
			color: feedHeader.title,
		},
		headerSub: {
			fontFamily: fonts.ui,
			fontSize: HEADER_SUB_SIZE * k,
			fontWeight: "400",
			color: feedHeader.context,
		},
		/** Pressed feedback for the text controls. The Map pill darkens
		 * instead — a filled control must not fade. */
		dim: { opacity: 0.6 },
		/** The place line: its two halves side by side, not one run of text. */
		line: {
			flexShrink: 1,
			minWidth: 0,
			flexDirection: "row",
			alignItems: "center",
		},
		place: {
			fontFamily: fonts.ui,
			fontSize: PLACE_SIZE * k,
			fontWeight: "400",
			color: feedHeader.context,
		},
		placeLead: { flexShrink: 1, fontWeight: "600", color: feedHeader.title },
		/** The lead's weight alone, for measuring it where nothing can shrink it. */
		placeLeadWeight: { fontWeight: "600" },
		/** Off the row: where each half is laid out at its own width. */
		measure: {
			position: "absolute",
			left: 0,
			top: 0,
			width: MEASURE_WIDTH * k,
			flexDirection: "row",
			alignItems: "flex-start",
			opacity: 0,
		},

		/** `minWidth` rather than `width`, so the pill widens for a scaled-up
		 * label instead of clipping it. */
		map: {
			minWidth: MAP_WIDTH * k,
			minHeight: MAP_HEIGHT * k,
			marginLeft: PLACE_MAP_GAP * k,
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

		factsRow: {
			minHeight: FACTS_ROW * k,
			marginTop: ROW_GAP * k,
			flexDirection: "row",
		},
		/**
		 * Each figure takes its own width plus an equal share of what is left,
		 * so a long one ("Top 32–65%") is given room before a short one is.
		 */
		cell: {
			flexGrow: 1,
			flexShrink: 1,
			flexBasis: "auto",
			minWidth: 0,
			justifyContent: "center",
		},
		cellAfter: {
			marginLeft: CELL_BEFORE_RULE * k,
			paddingLeft: CELL_AFTER_RULE * k,
			borderLeftWidth: StyleSheet.hairlineWidth,
			borderLeftColor: colors.border,
		},
		/**
		 * The Explore tiles' figure face (`ExploreParts`), so a number here and
		 * the same number on its page read as one.
		 *
		 * No `lineHeight` on either line: iOS clips auto-shrunk text against an
		 * explicit one (found on the header's title, phase183.3). The row's
		 * `minHeight` holds the block's height instead.
		 */
		figure: {
			...textStyles.title2,
			fontSize: FIGURE_SIZE * k,
			color: feedHeader.title,
			fontVariant: ["tabular-nums"],
		},
		label: {
			fontFamily: fonts.ui,
			fontSize: LABEL_SIZE * k,
			fontWeight: "400",
			color: feedHeader.context,
		},
		centred: { textAlign: "center" },
	});
}
