/**
 * MilestoneFace (§1.5) — the funnel promotion ceremony card, the ONLY place the
 * feed shows funnel progress (no persistent progress bar, §1.5 #1).
 *
 * Content is a recap of already-confirmed scope (`chips`, built from real
 * signals by the caller) plus the next-stage preview. Nothing here is
 * projected or aspirational — a chip appears because a signal exists.
 *
 * Not swipeable (§1.5 #2): that is enforced by `cardBehavior`'s `commits: false`
 * capability, not by this component. The CTA copy also comes from
 * `cardBehavior` so ceremony copy lives in one place.
 *
 * `haptics.milestone()` fires once when the card mounts — the success haptic of
 * §1.5 #1.
 *
 * The "See my journey on the map" sub-link targets task 4's Search tab, so it
 * renders disabled with no navigation when no handler is supplied (PLAN B11).
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cardBehavior } from "../../lib/feed/behavior";
import type { MilestoneCardV3 } from "../../lib/feed/card-types";
import { haptics } from "../../lib/haptics";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

interface MilestoneFaceProps {
	card: MilestoneCardV3;
	onContinue: () => void;
	/** Journey map layer (04 Search). Omitted in task 1 → disabled sub-link. */
	onMapLink?: () => void;
}

export function MilestoneFace({
	card,
	onContinue,
	onMapLink,
}: MilestoneFaceProps) {
	const behavior = cardBehavior(card);
	const cta = behavior.mode === "ceremony" ? behavior.cta : "Keep going →";

	useEffect(() => {
		haptics.milestone();
	}, []);

	return (
		<View style={styles.face}>
			<View style={styles.body}>
				<Text style={styles.eyebrow}>Stage unlocked</Text>
				<Text style={styles.headline}>{card.headline}</Text>
				<Text style={styles.sub}>{card.sub}</Text>
				{card.chips.length > 0 && (
					<View style={styles.chipRow}>
						{card.chips.map((c) => (
							<Text key={c} style={styles.chip}>
								{c}
							</Text>
						))}
					</View>
				)}
			</View>

			<View style={styles.actions}>
				<Pressable
					hitSlop={8}
					onPress={onContinue}
					style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
				>
					<Text style={styles.ctaLabel}>{cta}</Text>
				</Pressable>
				{onMapLink ? (
					<Pressable
						hitSlop={8}
						onPress={onMapLink}
						style={({ pressed }) => [styles.link, pressed && styles.pressed]}
					>
						<Text style={styles.linkLabel}>See my journey on the map</Text>
					</Pressable>
				) : (
					<View style={[styles.link, styles.linkDisabled]}>
						<Text style={styles.linkLabel}>See my journey on the map</Text>
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.ink },
	body: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
	eyebrow: { ...textStyles.caption, color: colors.accent },
	headline: { ...textStyles.display, color: colors.onCard, marginTop: 12 },
	sub: { ...textStyles.body, color: colors.onCardDim, marginTop: 14 },
	chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
	chip: {
		...textStyles.caption,
		color: colors.ink,
		backgroundColor: colors.glass,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	actions: { paddingHorizontal: 24, paddingBottom: 28, gap: 4 },
	cta: {
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	ctaLabel: { ...textStyles.headline, color: colors.ink },
	link: { minHeight: 44, alignItems: "center", justifyContent: "center" },
	linkDisabled: { opacity: 0.4 },
	linkLabel: {
		...textStyles.footnote,
		color: colors.onCardDim,
		textDecorationLine: "underline",
	},
	pressed: { opacity: 0.8 },
});
