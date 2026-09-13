/**
 * The shared body of a compare screen (phase281): one titled section, and
 * one figure row — label above, an equal-flex cell per column, the layout
 * `/compare-areas` pioneered and phase272 spread to the other two.
 *
 * Lives in a component so `/compare` and `/compare-communities` render the
 * owner's four aspects identically; the screens keep only their own
 * headers, fetch, and footers. A bounded figure draws a small amber meter
 * under its number (`CompareTableRow.meter`) — that is what replaces the
 * prose the owner cut ("a lot of text"): the bar is read, not explained.
 */
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CompareTableRow } from "../../lib/compare/table";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export function FigureRow({
	row,
	ids,
}: {
	row: CompareTableRow;
	ids: string[];
}) {
	const max = row.meterMax ?? 0;
	return (
		<View style={styles.rowBlock}>
			<Text style={styles.label}>{row.label}</Text>
			{row.note && <Text style={styles.note}>{row.note}</Text>}
			<View style={styles.cells}>
				{row.cells.map((c, i) => {
					const v = row.meter?.[i];
					return (
						<View key={ids[i] ?? String(i)} style={styles.cell}>
							<Text style={[styles.value, !c && styles.valueBlank]}>
								{c ?? "—"}
							</Text>
							{max > 0 && (
								<View style={styles.meterTrack}>
									{v !== undefined && (
										<View
											style={[
												styles.meterFill,
												{
													width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`,
												},
											]}
										/>
									)}
								</View>
							)}
						</View>
					);
				})}
			</View>
		</View>
	);
}

/**
 * A titled section of rows — one of the four aspects, or "The basics".
 * `children` render after the rows (the basics' show-all toggle). An
 * aspect with no rows says so rather than disappearing: two of the four
 * are sparsely covered, and a section that vanishes reads as an app bug
 * where a dash reads as an honest gap.
 */
export function CompareBlock({
	title,
	note,
	rows,
	ids,
	children,
}: {
	title: string;
	note?: string;
	rows: readonly CompareTableRow[];
	ids: string[];
	children?: ReactNode;
}) {
	return (
		<View style={styles.block}>
			<Text style={styles.blockTitle}>{title}</Text>
			{note && <Text style={styles.blockNote}>{note}</Text>}
			{rows.length === 0 && (
				<Text style={styles.blockEmpty}>Nothing on file for these.</Text>
			)}
			{rows.map((r) => (
				<FigureRow key={r.label} row={r} ids={ids} />
			))}
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	block: { marginTop: 26 },
	blockTitle: { ...textStyles.headline, color: colors.ink },
	// Footnote, not caption: caption's uppercase tracking is unreadable at
	// sentence length, and this note is the one short line a section gets.
	blockNote: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink3,
		marginTop: 3,
		lineHeight: 16,
	},
	blockEmpty: { ...textStyles.footnote, color: colors.ink3, marginTop: 8 },
	rowBlock: {
		marginTop: 14,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	label: {
		...textStyles.caption,
		color: colors.ink3,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	note: { ...textStyles.caption, color: colors.ink3, marginTop: 1 },
	cells: { flexDirection: "row", gap: 8, marginTop: 6 },
	cell: { flex: 1 },
	value: { ...textStyles.footnote, color: colors.ink, textAlign: "center" },
	valueBlank: { color: colors.ink3 },
	/** 3 pt bar under a bounded figure. Track stays for "—" so columns align. */
	meterTrack: {
		height: 3,
		borderRadius: 1.5,
		backgroundColor: colors.border,
		marginTop: 5,
		marginHorizontal: 6,
		overflow: "hidden",
	},
	meterFill: {
		height: 3,
		borderRadius: 1.5,
		backgroundColor: colors.accent,
	},
});
