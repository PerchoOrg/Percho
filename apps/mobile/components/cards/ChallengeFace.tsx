/**
 * ChallengeFace (§1.6) — the market-education card.
 *
 * ## Redesigned 2026-07-27
 *
 * Owner: "challenge卡做成选择按钮 选择之后显示答案 并且提供一个explore的按钮进一步
 * 了解 也可以直接划走".
 *
 * The answer is picked by TAPPING one of two buttons. Before that the card shows
 * the question and nothing else; after it, the chosen button is marked
 * right/wrong, the real number and the teaching line appear, and an `Explore →`
 * button offers the listing the number came from. A swipe is only ever "next" —
 * it records no verdict.
 *
 * The previous version answered on swipe and then froze the card mid-flight for
 * 900ms so the reveal could be read. That coupling was the whole problem: a swipe
 * is how you LEAVE a card, so answering with one meant the answer could never be
 * read except while exiting. On device it read as a malfunction three separate
 * ways — stuck mid-screen, then a spring-back that looked like an undo, then a
 * second unexplained swipe.
 *
 * Nothing numeric is authored here: `revealLabel` and `teach` come off the card,
 * built by `challengeFromListing` from a real listing price.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChallengeCardV3 } from "../../lib/feed/card-types";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { ExploreButton } from "../ExploreButton";
import { KindChip } from "../KindChip";
import { CardSurface } from "./CardSurface";

/** §0.5: every touch target is at least 44pt. */
const MIN_TOUCH = 44;

interface ChallengeFaceProps {
	card: ChallengeCardV3;
	/** Which side the buyer tapped, or null while unanswered. */
	chosen: "left" | "right" | null;
	onChoose: (side: "left" | "right") => void;
	/**
	 * Opens the listing the price came from. Omitted while the targets for it
	 * don't exist (task 2), and `ExploreButton` is simply not rendered — no dead
	 * affordance, same call as `CardFoot`.
	 */
	onExplore?: () => void;
}

export function ChallengeFace({
	card,
	chosen,
	onChoose,
	onExplore,
}: ChallengeFaceProps) {
	const answered = chosen !== null;
	const correct = answered && chosen === card.answer;

	return (
		<View style={styles.face}>
			<CardSurface variant="challenge" />
			<View style={styles.head}>
				<KindChip label="CHALLENGE" />
				<Text style={styles.tag}>{card.tag}</Text>
			</View>

			<View style={styles.body}>
				<Text style={styles.q}>{card.q}</Text>
				{card.sub ? <Text style={styles.sub}>{card.sub}</Text> : null}

				<View style={styles.choices}>
					{(["left", "right"] as const).map((side) => {
						// Only the two answered states carry colour. An unanswered card must
						// not hint at the answer, so both buttons look identical until one
						// is tapped (§1.6's red line about not pre-revealing).
						const isChosen = chosen === side;
						const isAnswer = card.answer === side;
						return (
							<Pressable
								key={side}
								disabled={answered}
								hitSlop={8}
								onPress={() => onChoose(side)}
								accessibilityRole="button"
								accessibilityState={{ selected: isChosen }}
								style={({ pressed }) => [
									styles.choice,
									pressed && !answered && styles.pressed,
									// After answering, mark the true answer green and a wrong pick
									// red. The unpicked correct option is still shown green —
									// being told the right answer is the point of the card.
									answered && isAnswer && styles.choiceCorrect,
									answered && isChosen && !isAnswer && styles.choiceWrong,
								]}
							>
								<Text style={styles.choiceLabel}>{card[side].label}</Text>
							</Pressable>
						);
					})}
				</View>

				{answered && (
					<View style={styles.reveal}>
						<Text
							style={[
								styles.revealLabel,
								{ color: correct ? colors.pos : colors.neg },
							]}
						>
							{card.revealLabel}
						</Text>
						<Text style={styles.teach}>{card.teach}</Text>
						{!!onExplore && (
							<View style={styles.exploreSlot}>
								<ExploreButton onPress={onExplore} />
							</View>
						)}
					</View>
				)}
			</View>
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
		justifyContent: "center",
		paddingHorizontal: 24,
		gap: 12,
	},
	q: { ...textStyles.title1, color: colors.onCard, textAlign: "center" },
	sub: { ...textStyles.footnote, color: colors.onCardDim, textAlign: "center" },
	choices: { gap: 10, marginTop: 20 },
	choice: {
		minHeight: MIN_TOUCH,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 18,
		borderRadius: radii.btn,
		borderWidth: 1,
		borderColor: colors.onCardDim,
	},
	pressed: { opacity: 0.7 },
	choiceCorrect: { borderColor: colors.pos, borderWidth: 2 },
	choiceWrong: { borderColor: colors.neg, borderWidth: 2 },
	choiceLabel: { ...textStyles.headline, color: colors.onCard },
	reveal: { marginTop: 20, gap: 8, alignItems: "center" },
	revealLabel: { ...textStyles.display, textAlign: "center" },
	teach: { ...textStyles.body, color: colors.onCardDim, textAlign: "center" },
	exploreSlot: { marginTop: 6 },
});
