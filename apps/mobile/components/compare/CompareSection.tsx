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
 *
 * phase283: a note sits on its title's own line, at both levels (owner:
 * "Put description to the same line of title"), which cost the page four
 * stacked lines of small print.
 *
 * phase286: the row itself goes compact (owner: "Make it a compact table.
 * A lot of empty spaces in each line"). A label on its own line left most
 * of that line blank; at three columns or fewer the label now sits in a
 * left column with the figures beside it. See `COMPACT_MAX_COLUMNS` for
 * why four and five still stack.
 */
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CompareTableRow } from "../../lib/compare/table";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/**
 * Above this many columns the label goes back above its cells.
 *
 * Pure width arithmetic — the same sum phase272 did when it moved the label
 * OUT of a left column. The screen has ~358 pt; a label column costs
 * `LABEL_COL_W` plus a gap, leaving ~262 pt for the figures. Split three
 * ways that is ~82 pt a cell, comfortable for "$3,912/mo" (~58 pt at
 * 13 px). Split five ways it is ~46 pt, which clips it.
 *
 * So this does not overrule phase272's finding; it is the case that finding
 * did not cover. phase272 measured five columns, and two or three is what a
 * buyer actually shortlists.
 */
const COMPACT_MAX_COLUMNS = 3;
const LABEL_COL_W = 96;

/**
 * The spacer a screen's thumbnail header needs so its columns sit over the
 * figure columns below them.
 *
 * The compact row spends `LABEL_COL_W` on its label before the first cell;
 * a header row laid out across the full width would put its thumbnails out
 * of line with the numbers underneath, which is the one thing a table may
 * not do. `gap` is the header row's own flex gap — the spacer gives back
 * that much, because the gap after the spacer is part of the offset.
 */
export function ColumnHeaderSpacer({
	count,
	gap = 8,
}: {
	count: number;
	gap?: number;
}) {
	if (count > COMPACT_MAX_COLUMNS) return null;
	return <View style={{ width: LABEL_COL_W - gap }} />;
}

export function FigureRow({
	row,
	ids,
}: {
	row: CompareTableRow;
	ids: string[];
}) {
	const max = row.meterMax ?? 0;
	const compact = ids.length <= COMPACT_MAX_COLUMNS;
	return (
		<View style={[styles.rowBlock, compact && styles.rowBlockCompact]}>
			<View style={compact ? styles.labelCol : styles.labelRow}>
				<Text style={styles.label}>{row.label}</Text>
				{row.note && (
					<Text style={compact ? styles.noteStacked : styles.note}>
						{row.note}
					</Text>
				)}
			</View>
			<View style={[styles.cells, compact && styles.cellsCompact]}>
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
			<View style={styles.blockHead}>
				<Text style={styles.blockTitle}>{title}</Text>
				{note && <Text style={styles.blockNote}>{note}</Text>}
			</View>
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
	block: { marginTop: 20 },
	/**
	 * Title and note share a line (phase283, owner: "Put description to the
	 * same line of title"). Baseline-aligned so the 12 px note sits on the
	 * 15 px title's baseline rather than floating; the note takes the rest of
	 * the width and wraps inside its own column if it outruns it.
	 */
	blockHead: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 8,
		marginBottom: 5,
	},
	blockTitle: { ...textStyles.headline, color: colors.ink },
	// Footnote, not caption: caption's uppercase tracking is unreadable at
	// sentence length, and this note is the one short line a section gets.
	blockNote: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink3,
		lineHeight: 16,
		flex: 1,
	},
	blockEmpty: { ...textStyles.footnote, color: colors.ink3, marginTop: 8 },
	rowBlock: {
		marginTop: 14,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	/**
	 * The compact row: label left, figures right, one line of hairline
	 * between rows. `marginTop` goes to zero — the padding is the rhythm now,
	 * and a 14 pt gap on top of it is the empty space the owner was looking
	 * at.
	 */
	rowBlockCompact: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 0,
		paddingVertical: 9,
	},
	labelCol: { width: LABEL_COL_W, paddingRight: 8 },
	/** Same inline treatment as the section head — see `blockHead`. */
	labelRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
	label: {
		...textStyles.caption,
		color: colors.ink3,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	/**
	 * NOT `textStyles.caption` — that face is uppercase, and an uppercase note
	 * beside an uppercase label read as two labels stacked (owner's
	 * screenshot, phase283). Sentence case says "this describes the thing to
	 * my left".
	 */
	note: {
		...textStyles.footnote,
		fontSize: 11,
		color: colors.ink3,
		lineHeight: 14,
		flex: 1,
	},
	/** In the compact row the note has no width to sit beside the label. */
	noteStacked: {
		...textStyles.footnote,
		fontSize: 11,
		color: colors.ink3,
		lineHeight: 13,
		marginTop: 1,
	},
	cells: { flexDirection: "row", gap: 8, marginTop: 6 },
	cellsCompact: { flex: 1, marginTop: 0 },
	cell: { flex: 1 },
	value: { ...textStyles.footnote, color: colors.ink, textAlign: "center" },
	valueBlank: { color: colors.ink3 },
	/** 3 pt bar under a bounded figure. Track stays for "—" so columns align. */
	meterTrack: {
		height: 3,
		borderRadius: 1.5,
		backgroundColor: colors.border,
		marginTop: 4,
		marginHorizontal: 6,
		overflow: "hidden",
	},
	meterFill: {
		height: 3,
		borderRadius: 1.5,
		backgroundColor: colors.accent,
	},
});
