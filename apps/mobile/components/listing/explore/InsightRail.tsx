/**
 * InsightRail (phase130) — "After you move in", as a horizontal rail of cards.
 *
 * Owner's brief (2026-08-29, on the demo): not Q&A, nothing to read through —
 * small cards that scroll sideways, each carrying its own detail. So a card
 * is: a mark (! + i), the theme, a headline of at most eight words, one
 * sentence of detail, a go-and-see chip when a visit can settle it, and the
 * sources behind a tap. The rail snaps card by card.
 *
 * The rail draws only. Ranking and the summary are `lib/listing/insights.ts`;
 * the affinity bump and every event are the screen's, via callbacks — this
 * file must not know what a focus MEANS (§9.7: the learning channel is
 * never surfaced).
 */
import {
	type InsightKind,
	KIND_LABELS,
	THEME_LABELS,
} from "@percho/shared/insights";
import { useCallback, useRef, useState } from "react";
import {
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewToken,
} from "react-native";
import type { InsightDTO } from "../../../lib/listing/detail-dto";
import type { KindCount } from "../../../lib/listing/insights";
import { explore, exploreRadii, fonts } from "../../../theme/tokens";

/** Card width; the rail shows one card and the edge of the next. */
export const CARD_W = 284;
const GAP = 10;
/** The explore page's horizontal section padding — the rail bleeds into it. */
const EDGE = 18;

const MARK: Record<InsightKind, string> = { watch: "!", plus: "+", know: "i" };

export interface InsightRailProps {
	insights: readonly InsightDTO[];
	summary: readonly KindCount[];
	/** A card became the focused one after a swipe (never fired for the initial card). */
	onFocus: (card: InsightDTO, index: number) => void;
	onVerify: (card: InsightDTO) => void;
	onSource: (card: InsightDTO, basisIndex: number, url: string) => void;
}

function kindOf(card: InsightDTO): InsightKind {
	return card.kind === "watch" || card.kind === "plus" ? card.kind : "know";
}

function Card({
	card,
	onVerify,
	onSource,
}: {
	card: InsightDTO;
	onVerify: () => void;
	onSource: (basisIndex: number, url: string) => void;
}) {
	const [showSources, setShowSources] = useState(false);
	const kind = kindOf(card);
	const themeLabel =
		(THEME_LABELS as Record<string, string>)[card.theme] ?? card.theme;
	return (
		<View
			style={styles.card}
			accessibilityLabel={`${KIND_LABELS[kind]}: ${card.headline}`}
		>
			<View style={styles.top}>
				<View style={[styles.mark, styles[`mark_${kind}`]]}>
					<Text style={[styles.markGlyph, styles[`glyph_${kind}`]]}>
						{MARK[kind]}
					</Text>
				</View>
				<Text style={styles.theme}>{themeLabel.toUpperCase()}</Text>
				<View
					style={styles.weight}
					accessibilityLabel={`weight ${card.decisiveness} of 3`}
				>
					{[1, 2, 3].map((n) => (
						<View
							key={n}
							style={[styles.dot, n <= card.decisiveness && styles.dotOn]}
						/>
					))}
				</View>
			</View>
			<Text style={styles.headline}>{card.headline}</Text>
			<Text style={styles.detail}>{card.detail}</Text>
			<View style={styles.foot}>
				{card.verify ? (
					<Pressable
						onPress={onVerify}
						accessibilityRole="button"
						style={styles.verify}
					>
						<Text style={styles.verifyText}>▸ {card.verify}</Text>
					</Pressable>
				) : (
					<View />
				)}
				<Pressable
					onPress={() => setShowSources((s) => !s)}
					accessibilityRole="button"
					accessibilityState={{ expanded: showSources }}
					hitSlop={8}
				>
					<Text style={styles.sources}>
						{showSources ? "Hide sources" : "Sources"} · {card.basis.length}
					</Text>
				</Pressable>
			</View>
			{showSources && (
				<View style={styles.basis}>
					{card.basis.map((b, i) => (
						<Pressable
							key={`${i}-${b.note}`}
							onPress={() => b.url && onSource(i, b.url)}
							disabled={!b.url}
							accessibilityRole="link"
						>
							<Text style={[styles.basisText, !!b.url && styles.basisLink]}>
								{b.note}
							</Text>
						</Pressable>
					))}
				</View>
			)}
		</View>
	);
}

export function InsightRail({
	insights,
	summary,
	onFocus,
	onVerify,
	onSource,
}: InsightRailProps) {
	const [focused, setFocused] = useState(0);
	// Held in a ref: FlatList keeps the first `onViewableItemsChanged` it is
	// given, so a fresh closure per render would go stale.
	const focusRef = useRef({ focused: 0, onFocus, insights });
	focusRef.current = { focused, onFocus, insights };

	const onViewable = useRef(
		({ viewableItems }: { viewableItems: ViewToken[] }) => {
			const first = viewableItems.find((v) => v.isViewable && v.index !== null);
			if (!first || first.index === null) return;
			const { focused: prev, onFocus: emit, insights: list } = focusRef.current;
			if (first.index === prev) return;
			setFocused(first.index);
			const card = list[first.index];
			if (card) emit(card, first.index);
		},
	).current;
	const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;

	const renderItem = useCallback(
		({ item }: { item: InsightDTO }) => (
			<Card
				card={item}
				onVerify={() => onVerify(item)}
				onSource={(i, url) => onSource(item, i, url)}
			/>
		),
		[onVerify, onSource],
	);

	return (
		<View>
			{summary.length > 0 && (
				<View style={styles.summary}>
					{summary.map((s) => (
						<View key={s.kind} style={[styles.pill, styles[`pill_${s.kind}`]]}>
							<Text style={[styles.pillText, styles[`glyph_${s.kind}`]]}>
								{s.count} {s.label}
							</Text>
						</View>
					))}
				</View>
			)}
			<FlatList
				horizontal
				data={insights}
				keyExtractor={(c) => c.id}
				renderItem={renderItem}
				showsHorizontalScrollIndicator={false}
				snapToInterval={CARD_W + GAP}
				snapToAlignment="start"
				decelerationRate="fast"
				contentContainerStyle={styles.rail}
				style={styles.railBleed}
				onViewableItemsChanged={onViewable}
				viewabilityConfig={viewability}
			/>
			{insights.length > 1 && (
				<View style={styles.pager} accessibilityElementsHidden>
					{insights.map((c, i) => (
						<View
							key={c.id}
							style={[styles.pagerDot, i === focused && styles.pagerDotOn]}
						/>
					))}
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	summary: { flexDirection: "row", gap: 8, marginBottom: 12 },
	pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
	pill_watch: { backgroundColor: explore.negBg },
	pill_plus: { backgroundColor: explore.posBg },
	pill_know: { backgroundColor: explore.chip },
	pillText: { fontSize: 12, fontWeight: "600", fontFamily: fonts.ui },
	railBleed: { marginHorizontal: -EDGE },
	rail: { paddingHorizontal: EDGE, gap: GAP, paddingVertical: 2 },
	card: {
		width: CARD_W,
		backgroundColor: explore.surface,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: explore.lineStrong,
		borderRadius: exploreRadii.tile,
		padding: 14,
		gap: 8,
	},
	top: { flexDirection: "row", alignItems: "center", gap: 7 },
	mark: {
		width: 20,
		height: 20,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	mark_watch: { backgroundColor: explore.negBg },
	mark_plus: { backgroundColor: explore.posBg },
	mark_know: { backgroundColor: explore.chip },
	markGlyph: { fontSize: 11, fontWeight: "800", fontFamily: fonts.ui },
	glyph_watch: { color: explore.negInk },
	glyph_plus: { color: explore.posInk },
	glyph_know: { color: explore.ink2 },
	theme: {
		flex: 1,
		fontSize: 9.5,
		fontWeight: "700",
		letterSpacing: 1.1,
		color: explore.muted,
		fontFamily: fonts.ui,
	},
	weight: { flexDirection: "row", gap: 2 },
	dot: {
		width: 5,
		height: 5,
		borderRadius: 2.5,
		backgroundColor: explore.lineStrong,
	},
	dotOn: { backgroundColor: explore.ink2 },
	headline: {
		fontSize: 16,
		lineHeight: 21,
		fontWeight: "700",
		letterSpacing: -0.2,
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	detail: {
		fontSize: 13,
		lineHeight: 18.5,
		color: explore.ink2,
		fontFamily: fonts.ui,
	},
	foot: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginTop: 2,
	},
	verify: {
		flexShrink: 1,
		paddingHorizontal: 9,
		paddingVertical: 5,
		borderRadius: 999,
		backgroundColor: explore.posBg,
	},
	verifyText: {
		fontSize: 12,
		fontWeight: "600",
		color: explore.posInk,
		fontFamily: fonts.ui,
	},
	sources: {
		fontSize: 12,
		fontWeight: "600",
		color: explore.ink2,
		textDecorationLine: "underline",
		fontFamily: fonts.ui,
	},
	basis: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: explore.line,
		paddingTop: 8,
		gap: 4,
	},
	basisText: {
		fontSize: 11,
		lineHeight: 15,
		color: explore.muted,
		fontFamily: fonts.ui,
	},
	basisLink: { color: explore.ink2, textDecorationLine: "underline" },
	pager: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 4,
		marginTop: 8,
	},
	pagerDot: {
		width: 5,
		height: 5,
		borderRadius: 2.5,
		backgroundColor: explore.lineStrong,
	},
	pagerDotOn: { backgroundColor: explore.ink2 },
});
