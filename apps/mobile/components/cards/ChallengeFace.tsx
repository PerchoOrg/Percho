/**
 * ChallengeFace (§1.6) — the market-education card. Guess between two options,
 * then the card holds for `revealMs` showing the real answer before flying out.
 *
 * `revealProgress` is this component's OWN shared value, deliberately NOT the
 * `flipProgress` that drives the data-face crossfade. Conflating them is how a
 * card flies out showing the wrong face: the reveal is a post-commit answer
 * state, the flip is a user-initiated data view, and they can be requested at
 * overlapping times.
 *
 * The revealed number comes off the card (`revealLabel` / `teach`), which
 * `challengeFromListing` built from a real listing price. Nothing numeric is
 * authored here.
 */
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import type { ChallengeCardV3 } from "../../lib/feed/card-types";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { KindChip } from "../KindChip";
import { CardSurface } from "./CardSurface";

interface ChallengeFaceProps {
	card: ChallengeCardV3;
	/** 0 = question, 1 = answer revealed. Owned by the feed screen, not the flip. */
	revealProgress: SharedValue<number>;
	/** Which side the user picked, once committed. Null while undecided. */
	chosen: "left" | "right" | null;
}

export function ChallengeFace({
	card,
	revealProgress,
	chosen,
}: ChallengeFaceProps) {
	const questionStyle = useAnimatedStyle(() => ({
		opacity: 1 - revealProgress.value,
	}));
	const answerStyle = useAnimatedStyle(() => ({
		opacity: revealProgress.value,
	}));

	// Correctness is only meaningful once a side has been picked; before that
	// the pulse colour must not hint at the answer.
	const correct = chosen === null ? null : chosen === card.answer;

	return (
		<View style={styles.face}>
			<CardSurface />
			<View style={styles.head}>
				<KindChip label="CHALLENGE" />
				<Text style={styles.tag}>{card.tag}</Text>
			</View>

			<Animated.View style={[styles.body, questionStyle]}>
				<Text style={styles.q}>{card.q}</Text>
				{card.sub ? <Text style={styles.sub}>{card.sub}</Text> : null}
				<View style={styles.options}>
					<Text style={styles.option}>← {card.left.label}</Text>
					<Text style={styles.option}>{card.right.label} →</Text>
				</View>
			</Animated.View>

			<Animated.View
				style={[styles.body, styles.answerLayer, answerStyle]}
				pointerEvents="none"
			>
				<Text
					style={[
						styles.reveal,
						correct === null
							? null
							: { color: correct ? colors.pos : colors.neg },
					]}
				>
					{card.revealLabel}
				</Text>
				<Text style={styles.teach}>{card.teach}</Text>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.cardPlainTo },
	head: {
		position: "absolute",
		top: 16,
		left: 16,
		zIndex: 2,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	tag: { ...textStyles.caption, color: colors.onCardDim },
	body: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
		gap: 12,
	},
	answerLayer: { ...StyleSheet.absoluteFillObject },
	q: { ...textStyles.title1, color: colors.onCard, textAlign: "center" },
	sub: { ...textStyles.footnote, color: colors.onCardDim, textAlign: "center" },
	options: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignSelf: "stretch",
		marginTop: 24,
	},
	option: { ...textStyles.headline, color: colors.onCardDim },
	reveal: { ...textStyles.display, color: colors.onCard, textAlign: "center" },
	teach: { ...textStyles.body, color: colors.onCardDim, textAlign: "center" },
});
