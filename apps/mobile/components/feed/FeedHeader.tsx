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

// ─── The pin (handoff §4: outlined, 18 × 18, 1.75 stroke) ───────────
//
// Composed from `View`s at a real pin's geometry — the technique
// `CommunityFace`'s place pill and bookmark already use. The app bundles no
// SVG renderer (`react-native-svg` is not a dependency, and adding one is a
// CLAUDE.md §8 conversation), and the 14-glyph icon-font subset carries no
// pin: `components/cards/redline/icon-font.ts`.
//
// A ring for the head, a dot in it, and two capped bars for the tail. The
// bars lean 20° off vertical, not 45°: from the apex a 45° arm never reaches
// a ring this size (the tangent is at 29°), so a rotated-square "V" would
// stick out past the head instead of meeting it. `PIN_ARM` is the distance
// from the apex to the point where that lean meets the ring's stroke
// centreline — shorter and it floats, longer and it crosses into the head.
const PIN = 18;
const PIN_STROKE = 1.75;
const PIN_RING = 13;
const PIN_DOT = 4;
const PIN_ARM = 6.8;
const PIN_ARM_TILT = 20;
const PIN_ARM_DX = (PIN_ARM * Math.sin((PIN_ARM_TILT * Math.PI) / 180)) / 2;
const PIN_ARM_DY = (PIN_ARM * Math.cos((PIN_ARM_TILT * Math.PI) / 180)) / 2;

/** Title chevron — 12 × 12, 1.5 stroke (handoff §3). */
const CHEVRON_BOX = 12;
const CHEVRON_ARM = 7;
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
			{scopeControl ? <Text style={styles.scopeCaret}>{"  ▾"}</Text> : null}
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
 * It gives up SIZE before it gives up letters. The handoff's rule is a single
 * line with an end ellipsis, and that is still the floor here — but the owner
 * asked for the other order one day earlier, on the line this replaced
 * (2026-09-06: 「If too big to fit in, just use smaller size」), and he is
 * right about which is worse: "Peachtree Corner…" is a name the buyer has to
 * guess at, where the same name a few points smaller is just smaller. So 30
 * is a ceiling, 0.7 of it (21) is the floor, and the ellipsis is what happens
 * below the floor — a name that long is a shorter string's problem, not a
 * smaller type size's.
 */
function Title({ text }: { text: string }) {
	return (
		<Text
			style={styles.title}
			numberOfLines={1}
			adjustsFontSizeToFit
			minimumFontScale={0.7}
			ellipsizeMode="tail"
		>
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
			<View style={[styles.pinArm, styles.pinArmLeft]} />
			<View style={[styles.pinArm, styles.pinArmRight]} />
			<View style={styles.pinRing} />
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
	/** The ▾ that says the row above the title is a control. */
	scopeCaret: { fontFamily: fonts.ui, fontSize: 10, color: feedHeader.context },

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
	 * DM Serif Display 30/36 — the face this slot already wore (the wordmark's,
	 * and the place line's before it). The handoff asks for the app's existing
	 * serif display family at the closest supported weight, and this family
	 * ships one: 400.
	 */
	title: {
		flexShrink: 1,
		fontFamily: DM_SERIF_FONT,
		fontSize: 30,
		lineHeight: 36,
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
	pinBox: { width: PIN, height: PIN },
	pinRing: {
		position: "absolute",
		left: (PIN - PIN_RING) / 2,
		top: 0,
		width: PIN_RING,
		height: PIN_RING,
		borderRadius: PIN_RING / 2,
		borderWidth: PIN_STROKE,
		borderColor: feedHeader.accent,
	},
	pinDot: {
		position: "absolute",
		left: (PIN - PIN_DOT) / 2,
		top: PIN_RING / 2 - PIN_DOT / 2,
		width: PIN_DOT,
		height: PIN_DOT,
		borderRadius: PIN_DOT / 2,
		backgroundColor: feedHeader.accent,
	},
	/** One tail stroke, centred on its own midpoint so `rotate` lands it. */
	pinArm: {
		position: "absolute",
		width: PIN_STROKE,
		height: PIN_ARM,
		borderRadius: PIN_STROKE / 2,
		top: PIN - PIN_ARM_DY - PIN_ARM / 2,
		backgroundColor: feedHeader.accent,
	},
	pinArmLeft: {
		left: PIN / 2 - PIN_ARM_DX - PIN_STROKE / 2,
		transform: [{ rotate: `-${PIN_ARM_TILT}deg` }],
	},
	pinArmRight: {
		left: PIN / 2 + PIN_ARM_DX - PIN_STROKE / 2,
		transform: [{ rotate: `${PIN_ARM_TILT}deg` }],
	},
});
