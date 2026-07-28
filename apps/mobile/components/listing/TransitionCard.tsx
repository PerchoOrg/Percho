/**
 * TransitionCard (§2.4 #5) — shown after the tour's last stop.
 *
 * A single card, not a screen and not a mode switch: §2.4 #5 is explicit that
 * Continue resumes the SAME url at the SAME scroll position. So this renders as
 * an overlay above free explore rather than as another route.
 *
 * The two bolded signals are a readback of what the tour actually cited, passed
 * in from the stops' own evidence. They are never authored here and never
 * generalised — §2.6's silent-learning principle allows this one readback, and
 * only because it repeats something real.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

interface TransitionCardProps {
	/**
	 * What the tour taught us, in the buyer's terms. Empty is valid: a generic
	 * tour learned nothing personal, so the card says so rather than inventing
	 * two preferences.
	 */
	signals: readonly string[];
	onContinue: () => void;
}

export function TransitionCard({ signals, onContinue }: TransitionCardProps) {
	return (
		<View style={styles.backdrop}>
			<View style={styles.card}>
				<Text style={styles.icon}>🌿</Text>
				<Text style={styles.title}>
					You've seen the highlights. Explore the rest freely.
				</Text>
				<View style={styles.rule} />
				<Text style={styles.body}>
					{signals.length > 0
						? `We've learned you care about ${joinSignals(signals)}.`
						: // No signals yet (generic tour). Saying nothing specific beats
							// claiming a preference the buyer never expressed.
							"Take it at your own pace from here."}
				</Text>
				<Pressable
					onPress={onContinue}
					style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
				>
					<Text style={styles.ctaLabel}>Continue</Text>
				</Pressable>
			</View>
		</View>
	);
}

/** "outdoor space and open floor plans" — max two, per the spec's mockup. */
function joinSignals(signals: readonly string[]): string {
	const two = signals.slice(0, 2);
	return two.length === 2 ? `${two[0]} and ${two[1]}` : (two[0] ?? "");
}

const styles = StyleSheet.create({
	backdrop: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
		backgroundColor: colors.scrim,
	},
	card: {
		width: "100%",
		padding: 24,
		gap: 12,
		borderRadius: radii.card,
		backgroundColor: colors.surface,
	},
	icon: { fontSize: 28 },
	title: { ...textStyles.title2, color: colors.ink },
	rule: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: colors.border,
	},
	body: { ...textStyles.body, color: colors.ink2 },
	cta: {
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.btn,
		backgroundColor: colors.cta,
		marginTop: 4,
	},
	pressed: { opacity: 0.85 },
	ctaLabel: { ...textStyles.headline, color: colors.bg },
});
