/**
 * ExhaustedCard (§1.9) — the terminal card when the pool runs dry.
 *
 * §1.9 frames this as a scope problem, not a failure: the buyer has seen
 * everything in the area they narrowed to, and the exit is to widen it.
 * Explicit buttons because §0.5 reserves gestures for card decisions.
 *
 * Both handlers are optional and each renders only when given, so there is
 * never a dead affordance or fake navigation. Since 2026-09-09 the feed passes
 * only `onBrowseMap`: `onAdjustScope` opened `ScopeSheet`, and the sheet moved
 * to the Search/map tab at the owner's request — which is where "Browse map"
 * was already going. Whichever button is the only one takes the primary fill,
 * so the card never renders an outline-only call to action.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const MIN_TOUCH = 44;

interface ExhaustedCardProps {
	onAdjustScope?: () => void;
	onBrowseMap?: () => void;
}

export function ExhaustedCard({
	onAdjustScope,
	onBrowseMap,
}: ExhaustedCardProps) {
	// The first button present is the primary one — see the file header.
	const mapIsPrimary = onAdjustScope === undefined;
	return (
		<View style={styles.card}>
			<Text style={styles.headline}>
				You&rsquo;ve seen everything in your area — widen it?
			</Text>
			<View style={styles.actions}>
				{onAdjustScope ? (
					<Pressable
						onPress={onAdjustScope}
						style={[styles.btn, styles.primary]}
						accessibilityRole="button"
						hitSlop={8}
					>
						<Text style={styles.primaryLabel}>Adjust my scope</Text>
					</Pressable>
				) : null}
				{onBrowseMap ? (
					<Pressable
						onPress={onBrowseMap}
						style={[
							styles.btn,
							mapIsPrimary ? styles.primary : styles.secondary,
						]}
						accessibilityRole="button"
						hitSlop={8}
					>
						<Text
							style={mapIsPrimary ? styles.primaryLabel : styles.secondaryLabel}
						>
							Browse map
						</Text>
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
