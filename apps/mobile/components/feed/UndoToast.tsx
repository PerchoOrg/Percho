/**
 * UndoToast (§1.8) — a 3s window to take back the last swipe.
 *
 * Only offered for listing / community / area cards. The caller gates on
 * `cardBehavior(card).undoable`, which is false for ask / trade-off / challenge /
 * insight / milestone: those swipes are already scope signal, and un-asking a
 * question the user has read is worse than living with the answer.
 *
 * The 3s timer is owned here so the toast cannot outlive its own window if the
 * screen forgets to clear it.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** §1.8, verbatim. */
export const UNDO_WINDOW_MS = 3000;
const MIN_TOUCH = 44;

interface UndoToastProps {
	/** What just happened, e.g. "Passed" — supplied by the caller from the verdict. */
	label: string;
	onUndo: () => void;
	/** Fired when the 3s window closes without an undo. */
	onExpire: () => void;
}

export function UndoToast({ label, onUndo, onExpire }: UndoToastProps) {
	useEffect(() => {
		const t = setTimeout(onExpire, UNDO_WINDOW_MS);
		return () => clearTimeout(t);
	}, [onExpire]);

	return (
		<View style={styles.wrap} pointerEvents="box-none">
			<View style={styles.toast}>
				<Text style={styles.label}>{label}</Text>
				<Pressable
					onPress={onUndo}
					style={styles.action}
					accessibilityRole="button"
					accessibilityLabel="Undo"
					hitSlop={8}
				>
					<Text style={styles.actionLabel}>Undo</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { position: "absolute", left: 0, right: 0, bottom: 24, alignItems: "center" },
	toast: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingLeft: 16,
		paddingRight: 4,
		borderRadius: radii.pill,
		backgroundColor: colors.ink,
	},
	label: { ...textStyles.footnote, color: colors.onCard },
	action: {
		minHeight: MIN_TOUCH,
		minWidth: MIN_TOUCH,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	actionLabel: { ...textStyles.headline, color: colors.onCard },
});
