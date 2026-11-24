/**
 * The block above the feed card (phase378, moved up in phase379): where the
 * place is, the Map button, and up to three figures the film cannot show.
 *
 *     Alpharetta · Fulton County                [◎ Map]   ← place   32 high
 *     $747K            Top 1–7%         25 mi             ← figures 40 high
 *     ZIP 30005 homes  schools nearby   north of Atlanta
 *
 *     10 above, 32, 4, 40 — 86, the header's own height; then the card.
 *
 * ── What it replaced ────────────────────────────────────────────────────────
 *
 * `FeedHeader` (phase183): a breadcrumb over the card's name at 36pt. Owner
 * 2026-11-23: "感觉还是以填充为主 信息本身也和卡片有重合" — the name was on the
 * card already and its chevron opened the page Explore opens. So the name is
 * said once, on the card, and this says what the card does not.
 *
 * He picked "方案2" off `/demos/feed-above-card-v1` first: this block UNDER the
 * card and the film at the top of the screen (phase378). The next day:
 * "numbers above the card" — option 1 of the same page, "same spot, same
 * height; the card does not move". It is 86 at 390 exactly as the header was
 * (`theme/card-aspect.test.ts` spends it), so the card sits where it always
 * has on every phone and the SE's crop is unchanged.
 *
 * ── Carried over from the header, on purpose ────────────────────────────────
 *
 *   · **Map control B**, at the place line's height: the pale sage fill, an
 *     outlined pin and the word, no border and no shadow — 72 × 32 here
 *     rather than the handoff's 84 × 44, as option 1 drew it beside a 14pt
 *     line. `hitSlop` gives the touch target back its 44.
 *   · **Every number scales with the screen** (`theme/header-scale.ts`), so
 *     the proportion approved at 390 holds on the mini and the Max. That is
 *     why the sizes cannot live in a module-level `StyleSheet`: `sheet` is a
 *     factory of one, memoised per scale.
 *   · **Text shrinks, it is not cut** (owner, 2026-09-07: 「Don't cut the
 *     community name if it is too long, use smaller size instead」). The same
 *     rule for a long place line or a long label.
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
import { useMemo } from "react";
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
	mapAccessibilityLabel,
	placeAccessibilityLabel,
} from "../../lib/feed/place-block";
import { headerScale } from "../../theme/header-scale";
import { colors, feedHeader, fonts } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

// ─── Geometry (logical units at 390) ─────────────────────────────────
/**
 * The rows and the room above them: 10 + 32 + 4 + 40 = 86, the header's
 * total. `theme/place-block.test.ts` pins these and `theme/card-aspect.test.ts`
 * spends them, per device, through `headerScale`.
 */
const PAD_TOP = 10;
const PLACE_ROW = 32;
const ROW_GAP = 4;
const FACTS_ROW = 40;

/**
 * Card edge + 8, as the header was. The card's own margin is `GUTTER` (16) in
 * `app/(tabs)/feed.tsx` — asserted against that constant rather than
 * repeated by hand.
 */
const CARD_EDGE_INSET = 8;
const EDGE = 16 + CARD_EDGE_INSET;

// ─── Type ────────────────────────────────────────────────────────────
const PLACE_SIZE = 14;
/** The floor a long line may shrink to before it is cut. */
const PLACE_MIN_SCALE = 0.8;
const FIGURE_SIZE = 22;
const FIGURE_MIN_SCALE = 0.75;
const LABEL_SIZE = 12;
const LABEL_MIN_SCALE = 0.8;
/**
 * Between two figures: this much, a hairline, then this much.
 *
 * The sizes were set against the feed's real cards (2026-11-23, all 17
 * communities and 7 cities, laid out with the system fonts at every shipping
 * width). At this block's width one row of 24 shrinks, to 92%
 * ("Peachtree Corners homes").
 */
const CELL_BEFORE_RULE = 6;
const CELL_AFTER_RULE = 10;

// ─── Map control B, at the place line's height ───────────────────────
const MAP_WIDTH = 72;
const MAP_HEIGHT = 32;
const MAP_RADIUS = 16;
const MAP_LABEL_SIZE = 13;
/** Pin → "Map". */
const MAP_GAP = 5;
const MAP_PAD = 10;
/** Place line → Map. */
const PLACE_MAP_GAP = 12;

// ─── The pin (outlined teardrop) ─────────────────────────────────────
//
// Composed from `View`s: the app bundles no SVG renderer and the icon-font
// subset carries no pin. ONE box — a square with three corners rounded and
// the fourth left sharp, rotated 45° so the sharp corner points down. Sized
// by the whole icon (owner, 2026-09-07: 「Map icon is too big」), so the head
// is derived from it and the stroke comes down with it.
const PIN_SIZE = 15;
const PIN_TIP_RATIO = 1.207;
const PIN_HEAD = PIN_SIZE / PIN_TIP_RATIO;
const PIN_STROKE = 1.5;
const PIN_DOT = 3.25;

/** The place line's chevron, when the line opens a home's community. */
const CHEVRON_BOX = 12;
const CHEVRON_ARM = 7;
const CHEVRON_STROKE = 1.5;
const CHEVRON_GAP = 6;

/**
 * Touch targets back to 44 without moving anything: the place row reaches 8
 * up into the room above it and across the 4 between the rows; a figure
 * reaches 4 down toward the card.
 */
const PLACE_SLOP = { top: 8, bottom: 4 };
const CELL_SLOP = { bottom: 4 };

type BlockStyles = ReturnType<typeof sheet>;

interface PlaceBlockProps {
	model: PlaceBlockModel;
	/** Open a home's community. Absent → the line is text. */
	onOpenPlace?: () => void;
	/** Open the map on the card's place. Absent → no Map button at all. */
	onOpenMap?: () => void;
	/** Open the Explore page on a figure's part. Absent → figures are text. */
	onOpenCell?: (cell: GlanceCell) => void;
}

export function PlaceBlock({
	model,
	onOpenPlace,
	onOpenMap,
	onOpenCell,
}: PlaceBlockProps) {
	const { width } = useWindowDimensions();
	const k = headerScale(width);
	const styles = useMemo(() => sheet(k), [k]);

	const line = <PlaceLine model={model} styles={styles} />;

	return (
		<View style={styles.wrap}>
			<View style={styles.placeRow}>
				{onOpenPlace !== undefined ? (
					<Pressable
						onPress={onOpenPlace}
						accessibilityRole="button"
						accessibilityLabel={placeAccessibilityLabel(model)}
						hitSlop={PLACE_SLOP}
						style={({ pressed }) => [styles.placeSlot, pressed && styles.dim]}
					>
						{line}
						<View style={styles.chevronBox}>
							<View style={styles.chevronArm} />
						</View>
					</Pressable>
				) : (
					<View
						style={styles.placeSlot}
						accessible={model.lead !== ""}
						accessibilityLabel={placeAccessibilityLabel(model)}
					>
						{line}
					</View>
				)}

				{onOpenMap !== undefined && (
					<Pressable
						onPress={onOpenMap}
						accessible
						accessibilityRole="button"
						accessibilityLabel={mapAccessibilityLabel(model)}
						hitSlop={PLACE_SLOP}
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

			<View style={styles.factsRow}>
				{model.cells.map((cell, i) =>
					onOpenCell !== undefined ? (
						<Pressable
							key={cell.label}
							onPress={() => onOpenCell(cell)}
							accessibilityRole="button"
							accessibilityLabel={cellAccessibilityLabel(cell)}
							hitSlop={CELL_SLOP}
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
		</View>
	);
}

/** A figure over what it is a figure of. */
function Figure({ cell, styles }: { cell: GlanceCell; styles: BlockStyles }) {
	return (
		<>
			<Text
				style={styles.figure}
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={FIGURE_MIN_SCALE}
			>
				{cell.value}
			</Text>
			<Text
				style={styles.label}
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
 * `Alpharetta · Fulton County` — one Text, so a long line scales as a whole
 * rather than its two halves separately.
 */
function PlaceLine({
	model,
	styles,
}: {
	model: PlaceBlockModel;
	styles: BlockStyles;
}) {
	return (
		<Text
			style={styles.place}
			numberOfLines={1}
			adjustsFontSizeToFit
			minimumFontScale={PLACE_MIN_SCALE}
			ellipsizeMode="tail"
			accessible={false}
		>
			<Text style={styles.placeLead}>{model.lead}</Text>
			{model.rest !== "" && ` · ${model.rest}`}
		</Text>
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
			paddingTop: PAD_TOP * k,
			paddingHorizontal: EDGE * k,
			backgroundColor: colors.bg,
		},
		placeRow: {
			minHeight: PLACE_ROW * k,
			flexDirection: "row",
			alignItems: "center",
		},
		/** The flexible half of the row: the Map pill is laid out first. */
		placeSlot: {
			flex: 1,
			minWidth: 0,
			minHeight: PLACE_ROW * k,
			flexDirection: "row",
			alignItems: "center",
		},
		/** Pressed feedback for the text controls. The Map pill darkens
		 * instead — a filled control must not fade. */
		dim: { opacity: 0.6 },
		place: {
			flexShrink: 1,
			fontFamily: fonts.ui,
			fontSize: PLACE_SIZE * k,
			fontWeight: "400",
			color: feedHeader.context,
		},
		placeLead: { fontWeight: "600", color: feedHeader.title },
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
	});
}
