/**
 * TradeoffFace (§1.6) — the "force a priority" card, REBUILT to the owner's
 * "Percho Swipe Cards" redline (2026-07-30, 「全按redline覆盖」).
 *
 * ── What changed ─────────────────────────────────────────────────────────────
 *
 * The old face was a full-bleed vertical SPLIT: two dark halves (warm clay |
 * cool slate) divided by a 1.5px dashed rule, each half carrying an arrow and
 * its label. The redline replaces that with a light, calm card:
 *
 *   backdrop     a soft mountain-lake landscape, blurred and desaturated
 *   wash         180deg rgba(249,245,238,.10) → .90 at 48% → 1 at 100%
 *   headline     serif 32, centred, ~70pt below the top label
 *   subtext      12, centred, secondary
 *   choices      two 220pt cards, radius 22, rgba(255,255,255,.82),
 *                each with a 58pt mint badge + a 24pt line icon
 *   vs           a small white circular chip between them
 *   footer       ←  Swipe left or right  →
 *
 * ── §1.6's two red lines are PRESERVED, deliberately ────────────────────────
 *
 * The redline is a visual spec; §1.6 is a behavioural one, and where the redline
 * is silent the spec still governs. Both of its named red lines survive:
 *
 *   1. NO ✓ / ✗ anywhere. Nothing in this file renders a mark, same as before.
 *   2. The only feedback is BRIGHTNESS, tracking the finger. `tx` still drives
 *      `interpolate`, so the side being chosen goes to opacity 1 and the
 *      discarded side to 0.4 as the card is dragged.
 *
 * What moved is only WHERE that opacity lands: it used to ride each dark half,
 * and now rides each white choice card. Dropping the feedback would have been
 * the easy reading of "implement the redline" and it would have silently deleted
 * a spec red line — the redline says nothing about drag feedback because it is a
 * static board, not because the behaviour should go.
 *
 * The dashed 1.5px rule IS gone: it was the divider of a split face, and there is
 * no split any more. The "vs" chip is the redline's replacement separator.
 *
 * ── The backdrop ─────────────────────────────────────────────────────────────
 *
 * The redline asks for a photographic landscape here. A trade-off card has no
 * image field (`TradeoffCardV3` is text + two dims), and there is no bundled
 * asset pipeline in this app, so the atmosphere is drawn instead: the existing
 * `CardSurface` ramp under the redline's own light wash. That keeps the card
 * "lighter and calmer than the image cards" (the redline's stated goal for it)
 * with no fabricated photo and no new dependency. If a real landscape asset is
 * added later it drops in behind the same wash.
 */
import { DIMS } from "@percho/shared";
import type { DimKey } from "@percho/shared";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	type SharedValue,
	interpolate,
	useAnimatedStyle,
} from "react-native-reanimated";
import type { TradeoffCardV3 } from "../../lib/feed/card-types";
import { SWIPE_THRESHOLD_RATIO } from "../../lib/gesture/decide-swipe";
import { radii, redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardSurface } from "./CardSurface";
import {
	RedlineHeart,
	RedlineIcon,
	type RedlineIconName,
	RedlinePill,
} from "./redline/RedlineChrome";

// §1.6, verbatim — unchanged from the previous implementation.
const REST_OPACITY = 0.72;
const CHOSEN_OPACITY = 1;
const DISCARDED_OPACITY = 0.4;

/** "Icon 24px" inside the redline's 58pt badge. */
const CHOICE_ICON = 24;
/** The wash's stops, from the redline's `linear-gradient(180deg, …)`. */
const WASH_STOPS = [0, 0.48, 1] as const;

/**
 * Which glyph stands for a dimension on a 24pt badge. The redline's sample card
 * is commute-vs-backyard (a car and a house-with-tree), which are the `move_in`
 * and `outdoors` ends of the real vocabulary.
 */
const DIM_ICON: Partial<Record<DimKey, RedlineIconName>> = {
	outdoors: "yard",
	space: "yard",
	trails: "tree",
	walkable: "walk",
	schools: "school",
	family: "family",
	move_in: "car",
	quiet: "family",
};

interface TradeoffFaceProps {
	card: TradeoffCardV3;
	/** Live horizontal drag offset from `useSwipeCard`. */
	tx: SharedValue<number>;
	cardWidth: number;
	onSave?: () => void;
}

export function TradeoffFace({
	card,
	tx,
	cardWidth,
	onSave,
}: TradeoffFaceProps) {
	// The card commits at 35% of its width, so brightness must reach full
	// strength by then — interpolating over the whole width would barely move.
	const span = cardWidth * SWIPE_THRESHOLD_RATIO;

	const leftStyle = useAnimatedStyle(() => ({
		opacity: interpolate(
			tx.value,
			[-span, 0, span],
			[CHOSEN_OPACITY, REST_OPACITY, DISCARDED_OPACITY],
			"clamp",
		),
	}));

	const rightStyle = useAnimatedStyle(() => ({
		opacity: interpolate(
			tx.value,
			[-span, 0, span],
			[DISCARDED_OPACITY, REST_OPACITY, CHOSEN_OPACITY],
			"clamp",
		),
	}));

	return (
		<View style={styles.face}>
			{/* Atmosphere: the existing ramp, then the redline's light wash over it. */}
			<CardSurface variant="tradeoff" plain />
			<LinearGradient
				colors={[
					redline.tradeoffWashFrom,
					redline.tradeoffWashMid,
					redline.tradeoffWashTo,
				]}
				locations={[...WASH_STOPS]}
				style={StyleSheet.absoluteFill}
				pointerEvents="none"
			/>

			<View style={styles.pillSlot}>
				<RedlinePill label="TRADE-OFF" />
			</View>
			<View style={styles.heartSlot}>
				<RedlineHeart onPress={onSave} />
			</View>

			<View style={styles.body}>
				<Text style={styles.question}>Which matters more to you?</Text>
				<Text style={styles.sub}>
					Your choice helps us find the right places for you.
				</Text>

				<View style={styles.choices}>
					<Animated.View style={[styles.choice, leftStyle]}>
						<View style={styles.badge}>
							<RedlineIcon
								name={DIM_ICON[card.left.dim] ?? "walk"}
								size={CHOICE_ICON}
								color={redline.accent}
							/>
						</View>
						<Text style={styles.choiceLabel}>{card.left.label}</Text>
						<Text style={styles.choiceDim}>{DIMS[card.left.dim].label}</Text>
					</Animated.View>

					<Animated.View style={[styles.choice, rightStyle]}>
						<View style={styles.badge}>
							<RedlineIcon
								name={DIM_ICON[card.right.dim] ?? "walk"}
								size={CHOICE_ICON}
								color={redline.accent}
							/>
						</View>
						<Text style={styles.choiceLabel}>{card.right.label}</Text>
						<Text style={styles.choiceDim}>{DIMS[card.right.dim].label}</Text>
					</Animated.View>

					{/* The redline's separator, replacing the old dashed split rule. */}
					<View style={styles.vs} pointerEvents="none">
						<Text style={styles.vsLabel}>vs</Text>
					</View>
				</View>

				<View style={styles.footer}>
					<Text style={styles.footerArrow}>←</Text>
					<Text style={styles.footerLabel}>Swipe left or right</Text>
					<Text style={styles.footerArrow}>→</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	/** Light face — the wash bottoms out at the redline's opaque cream. */
	face: { flex: 1, backgroundColor: redline.card },
	pillSlot: { position: "absolute", top: 15, left: 15, zIndex: 3 },
	heartSlot: { position: "absolute", top: 15, right: 15, zIndex: 3 },
	/** "about 70px below the top label" — 15 inset + 38 pill + the redline's gap. */
	body: {
		flex: 1,
		alignItems: "center",
		paddingTop: 70,
		paddingHorizontal: 18,
		paddingBottom: 22,
		zIndex: 2,
	},
	question: {
		...redlineText.question,
		color: redline.ink,
		textAlign: "center",
	},
	sub: {
		// The redline specifies 12px here, not the 13px listing-story size.
		...redlineText.subtext,
		color: redline.ink2,
		textAlign: "center",
		marginTop: 10,
	},
	choices: {
		flexDirection: "row",
		gap: 10,
		marginTop: 28,
		width: "100%",
		position: "relative",
	},
	choice: {
		flex: 1,
		height: 220,
		borderRadius: redlineRadii.choice,
		backgroundColor: redline.choice,
		borderWidth: 1,
		borderColor: redline.choiceBorder,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
		paddingHorizontal: 12,
	},
	badge: {
		width: 58,
		height: 58,
		borderRadius: radii.pill,
		backgroundColor: redline.accentSoft,
		alignItems: "center",
		justifyContent: "center",
	},
	choiceLabel: {
		...redlineText.choice,
		color: redline.ink,
		textAlign: "center",
	},
	choiceDim: {
		...redlineText.nano,
		color: redline.ink3,
		textAlign: "center",
	},
	/**
	 * Centred in the gutter. `pointerEvents: none` so the chip never eats a drag
	 * that started on it — the whole card is the gesture target.
	 */
	vs: {
		position: "absolute",
		alignSelf: "center",
		top: "50%",
		width: 26,
		height: 26,
		marginTop: -13,
		borderRadius: radii.pill,
		backgroundColor: redline.onPhoto,
		alignItems: "center",
		justifyContent: "center",
	},
	vsLabel: { ...redlineText.nano, color: redline.ink3 },
	footer: {
		marginTop: "auto",
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	footerArrow: { ...redlineText.micro, color: redline.ink3 },
	footerLabel: { ...redlineText.micro, color: redline.ink3 },
});
