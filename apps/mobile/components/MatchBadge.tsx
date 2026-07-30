/**
 * MatchBadge (§0.6 #3) — top-right on Stage-4 listing cards only.
 *
 * Visibility (owner-approved #9): renders null unless `stage === 4 && score >= 60`
 * (scores aren't trustworthy before the funnel completes). At `score >= 85` it
 * swaps to the FOMO state — "🎯 92% MATCH · See why →", tappable only when the
 * caller supplies `onSeeWhy`. That used to flip the card to its data face; the
 * flip was cut on 2026-07-30 and the feed does not pass a handler, so on a feed
 * card the FOMO state is currently a label, not a button. Whatever replaces the
 * destination wires in here.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

const FOMO_THRESHOLD = 85;
const MIN_VISIBLE = 60;

interface MatchBadgeProps {
	score: number;
	stage: number;
	onSeeWhy?: () => void;
}

export function MatchBadge({ score, stage, onSeeWhy }: MatchBadgeProps) {
	if (stage !== 4 || score < MIN_VISIBLE) return null;

	if (score >= FOMO_THRESHOLD) {
		return (
			<Pressable
				hitSlop={8}
				onPress={onSeeWhy}
				style={({ pressed }) => [
					styles.badge,
					styles.fomo,
					pressed && styles.pressed,
				]}
			>
				<Text style={styles.fomoText}>🎯 {score}% MATCH · See why →</Text>
			</Pressable>
		);
	}

	return <Text style={[styles.badge, styles.plainText]}>{score}% MATCH</Text>;
}

const styles = StyleSheet.create({
	badge: {
		alignSelf: "flex-start",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	plainText: {
		...textStyles.caption,
		color: colors.ink,
		backgroundColor: colors.glass,
	},
	fomo: { backgroundColor: colors.accent },
	fomoText: { ...textStyles.caption, color: colors.surface },
	pressed: { backgroundColor: colors.accentDeep },
});
