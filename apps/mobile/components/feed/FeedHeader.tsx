/**
 * The feed's above-card header (phase183) — the owner's implementation
 * handoff, `percho-header-redlines.svg`, map control **B**.
 *
 * Three rows in the area above the card, and nothing else moves:
 *
 *     Atlanta metro › Canton  ▾        ← context   18 high, 13/18
 *                                        gap 4
 *     River Green ›            [◎ Map] ← main     44 high, serif 30
 *                                        gap 4
 *     HOME TOUR                        ← type     16 high, 11/16 caps
 *
 *     86 total, then 16 of paper, then the card (`CARD_INSET.top`).
 *
 * ── What this replaces, and what it costs ───────────────────────────────────
 *
 * `PlaceHeader` (phase181–182.1): the "Percho" wordmark over one
 * auto-shrinking place line that ended in the communities count. The handoff
 * removes both by name — "Do not introduce a Percho wordmark, community
 * count, floating overlay on the video, or another map-button variant" — and
 * spends the room on the card's own place, a navigable title, and the Map
 * control the feed has never had.
 *
 * The header is 86 tall where the old one was 78 (4 padding + a 44 wordmark
 * row + a 30 line), so the page above the card grew by 8pt. Every screen in
 * the shipping lineup still draws the film uncropped; the iPhone SE, whose
 * stage was already the binding constraint, pays for it in side crop — see
 * `theme/card-aspect.test.ts`, which measures the amount.
 *
 * ── The one deliberate departure from the handoff ────────────────────────────
 *
 * The handoff says the context row is "explanatory text, not a feed filter".
 * It also replaces the only control that opened `ScopeSheet` anywhere in the
 * feed (the old place line — `ExhaustedCard`'s "Adjust my scope" is the only
 * other entry, and it appears solely on a dry deck). Rather than ship a build
 * with no way to change the scope, the context row keeps that job: it carries
 * a ▾ and opens the same sheet, exactly as the line it replaces did. Removing
 * it is one prop and one glyph if the owner wants the handoff read literally.
 *
 * The row is NOT the control on a trade-off ("Your preferences" is not a
 * place) or on a home with no resolvable location (the row is empty).
 *
 * phase183.1: the ▾ it carried is gone. The owner's demo draws that row as
 * plain grey text and 「you should follow this」 settles it, so the row keeps
 * the job and loses the marker — the same tap the header line has had since
 * phase140, now with nothing advertising it.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FeedHeaderModel } from "../../lib/feed/feed-header";
import {
	mapAccessibilityLabel,
	titleAccessibilityLabel,
} from "../../lib/feed/feed-header";
import { DM_SERIF_FONT } from "../../theme/fonts";
import { colors, feedHeader, fonts } from "../../theme/tokens";

// ─── Geometry (handoff §2, logical units) ────────────────────────────
/**
 * Row heights and the two 4pt gaps between them. They sum to 86, which is the
 * page's budget above the card — `theme/feed-header.test.ts` reads these five
 * declarations and `theme/card-aspect.test.ts` spends the total.
 */
const CONTEXT_ROW = 18;
const ROW_GAP = 4;
const MAIN_ROW = 44;
const TYPE_ROW = 16;

/**
 * "Header left = existing card left + 8". The card's own margin is `GUTTER`
 * (16) in `app/(tabs)/feed.tsx`, so the header sits 24 from the screen edge —
 * asserted against that constant rather than repeated by hand.
 */
const CARD_EDGE_INSET = 8;
const EDGE = 16 + CARD_EDGE_INSET;

/** Title → Map. The handoff's floor, and the width the title gives up first. */
const TITLE_MAP_GAP = 12;

// ─── Map control B ──────────────────────────────────────────────────
const MAP_WIDTH = 84;
const MAP_HEIGHT = 44;
const MAP_RADIUS = 22;
/** Pin → "Map". */
const MAP_GAP = 6;

// ─── The pin (handoff §4: outlined, 18 wide, 1.75 stroke) ───────────
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
// outline, so there is no seam where a head meets a tail. The first pass drew
// a ring plus two legs and had a visible notch between them at this size.
//
// `borderBottomRightRadius: 0` is the sharp corner and a clockwise 45° is
// what puts it at the bottom (checked by rendering the same box model before
// writing it). The tip hangs √½ of the head's width below its centre, so the
// whole pin is 1.207 × the head.
const PIN_HEAD = 18;
const PIN_STROKE = 1.75;
const PIN_HEIGHT = PIN_HEAD * 1.207;
const PIN_DOT = 4.5;

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
						style={({ pressed }) => [styles.titleSlot, pressed && styles.dim]}
					>
						<Title text={model.title} />
						<ChevronIcon />
					</Pressable>
				) : (
					<View
						style={styles.titleSlot}
						accessible
						accessibilityLabel={titleAccessibilityLabel(model)}
					>
						<Title text={model.title} />
					</View>
				)}

				{onOpenMap !== undefined && (
					<Pressable
						onPress={onOpenMap}
						accessible
						accessibilityRole="button"
						accessibilityLabel={mapAccessibilityLabel(model)}
						style={({ pressed }) => [styles.map, pressed && styles.mapPressed]}
					>
						<PinIcon />
						<Text style={styles.mapLabel} numberOfLines={1}>
							Map
						</Text>
					</Pressable>
				)}
			</View>

			<View style={styles.typeRow}>
				{model.typeLabel !== null && (
					<Text style={styles.typeLabel} numberOfLines={1}>
						{model.typeLabel}
					</Text>
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
 * ── Why it truncates instead of shrinking (phase183.1) ──────────────────────
 *
 * The first pass carried `adjustsFontSizeToFit` at `minimumFontScale` 0.7,
 * because the owner had asked for exactly that on the LINE this replaced
 * (2026-09-06: 「If too big to fit in, just use smaller size」). Two reasons
 * it is gone:
 *
 *   · That line had to hold metro › city › community AND a count. This holds
 *     ONE place name at 36pt, and the common ones fit with room to spare —
 *     "River Green" needs about 200 of the 228 the row gives it.
 *   · Auto-shrink inside a `flexShrink: 1` row is measured twice on iOS: the
 *     row shrinks the text box, then the text shrinks to fit the box it was
 *     just handed. A title with room to spare could still come out near the
 *     0.7 floor, which is the likeliest reason the owner read the size as
 *     wrong against his own demo.
 *
 * So the size is fixed at the demo's 36 and an end ellipsis is what a
 * genuinely long name gets — the handoff's own rule.
 */
function Title({ text }: { text: string }) {
	return (
		<Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
			{text}
		</Text>
	);
}

/** `›` — two borders of a square, rotated. Only drawn for a real target. */
function ChevronIcon() {
	return (
		<View style={styles.chevronBox}>
			<View style={styles.chevronArm} />
		</View>
	);
}

function PinIcon() {
	return (
		<View style={styles.pinBox}>
			<View style={styles.pinDrop} />
			<View style={styles.pinDot} />
		</View>
	);
}

const styles = StyleSheet.create({
	/**
	 * ── Why this needs a z-index (owner on device, 2026-08-31) ──────────────
	 *
	 * `SwipeStack`'s `stageClip` is an OPAQUE paper band (`colors.bg`) 120pt
	 * ABOVE the stage, and no ancestor clips it — it hides the behind-card's
	 * top edge and its elevation glow. It carries `pointerEvents="none"`, so
	 * it paints over anything up here while leaving the touch target working:
	 * "看不到卡片上方的东西 但是点击空白居然可以弹窗 community list". Anything
	 * the feed puts above the stage has to out-rank that band; 100 is the
	 * number every header up here has used since.
	 *
	 * `backgroundColor` is the screen canvas — the handoff keeps the header on
	 * the page's own paper, with no panel, border or shadow.
	 */
	wrap: {
		zIndex: 100,
		paddingHorizontal: EDGE,
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
	contextRow: { minHeight: CONTEXT_ROW, justifyContent: "center" },
	mainRow: {
		minHeight: MAIN_ROW,
		marginTop: ROW_GAP,
		flexDirection: "row",
		alignItems: "center",
	},
	typeRow: {
		minHeight: TYPE_ROW,
		marginTop: ROW_GAP,
		justifyContent: "center",
	},
	/** Pressed feedback for the two text controls. The Map pill darkens
	 * instead (handoff §4) — a filled control must not fade. */
	dim: { opacity: 0.6 },

	context: {
		fontFamily: fonts.ui,
		fontSize: 13,
		lineHeight: CONTEXT_ROW,
		fontWeight: "400",
		color: feedHeader.context,
	},
	/**
	 * The title's 44pt touch target — the main row's full height, and the
	 * flexible half of it. `minWidth: 0` is what lets the text shrink instead
	 * of pushing the Map button out.
	 */
	titleSlot: {
		flex: 1,
		minWidth: 0,
		height: MAIN_ROW,
		flexDirection: "row",
		alignItems: "center",
	},
	/**
	 * DM Serif Display 36/42 — the face this slot already wore (the wordmark's,
	 * and the place line's before it). The handoff asks for the app's existing
	 * serif display family at the closest supported weight, and this family
	 * ships one: 400.
	 *
	 * **36, not the handoff table's 30** (phase183.1). The markdown and the
	 * demo screens disagree, and the owner settled it: 「layout and size
	 * doesn't look right, attaching the demo, you should follow this」.
	 * Measured off that demo — which renders one pixel per point at 390 wide,
	 * so the Map pill in it comes out 86 × 44.5 — the title's CAP height is
	 * 25pt, and DM Serif's caps are 0.70 em. Hence 36. The same measurement
	 * puts the two small rows at 12-13 and 11, which is why nothing else in
	 * here moved.
	 */
	title: {
		flexShrink: 1,
		fontFamily: DM_SERIF_FONT,
		fontSize: 36,
		lineHeight: 42,
		color: feedHeader.title,
	},
	chevronBox: {
		width: CHEVRON_BOX,
		height: CHEVRON_BOX,
		marginLeft: CHEVRON_GAP,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	chevronArm: {
		width: CHEVRON_ARM,
		height: CHEVRON_ARM,
		borderTopWidth: CHEVRON_STROKE,
		borderRightWidth: CHEVRON_STROKE,
		borderColor: feedHeader.context,
		transform: [{ rotate: "45deg" }],
	},

	/**
	 * Map control B. 84 × 44 at radius 22, the pale sage fill, no border and
	 * no shadow. `minWidth` rather than `width` so the pill widens for a
	 * scaled-up label instead of clipping it; the 44 touch height is a floor.
	 */
	map: {
		minWidth: MAP_WIDTH,
		minHeight: MAP_HEIGHT,
		marginLeft: TITLE_MAP_GAP,
		flexShrink: 0,
		paddingHorizontal: 12,
		borderRadius: MAP_RADIUS,
		backgroundColor: feedHeader.mapFill,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: MAP_GAP,
	},
	mapPressed: { backgroundColor: feedHeader.mapPressed },
	mapLabel: {
		fontFamily: fonts.ui,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "600",
		color: feedHeader.accent,
	},

	typeLabel: {
		fontFamily: fonts.ui,
		fontSize: 11,
		lineHeight: TYPE_ROW,
		fontWeight: "600",
		letterSpacing: 1,
		color: feedHeader.accent,
	},

	// ─── Pin art (see the block above the constants) ─────────────────
	pinBox: { width: PIN_HEAD, height: PIN_HEIGHT },
	/** The teardrop: one outlined box, three corners round, rotated. */
	pinDrop: {
		position: "absolute",
		left: 0,
		top: 0,
		width: PIN_HEAD,
		height: PIN_HEAD,
		borderWidth: PIN_STROKE,
		borderColor: feedHeader.accent,
		borderTopLeftRadius: PIN_HEAD / 2,
		borderTopRightRadius: PIN_HEAD / 2,
		borderBottomLeftRadius: PIN_HEAD / 2,
		borderBottomRightRadius: 0,
		transform: [{ rotate: "45deg" }],
	},
	/** The hole, on the head's centre — which the rotation leaves put. */
	pinDot: {
		position: "absolute",
		left: (PIN_HEAD - PIN_DOT) / 2,
		top: (PIN_HEAD - PIN_DOT) / 2,
		width: PIN_DOT,
		height: PIN_DOT,
		borderRadius: PIN_DOT / 2,
		backgroundColor: feedHeader.accent,
	},
});
