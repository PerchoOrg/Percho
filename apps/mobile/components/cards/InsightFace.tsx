/**
 * InsightFace (§1.6) — "Percho noticed" — the app reflecting the buyer's own
 * behaviour back at them.
 *
 * The evidence line is required by the type (`InsightCardV3.evidence`) and is
 * built by `earnInsight()` from the real running signal weight. There is no
 * branch here that renders an insight without its evidence: an unsupported
 * claim about someone's taste is worse than no insight at all.
 *
 * §1.6 gives this card a third option — a neutral "Not sure" pill that records
 * nothing. Its label comes from `cardBehavior`, not from this file.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { InsightCardV3 } from "../../lib/feed/card-types";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { KindChip } from "../KindChip";
import { CardSurface } from "./CardSurface";

/** §0.5: every touch target is at least 44pt. */
const MIN_TOUCH = 44;

interface InsightFaceProps {
	card: InsightCardV3;
	/** From `cardBehavior(card)` — the mode:'confirm' neutralLabel. */
	neutralLabel: string;
	onNotSure: () => void;
}

export function InsightFace({
	card,
	neutralLabel,
	onNotSure,
}: InsightFaceProps) {
	return (
		<View style={styles.face}>
			<CardSurface />
			<View style={styles.head}>
				<KindChip label="💡 INSIGHT" />
				<Text style={styles.tag}>PERCHO NOTICED</Text>
			</View>

			<View style={styles.body}>
				<Text style={styles.claim}>{card.text}</Text>
				<Text style={styles.evidence}>{card.evidence}</Text>
			</View>

			<View style={styles.foot}>
				<Pressable
					onPress={onNotSure}
					style={styles.neutral}
					accessibilityRole="button"
					accessibilityLabel={neutralLabel}
					hitSlop={8}
				>
					<Text style={styles.neutralLabel}>{neutralLabel}</Text>
				</Pressable>
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
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
		gap: 12,
	},
	claim: { ...textStyles.title1, color: colors.onCard, textAlign: "center" },
	evidence: {
		...textStyles.footnote,
		color: colors.onCardDim,
		textAlign: "center",
	},
	foot: { alignItems: "center", paddingBottom: 28 },
	neutral: {
		minHeight: MIN_TOUCH,
		justifyContent: "center",
		paddingHorizontal: 24,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: colors.onCardDim,
	},
	neutralLabel: { ...textStyles.headline, color: colors.onCard },
});
