/**
 * ExhaustedCard (§1.9) — the terminal card when the pool runs dry.
 *
 * §1.9 frames this as a scope problem, not a failure: the buyer has seen
 * everything in the area they narrowed to, and the two exits are to widen the
 * scope (You tab) or to browse spatially (Search/map). Both are explicit buttons
 * because §0.5 reserves gestures for card decisions.
 *
 * `onBrowseMap` is optional: the Search tab arrives in task 4, so until then the
 * caller omits it and the button is simply not rendered — no dead affordance and
 * no fake navigation.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const MIN_TOUCH = 44;

interface ExhaustedCardProps {
	onAdjustScope: () => void;
	onBrowseMap?: () => void;
}

export function ExhaustedCard({
	onAdjustScope,
	onBrowseMap,
}: ExhaustedCardProps) {
	return (
		<View style={styles.card}>
			<Text style={styles.headline}>
				You&rsquo;ve seen everything in your area — widen it?
			</Text>
			<View style={styles.actions}>
				<Pressable
					onPress={onAdjustScope}
					style={[styles.btn, styles.primary]}
					accessibilityRole="button"
					hitSlop={8}
				>
					<Text style={styles.primaryLabel}>Adjust my scope</Text>
				</Pressable>
				{onBrowseMap ? (
					<Pressable
						onPress={onBrowseMap}
						style={[styles.btn, styles.secondary]}
						accessibilityRole="button"
						hitSlop={8}
					>
						<Text style={styles.secondaryLabel}>Browse map</Text>
					</Pressable>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		...StyleSheet.absoluteFill,
		backgroundColor: colors.surface,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 28,
		gap: 24,
	},
	headline: { ...textStyles.title1, color: colors.ink, textAlign: "center" },
	actions: { alignSelf: "stretch", gap: 12 },
	btn: {
		minHeight: MIN_TOUCH,
		borderRadius: radii.btn,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 20,
	},
	primary: { backgroundColor: colors.cta },
	primaryLabel: { ...textStyles.headline, color: colors.onCard },
	secondary: { borderWidth: 1, borderColor: colors.border },
	secondaryLabel: { ...textStyles.headline, color: colors.ink },
});
