/**
 * HotspotSheet (§2.5) — the action sheet behind a hotspot pin or row.
 *
 * Composes the task-0 `BottomSheet` (do not fork a second sheet). Each of the
 * five actions expands IN PLACE rather than navigating, because §2.5 #1 makes
 * `Save` explicitly not close the sheet, and a buyer comparing features should
 * not lose their place.
 *
 * Per-action behaviour, from §2.5 #1:
 *   why      → a profile-connected paragraph + its evidence.
 *   compare  → raises the sheet to the large detent.
 *   renovate → a range estimate; only present on a dated feature.
 *   save     → INSTANT feedback: the row becomes "♥ Saved to your profile" with
 *              the success haptic, and the sheet stays open.
 *   ask_ai   → greyed "coming soon" until Phase D. Rendered disabled rather than
 *              hidden so the surface's shape is honest about what is coming.
 *
 * Every action's subtitle is required to carry a number — enforced upstream in
 * `lib/listing/hotspot.ts`, which drops vague rows and refuses to emit a hotspot
 * with fewer than three survivors. This component therefore never has to decide
 * whether a row is worth showing.
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptics } from "../../lib/haptics";
import type { ActionKind, Hotspot } from "../../lib/listing/hotspot";
import { emojiForRoom } from "../../lib/listing/hotspot";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { BottomSheet } from "../BottomSheet";

interface HotspotSheetProps {
	hotspot: Hotspot;
	onClose: () => void;
	/** Fires for every tap — §2.6 `action_tap(kind)`. */
	onAction: (kind: ActionKind) => void;
}

const ACTION_EMOJI: Record<ActionKind, string> = {
	why: "💡",
	compare: "⚖️",
	renovate: "🔨",
	save: "♡",
	ask_ai: "✨",
};

export function HotspotSheet({
	hotspot,
	onClose,
	onAction,
}: HotspotSheetProps) {
	const [expanded, setExpanded] = useState<ActionKind | null>(null);
	const [saved, setSaved] = useState(false);

	// §2.5 #1: Compare needs the large detent for a distribution plus three
	// comparison cards. Everything else fits the medium one.
	const detent = expanded === "compare" ? "large" : "medium";

	const press = (kind: ActionKind, disabled?: true) => {
		if (disabled) return;
		onAction(kind);
		if (kind === "save") {
			// Instant, local, and the sheet stays open (§2.5 #1). The write to
			// `saved_features` is task-5's profile work; the visual commitment
			// happens now because a save that waits on a round trip reads as broken.
			setSaved(true);
			haptics.milestone();
			return;
		}
		haptics.cardSettle();
		setExpanded((cur) => (cur === kind ? null : kind));
	};

	return (
		<BottomSheet visible detent={detent} onClose={onClose}>
			<ScrollView contentContainerStyle={styles.body}>
				<Text style={styles.title}>
					{emojiForRoom(hotspot.room)} {hotspot.title}
				</Text>
				<Text style={styles.sub}>
					{hotspot.room}
					{hotspot.dated ? " · dated" : ""}
				</Text>

				{hotspot.actions.map((action) => {
					const isSave = action.kind === "save";
					const showSaved = isSave && saved;
					return (
						<View key={action.kind}>
							<Pressable
								onPress={() => press(action.kind, action.disabled)}
								style={({ pressed }) => [
									styles.row,
									pressed && !action.disabled && styles.rowPressed,
									action.disabled && styles.rowDisabled,
								]}
							>
								<Text style={styles.rowEmoji}>
									{showSaved ? "♥" : ACTION_EMOJI[action.kind]}
								</Text>
								<View style={styles.rowText}>
									<Text
										style={[styles.rowLabel, action.disabled && styles.dimText]}
									>
										{showSaved ? "Saved to your profile" : action.label}
										{action.disabled ? " · coming soon" : ""}
									</Text>
									<Text style={styles.rowSub}>{action.sub}</Text>
								</View>
								{!action.disabled && !showSaved && (
									<Text style={styles.chevron}>›</Text>
								)}
							</Pressable>

							{expanded === action.kind && !isSave && (
								<View style={styles.expansion}>
									{/* The expansion shows the action's own concrete subtitle
									    rather than prose generated here. The richer forms
									    (evidence thumbnails, the comparison distribution) need
									    per-buyer attribution and comp joins that do not exist
									    yet — so this states what is known instead of padding
									    with placeholder copy. */}
									<Text style={styles.expansionText}>{action.sub}</Text>
								</View>
							)}
						</View>
					);
				})}
			</ScrollView>
		</BottomSheet>
	);
}

const styles = StyleSheet.create({
	body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 4 },
	title: { ...textStyles.title2, color: colors.ink },
	sub: {
		...textStyles.caption,
		color: colors.ink2,
		marginBottom: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 56,
		paddingVertical: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	rowPressed: { opacity: 0.7 },
	rowDisabled: { opacity: 0.45 },
	rowEmoji: { fontSize: 18 },
	rowText: { flex: 1, gap: 2 },
	rowLabel: { ...textStyles.headline, color: colors.ink },
	rowSub: { ...textStyles.footnote, color: colors.ink2 },
	dimText: { color: colors.ink2 },
	chevron: { ...textStyles.headline, color: colors.ink3 },
	expansion: {
		paddingBottom: 12,
		paddingLeft: 30,
	},
	expansionText: { ...textStyles.body, color: colors.ink2 },
});
