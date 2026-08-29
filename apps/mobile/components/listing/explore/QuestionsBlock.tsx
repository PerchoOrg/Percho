/**
 * QuestionsBlock (phase126, `docs/design/move-in-questions.md`) — "What people
 * ask before they move here".
 *
 * A ranked list of questions in the buyer's voice; tapping one expands the
 * answer for THIS home with its "Based on" line and, when a visit can settle
 * it, a go-and-see action. The first `FIRST_N` show at once; the rest sit
 * behind "More questions", grouped by theme.
 *
 * The block draws only. Ranking is `lib/listing/questions.ts`; the affinity
 * bump and every event are the screen's, via callbacks — this file must not
 * know what an open MEANS (§9.7: the learning channel is never surfaced).
 */
import {
	type QuestionTheme,
	THEME_LABELS,
	THEME_ORDER,
} from "@percho/shared/questions";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FIRST_N, type RankedQuestion } from "../../../lib/listing/questions";
import { explore, exploreRadii, fonts } from "../../../theme/tokens";

export interface QuestionsBlockProps {
	ranked: readonly RankedQuestion[];
	/** A row expanded. */
	onOpen: (q: RankedQuestion, rank: number) => void;
	/** A row collapsed (or replaced by another) after `dwellMs` on screen. */
	onClose: (q: RankedQuestion, rank: number, dwellMs: number) => void;
	onVerify: (q: RankedQuestion) => void;
	onSource: (q: RankedQuestion, basisIndex: number, url: string) => void;
	onBrowseTheme: (theme: QuestionTheme) => void;
}

export function QuestionsBlock({
	ranked,
	onOpen,
	onClose,
	onVerify,
	onSource,
	onBrowseTheme,
}: QuestionsBlockProps) {
	const [openId, setOpenId] = useState<string | null>(null);
	const openedAt = useRef<number>(0);
	const [more, setMore] = useState(false);
	const [theme, setTheme] = useState<QuestionTheme | null>(null);

	const top = ranked.slice(0, FIRST_N);
	const rest = ranked.slice(FIRST_N);
	const themes = THEME_ORDER.filter((t) => rest.some((r) => r.def.theme === t));
	const browsing = theme ? rest.filter((r) => r.def.theme === theme) : [];

	const rankOf = (q: RankedQuestion) =>
		ranked.findIndex((r) => r.def.id === q.def.id);

	const toggle = (q: RankedQuestion) => {
		const now = Date.now();
		if (openId) {
			const prev = ranked.find((r) => r.def.id === openId);
			if (prev) onClose(prev, rankOf(prev), now - openedAt.current);
		}
		if (openId === q.def.id) {
			setOpenId(null);
			return;
		}
		openedAt.current = now;
		setOpenId(q.def.id);
		onOpen(q, rankOf(q));
	};

	const row = (q: RankedQuestion) => {
		const open = openId === q.def.id;
		return (
			<View key={q.def.id} style={styles.row}>
				<Pressable
					onPress={() => toggle(q)}
					accessibilityRole="button"
					accessibilityState={{ expanded: open }}
					style={styles.head}
				>
					<Text style={[styles.q, open && styles.qOpen]}>{q.def.q}</Text>
					<Text style={styles.chev}>{open ? "–" : "+"}</Text>
				</Pressable>
				{open && (
					<View style={styles.body}>
						{q.answer.form === "checklist" ? (
							q.answer.answer.split("\n").map((line, i) => (
								<Text
									// biome-ignore lint/suspicious/noArrayIndexKey: lines are static per answer
									key={i}
									style={[styles.a, i > 0 && styles.aLine]}
								>
									{line}
								</Text>
							))
						) : (
							<Text style={styles.a}>{q.answer.answer}</Text>
						)}
						<Text style={styles.basis}>
							<Text style={styles.basisLabel}>Based on </Text>
							{q.answer.basis.map((b, i) => (
								<Text key={`${b.type}-${b.note}`}>
									{i > 0 ? " · " : ""}
									{b.url ? (
										<Text
											style={styles.link}
											onPress={() => b.url && onSource(q, i, b.url)}
										>
											{b.note}
										</Text>
									) : (
										b.note
									)}
								</Text>
							))}
						</Text>
						{q.answer.verify && (
							<Pressable
								onPress={() => onVerify(q)}
								accessibilityRole="button"
								style={styles.verify}
							>
								<Text style={styles.verifyText}>▸ {q.answer.verify}</Text>
							</Pressable>
						)}
					</View>
				)}
			</View>
		);
	};

	return (
		<View style={styles.list}>
			{top.map(row)}
			{rest.length > 0 && !more && (
				<Pressable
					onPress={() => setMore(true)}
					accessibilityRole="button"
					style={styles.moreBtn}
				>
					<Text style={styles.more}>{`More questions (${rest.length}) ›`}</Text>
				</Pressable>
			)}
			{more && (
				<>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.chips}
					>
						{themes.map((t) => (
							<Pressable
								key={t}
								onPress={() => {
									setTheme(t);
									onBrowseTheme(t);
								}}
								accessibilityRole="button"
								accessibilityState={{ selected: theme === t }}
								style={[styles.chip, theme === t && styles.chipOn]}
							>
								<Text
									style={[styles.chipText, theme === t && styles.chipTextOn]}
								>
									{THEME_LABELS[t]}
								</Text>
							</Pressable>
						))}
					</ScrollView>
					{browsing.map(row)}
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	list: {
		borderRadius: exploreRadii.sm,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: explore.lineStrong,
		backgroundColor: explore.surface,
		overflow: "hidden",
	},
	row: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: explore.line,
	},
	head: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
		paddingHorizontal: 14,
		paddingVertical: 13,
	},
	q: {
		flex: 1,
		fontSize: 15,
		lineHeight: 21,
		fontWeight: "600",
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	qOpen: { color: explore.brand },
	chev: {
		fontSize: 18,
		lineHeight: 21,
		color: explore.muted,
		fontFamily: fonts.ui,
	},
	body: { paddingHorizontal: 14, paddingBottom: 14 },
	a: {
		fontSize: 14,
		lineHeight: 20.5,
		color: explore.ink2,
		fontFamily: fonts.ui,
	},
	aLine: { marginTop: 2 },
	basis: {
		marginTop: 10,
		fontSize: 11.5,
		lineHeight: 16.5,
		color: explore.muted,
		fontFamily: fonts.ui,
	},
	basisLabel: { fontWeight: "700", letterSpacing: 0.3 },
	link: { color: explore.ink2, textDecorationLine: "underline" },
	verify: {
		alignSelf: "flex-start",
		marginTop: 10,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		backgroundColor: explore.posBg,
	},
	verifyText: {
		fontSize: 12.5,
		fontWeight: "600",
		color: explore.posInk,
		fontFamily: fonts.ui,
	},
	moreBtn: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: explore.line,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	more: {
		fontSize: 13.5,
		fontWeight: "600",
		color: explore.brand,
		fontFamily: fonts.ui,
	},
	chips: {
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: explore.line,
	},
	chip: {
		paddingHorizontal: 11,
		paddingVertical: 6,
		borderRadius: 999,
		backgroundColor: explore.chip,
	},
	chipOn: { backgroundColor: explore.brand },
	chipText: {
		fontSize: 12.5,
		fontWeight: "600",
		color: explore.ink2,
		fontFamily: fonts.ui,
	},
	chipTextOn: { color: explore.surface },
});
