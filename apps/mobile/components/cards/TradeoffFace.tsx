import { StyleSheet, Text, View } from "react-native";
import { DIMS } from "@percho/shared";
import type { DimKey } from "@percho/shared";
import type { TradeoffCardV3 } from "../../lib/feed/card-types";
import { SWIPE_THRESHOLD_RATIO } from "../../lib/gesture/decide-swipe";
import { radii, redline } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import {
	RedlineIcon,
	type RedlineIconName,
} from "./redline/RedlineChrome";
import Animated, {
	type SharedValue,
	interpolate,
	useAnimatedStyle,
} from "react-native-reanimated";

const REST_OPACITY = 0.72;
const CHOSEN_OPACITY = 1;
const DISCARDED_OPACITY = 0.4;

/**
 * The two choices are the card's content — the owner's 2026-08-17 note is to
 * make them BIGGER and give them air, not to add anything to fill the frame.
 * Disc 48 → 58, icon 22 → 27 (the icon keeps its ~0.47 share of the disc, so
 * the art is not just floating in a wider circle).
 */
const CHOICE_ICON = 27;
const DISC_SIZE = 58;

const DIM_ICON: Partial<Record<DimKey, RedlineIconName>> = {
	outdoors: "yard",
	space: "expand",
	trails: "path",
	walkable: "walk",
	schools: "school",
	family: "family",
	move_in: "check",
	quiet: "moon",
	hip: "shop",
	nightlife: "cup",
	entertaining: "cup",
};

const SUPPORT: Record<DimKey, string> = {
	outdoors: "More room outside",
	walkable: "Less time driving",
	schools: "Better for families",
	quiet: "Peace and quiet",
	hip: "A neighborhood scene",
	entertaining: "Great for hosting",
	trails: "Nature on your doorstep",
	nightlife: "Walk to dinner",
	family: "Made for family life",
	move_in: "Nothing to fix",
	space: "Room to grow",
};

interface TradeoffFaceProps {
	card: TradeoffCardV3;
	tx: SharedValue<number>;
	cardWidth: number;
}

export function TradeoffFace({
	card,
	tx,
	cardWidth,
}: TradeoffFaceProps) {
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
			<View style={styles.body}>
				<Text style={styles.question}>What matters more to you?</Text>

				<View style={styles.choices}>
					<Animated.View style={[styles.option, leftStyle]}>
						<View style={styles.disc}>
							<RedlineIcon
								name={card.left.icon ?? DIM_ICON[card.left.dim] ?? "walk"}
								size={CHOICE_ICON}
								color={redline.accent}
								weight="outline"
							/>
						</View>
						<Text style={styles.optionLabel}>{card.left.label}</Text>
						<Text style={styles.optionSupport}>{SUPPORT[card.left.dim]}</Text>
					</Animated.View>

					<View style={styles.separator} pointerEvents="none">
						<View style={styles.orDisc}>
							<Text style={styles.orLabel}>or</Text>
						</View>
					</View>

					<Animated.View style={[styles.option, rightStyle]}>
						<View style={styles.disc}>
							<RedlineIcon
								name={card.right.icon ?? DIM_ICON[card.right.dim] ?? "walk"}
								size={CHOICE_ICON}
								color={redline.accent}
								weight="outline"
							/>
						</View>
						<Text style={styles.optionLabel}>{card.right.label}</Text>
						<Text style={styles.optionSupport}>{SUPPORT[card.right.dim]}</Text>
					</Animated.View>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: redline.card },
	/**
	 * Still `justifyContent: center`, but the padding is ASYMMETRIC (18/18 →
	 * 16 top / 38 bottom) — owner 2026-08-17: less dead space above the
	 * question.
	 *
	 * Centring inside a box that is padded more at the bottom sits the group
	 * ~11pt higher than true centre, on every device, which top-anchoring with
	 * a fixed offset does not: this card carries a fixed ~230pt of content, so
	 * a fixed top offset that looks right on an SE leaves a 130pt hole under
	 * the choices on a Pro Max. The bias is a constant; the slack it leaves
	 * still splits with the frame.
	 */
	body: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 22,
		paddingTop: 16,
		paddingBottom: 38,
		zIndex: 2,
	},
	/**
	 * "What matters more to you?" — serif 25/500 centred. One natural break:
	 * line 1 "What matters more to", line 2 "you?" — no orphan. The old 32pt
	 * question wrapped after "you" and stranded "you?" alone on line 2
	 * (Tia 2026-08-16).
	 */
	question: {
		...redlineText.question,
		fontSize: 25,
		lineHeight: 29,
		color: redline.ink,
		textAlign: "center",
	},
	/**
	 * 44 (28 → 34 → 44, 2026-08-17): the gap between the two-line question and
	 * the choices. Widened again with the discs — the question and the choice
	 * pair are the card's two ideas, and at 34 against a 58pt disc they read as
	 * one block. The body centres the group, so this only changes where the
	 * question sits relative to the choices, never where the pair sits in the
	 * frame.
	 */
	choices: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 44,
		width: "100%",
		position: "relative",
	},
	/** 12 (was 10) — a wider quiet band between each option and the `or`. */
	option: {
		flex: 1,
		alignItems: "center",
		paddingHorizontal: 12,
	},
	disc: {
		width: DISC_SIZE,
		height: DISC_SIZE,
		borderRadius: radii.pill,
		backgroundColor: redline.accentSoft,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 18,
	},
	optionLabel: {
		...redlineText.choice,
		color: redline.ink,
		textAlign: "center",
	},
	/** 6 (was 3) — the support line is a second thought, not a subtitle. */
	optionSupport: {
		...redlineText.subtext,
		color: redline.ink3,
		textAlign: "center",
		marginTop: 6,
	},
	separator: {
		position: "absolute",
		top: 0,
		bottom: 0,
		alignSelf: "center",
		left: "50%",
		marginLeft: -14,
		width: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	orDisc: {
		width: 26,
		height: 26,
		borderRadius: radii.pill,
		backgroundColor: redline.card,
		alignItems: "center",
		justifyContent: "center",
	},
	orLabel: {
		...redlineText.nano,
		color: redline.ink3,
	},
});
