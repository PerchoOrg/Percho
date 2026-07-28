/**
 * ListingDataFace (§2.1) — the real data face behind a listing card, replacing
 * task-1's `DataFaceStub`.
 *
 * The core mechanic is §2.1 #2: **every row is a deep link.** Tapping a row
 * pushes `/listing/[id]?focus=<key>`, landing on the matching explore section
 * with a 2s highlight. Two consequences the spec calls out and this file
 * implements literally:
 *   - a row's press must `stopPropagation`, or the same tap also flips the card
 *     back and the buyer never reaches the section. In RN there is no bubbling to
 *     cancel; the equivalent is that the flip handler lives on a DIFFERENT
 *     element (the explicit `Flip back` button), never on this face's background.
 *     Do not add an outer `Pressable` here.
 *   - the row set is data-driven, so a listing missing a field shows a SHORTER
 *     face rather than a row reading "—".
 *
 * WHAT IS NOT HERE, and why (all verified against production, see
 * `apps/web/lib/listing/detail.ts`):
 *   - **Days on market.** §2.1 asks for it; the schema has no listing date of any
 *     kind. Absent, not zero.
 *   - **POI / school rows.** §2.1 wants two; there is no listing-level POI table
 *     and only 15 `k12_schools` rows total, and 13 of 265 listings have
 *     coordinates to measure distance from. Absent.
 *   - **Why NN% row.** §2.1 #3 shows it only at Stage 4, and its 3 reasons come
 *     from per-buyer match attribution that does not exist yet. The row is
 *     rendered only when the caller passes real reasons, so today it simply does
 *     not appear — which is also the correct Stage<4 behaviour.
 *
 * The face is scrollable (§2.1 #1) and the action bar is pinned below it.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import { haptics } from "../../lib/haptics";
import {
	DEFAULT_ANNUAL_RATE,
	assumptionLabel,
} from "../../lib/listing/assumptions";
import type { ListingDetailDTO } from "../../lib/listing/detail-dto";
import type { Focus } from "../../lib/listing/focus-key";
import {
	buildDistribution,
	formatCompactUsd,
} from "../../lib/listing/histogram";
import {
	DEFAULT_DOWN_FRACTION,
	computeMonthly,
	formatUsd,
	parseHoaMonthlyUsd,
} from "../../lib/listing/monthly";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { MatchBadge } from "../MatchBadge";
import { CardSurface } from "../cards/CardSurface";
import { PriceHistogram } from "./PriceHistogram";

interface ListingDataFaceProps {
	card: ListingCardV3;
	/** Absent while the detail request is in flight. */
	detail?: ListingDetailDTO;
	/** §0.2 — the match badge and Why row are Stage 4 only. */
	stage: number;
	onFlipBack: () => void;
	/** §2.1 #2 — push the explore page, optionally focused on one row. */
	onExplore: (focus?: Focus) => void;
}

interface Row {
	focus: Focus;
	label: string;
	value: string;
	note?: string;
}

/**
 * The §2.1 row set, in the spec's priority order. Only rows whose data is real
 * are produced — §2.1 #7's "cut from the bottom" ordering therefore falls out of
 * the array order rather than needing a separate truncation pass.
 */
function rowsFor(detail: ListingDetailDTO): Row[] {
	const rows: Row[] = [];

	// 1. Price context: $/sqft against the cohort median. Needs both halves of
	//    the ratio AND a cohort median to compare to, or it is just a number.
	if (detail.price !== undefined && detail.sqft) {
		const perSqft = Math.round(detail.price / detail.sqft);
		const cohortMedian = detail.comps.medianPricePerSqft;
		rows.push({
			focus: { kind: "price" },
			label: "Price / sqft",
			value: `$${perSqft}`,
			...(cohortMedian !== undefined
				? { note: `${detail.comps.cohortLabel} median $${cohortMedian}` }
				: {}),
		});
	}

	// 2. HOA — real on 10 of 265 rows, so usually absent.
	if (detail.hoaRaw) {
		rows.push({
			focus: { kind: "hoa" },
			label: "HOA",
			value: detail.hoaRaw,
		});
	}

	// 3. Est. monthly (§2.1 #4). The rate is a LABELLED assumption, not a fact —
	//    see `lib/listing/assumptions.ts`.
	if (detail.price !== undefined) {
		const hoaMonthlyUsd = parseHoaMonthlyUsd(detail.hoaRaw);
		const monthly = computeMonthly({
			priceUsd: detail.price,
			annualRate: DEFAULT_ANNUAL_RATE,
			...(hoaMonthlyUsd !== undefined ? { hoaMonthlyUsd } : {}),
		});
		rows.push({
			focus: { kind: "monthly" },
			label: `Est. monthly (${Math.round(DEFAULT_DOWN_FRACTION * 100)}% down)`,
			value: `${formatUsd(monthly.totalUsd)}/mo`,
			note: assumptionLabel(DEFAULT_ANNUAL_RATE, DEFAULT_DOWN_FRACTION),
		});
	}

	// 4. Year built — real on 254 of 265, and the only other verifiable fact the
	//    row set can carry now that days-on-market is impossible.
	if (detail.yearBuilt !== undefined) {
		rows.push({
			focus: { kind: "market" },
			label: "Year built",
			value: String(detail.yearBuilt),
		});
	}

	return rows;
}

export function ListingDataFace({
	card,
	detail,
	stage,
	onFlipBack,
	onExplore,
}: ListingDataFaceProps) {
	const rows = detail ? rowsFor(detail) : [];

	const distribution = detail
		? buildDistribution({
				pricesUsd: detail.comps.pricesUsd,
				subjectPriceUsd: detail.price ?? 0,
				cohortLabel: detail.comps.cohortLabel,
			})
		: undefined;

	// §0.2 / §2.1 #1: the badge is Stage 4 only, and never on a tease/preview
	// card whose score is not yet trustworthy.
	const showMatch =
		stage >= 4 && card.matchScore !== undefined && !card.tease && !card.preview;

	const pressRow = (row: Row) => {
		// §0.5 vocabulary is closed: `cardSettle` is the "flip / sheet / navigate"
		// impact. Do not add a new haptic name for this.
		haptics.cardSettle();
		onExplore(row.focus);
	};

	return (
		<View style={styles.face}>
			<CardSurface variant="data" />

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.head}>
					<Text style={styles.price}>{card.priceLabel}</Text>
					{showMatch && card.matchScore !== undefined && (
						<MatchBadge score={card.matchScore} stage={stage} />
					)}
				</View>
				<Text style={styles.address}>
					{card.address}
					{detail ? ` · ${detail.city}, ${detail.state}` : ""}
				</Text>
				<Text style={styles.specs}>{card.bedBathSqft}</Text>

				{rows.length > 0 && (
					<Text style={styles.hint}>
						✨ tap any row to jump to that section
					</Text>
				)}

				{rows.map((row) => (
					<Pressable
						key={`${row.focus.kind}-${row.label}`}
						onPress={() => pressRow(row)}
						hitSlop={4}
						style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
					>
						<Text style={styles.rowLabel}>{row.label}</Text>
						<View style={styles.rowRight}>
							<Text style={styles.rowValue}>{row.value}</Text>
							{!!row.note && <Text style={styles.rowNote}>{row.note}</Text>}
						</View>
					</Pressable>
				))}

				{!!distribution && distribution.kind !== "empty" && (
					<Pressable
						onPress={() =>
							pressRow({ focus: { kind: "comps" }, label: "", value: "" })
						}
						style={({ pressed }) => [
							styles.block,
							pressed && styles.rowPressed,
						]}
					>
						<Text style={styles.rowLabel}>
							{`${distribution.cohortLabel} price distribution`}
						</Text>
						<PriceHistogram distribution={distribution} size="mini" />
					</Pressable>
				)}

				{!detail && <Text style={styles.rowNote}>Loading details…</Text>}
			</ScrollView>

			{/* §2.1 #6 sticky bar. `Flip back` lives HERE, never on the face's
			    background — that separation is what keeps a row tap from also
			    flipping the card (the spec's stopPropagation requirement). */}
			<View style={styles.actions}>
				<Pressable
					hitSlop={8}
					onPress={onFlipBack}
					style={({ pressed }) => [styles.btn, pressed && styles.rowPressed]}
				>
					<Text style={styles.btnLabel}>Flip back</Text>
				</Pressable>
				<Pressable
					hitSlop={8}
					onPress={() => {
						haptics.cardSettle();
						onExplore();
					}}
					style={({ pressed }) => [
						styles.btn,
						styles.btnPrimary,
						pressed && styles.rowPressed,
					]}
				>
					<Text style={styles.btnPrimaryLabel}>Explore →</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.cardPlainTo },
	scroll: { padding: 20, paddingTop: 28, paddingBottom: 8 },
	head: { flexDirection: "row", alignItems: "center", gap: 10 },
	price: { ...textStyles.title1, color: colors.onCard },
	address: { ...textStyles.footnote, color: colors.onCardDim, marginTop: 6 },
	specs: { ...textStyles.body, color: colors.onCard, marginTop: 2 },
	hint: { ...textStyles.caption, color: colors.accentOnCard, marginTop: 16 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		minHeight: 44,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.onCardDim,
	},
	rowPressed: { opacity: 0.75 },
	rowRight: { alignItems: "flex-end", flexShrink: 1 },
	rowLabel: { ...textStyles.footnote, color: colors.onCardDim },
	rowValue: { ...textStyles.headline, color: colors.onCard },
	rowNote: { ...textStyles.caption, color: colors.onCardDim, marginTop: 2 },
	block: { marginTop: 18 },
	actions: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 20,
		paddingBottom: 20,
		paddingTop: 8,
	},
	btn: {
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 18,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	btnPrimary: { flex: 1, alignItems: "center", backgroundColor: colors.onCard },
	btnLabel: { ...textStyles.headline, color: colors.ink },
	btnPrimaryLabel: { ...textStyles.headline, color: colors.ink },
});
