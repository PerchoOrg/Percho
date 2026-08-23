/**
 * FitCard (phase118 spec §3.4) — the page's signature component.
 *
 * Renders ONLY what `deriveFit` could honestly compute: every trade-off row
 * carries its behavioural attribution, and the screen refuses to mount this
 * card at all when the derivation returned null. No placeholder rows, ever.
 *
 * The trade-off vote is optimistic UI — the button fills on tap, the event is
 * queued behind it (the queue is offline-durable, so "report later" is free).
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FitResult } from "../../../lib/listing/fit";
import { explore, exploreRadii, fonts, radii } from "../../../theme/tokens";

export interface FitCardProps {
	fit: FitResult;
	vote: "worth" | "not" | null;
	onVote: (value: "worth" | "not") => void;
}

function Row({ pos, text, why }: { pos: boolean; text: string; why?: string }) {
	return (
		<View style={styles.row}>
			<View style={[styles.dot, pos ? styles.dotPos : styles.dotNeg]}>
				<Text
					style={[
						styles.dotGlyph,
						pos ? styles.dotGlyphPos : styles.dotGlyphNeg,
					]}
				>
					{pos ? "✓" : "!"}
				</Text>
			</View>
			<View style={styles.rowText}>
				<Text style={styles.text}>{text}</Text>
				{!!why && <Text style={styles.why}>{why}</Text>}
			</View>
		</View>
	);
}

export function FitCard({ fit, vote, onVote }: FitCardProps) {
	return (
		<View style={styles.card}>
			<View style={styles.head}>
				<Text style={styles.title}>How it fits you</Text>
				<Text style={styles.headNote}>
					from {fit.seenCount} homes you've seen
				</Text>
			</View>
			{fit.matches.map((m) => (
				<Row
					key={m.text}
					pos
					text={m.text}
					{...(m.why ? { why: m.why } : {})}
				/>
			))}
			{fit.tradeoffs.map((t) => (
				<Row
					key={t.text}
					pos={false}
					text={t.text}
					{...(t.why ? { why: t.why } : {})}
				/>
			))}

			{fit.question && (
				<View style={styles.tradeoff}>
					<Text style={styles.prompt}>{fit.question.prompt}</Text>
					<View style={styles.btns}>
						{(
							[
								{ value: "worth", label: "Worth it" },
								{ value: "not", label: "Not worth it" },
							] as const
						).map((b) => {
							const chosen = vote === b.value;
							return (
								<Pressable
									key={b.value}
									onPress={() => onVote(b.value)}
									style={[styles.voteBtn, chosen && styles.voteBtnChosen]}
								>
									<Text
										style={[styles.voteLabel, chosen && styles.voteLabelChosen]}
									>
										{b.label}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: explore.surface,
		borderRadius: exploreRadii.card,
		paddingHorizontal: 16,
		paddingTop: 17,
		paddingBottom: 16,
		shadowColor: explore.ink,
		shadowOpacity: 0.055,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 4 },
		elevation: 2,
	},
	head: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		marginBottom: 14,
	},
	title: {
		fontSize: 15,
		fontWeight: "700",
		letterSpacing: -0.2,
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	headNote: { fontSize: 11, color: explore.muted, fontFamily: fonts.ui },
	row: { flexDirection: "row", gap: 9, marginBottom: 10 },
	dot: {
		width: 17,
		height: 17,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 1,
	},
	dotPos: { backgroundColor: explore.posBg },
	dotNeg: { backgroundColor: explore.negBg },
	dotGlyph: { fontSize: 9.5, fontWeight: "800" },
	dotGlyphPos: { color: explore.posInk },
	dotGlyphNeg: { color: explore.negInk },
	rowText: { flex: 1 },
	text: {
		fontSize: 13,
		lineHeight: 18.5,
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	why: {
		fontSize: 11,
		lineHeight: 15,
		color: explore.muted,
		marginTop: 3,
		fontFamily: fonts.ui,
	},
	tradeoff: {
		marginTop: 15,
		paddingTop: 15,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: explore.line,
	},
	prompt: {
		fontSize: 12.5,
		lineHeight: 18,
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	btns: { flexDirection: "row", gap: 8, marginTop: 11 },
	voteBtn: {
		flex: 1,
		minHeight: 36,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: explore.lineStrong,
	},
	voteBtnChosen: { backgroundColor: explore.brand, borderColor: explore.brand },
	voteLabel: {
		fontSize: 12.5,
		fontWeight: "600",
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	voteLabelChosen: { color: explore.surface },
});
