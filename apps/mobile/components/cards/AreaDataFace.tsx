/**
 * AreaDataFace (§1.3 #3) — the dark data face behind an area / city / zip card.
 *
 * Renders ONLY datapoints that are actually present on the unit. §1.3 lists
 * price trend, commute anchors and school bands too; those have no real source
 * (PLAN §3 deliberately does not even declare them on `GeoStats`), so they are
 * absent rather than faked. A thin unit therefore shows a short face — that is
 * the intended behavior, not a degraded one.
 *
 * Bottom row per §1.3 #3: `Flip back` (live — the caller flips) and
 * `See on map →`, which is rendered DISABLED with no navigation because its
 * target is task 4's Search tab (PLAN B11). No stub screen, no fake nav.
 *
 * Datapoint taps (§1.3 #3 "每个数据点可点") land on the same Search layer, so
 * they are likewise not wired here.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AreaCardV3 } from "../../lib/feed/card-types";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { CardSurface } from "./CardSurface";

interface AreaDataFaceProps {
	card: AreaCardV3;
	onFlipBack: () => void;
}

interface Row {
	key: string;
	label: string;
	value: string;
	note?: string;
}

function rowsFor(card: AreaCardV3): Row[] {
	const rows: Row[] = [];
	const { unit } = card;

	const median = unit.stats.medianListPrice;
	if (median) {
		rows.push({
			key: "median",
			label: "Median list price",
			value: `$${Math.round(median.value / 1000)}K`,
			note: `${median.sampleSize} listings`,
		});
	}
	if (unit.stats.activeListings !== undefined) {
		rows.push({
			key: "active",
			label: "Active listings",
			value: String(unit.stats.activeListings),
		});
	}
	if (unit.communityCount > 0) {
		rows.push({
			key: "communities",
			label: "Communities",
			value: String(unit.communityCount),
		});
	}
	return rows;
}

export function AreaDataFace({ card, onFlipBack }: AreaDataFaceProps) {
	const { unit } = card;
	const rows = rowsFor(card);

	return (
		<View style={styles.face}>
			<CardSurface />
			<ScrollView contentContainerStyle={styles.scroll}>
				<Text style={styles.eyebrow}>{unit.level}</Text>
				<Text style={styles.title}>
					{unit.name}, {unit.state}
				</Text>
				{!!card.vibe && <Text style={styles.vibe}>{card.vibe}</Text>}

				{rows.map((r) => (
					<View key={r.key} style={styles.row}>
						<Text style={styles.rowLabel}>{r.label}</Text>
						<View style={styles.rowRight}>
							<Text style={styles.rowValue}>{r.value}</Text>
							{!!r.note && <Text style={styles.rowNote}>{r.note}</Text>}
						</View>
					</View>
				))}

				{unit.sampleCommunityNames.length > 0 && (
					<View style={styles.block}>
						<Text style={styles.rowLabel}>Communities inside</Text>
						{unit.sampleCommunityNames.map((name) => (
							<Text key={name} style={styles.sample}>
								{name}
							</Text>
						))}
					</View>
				)}
			</ScrollView>

			<View style={styles.actions}>
				<Pressable
					hitSlop={8}
					onPress={onFlipBack}
					style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
				>
					<Text style={styles.btnLabel}>Flip back</Text>
				</Pressable>
				<View style={[styles.btn, styles.btnDisabled]}>
					<Text style={styles.btnLabelDisabled}>See on map →</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.cardPlainTo },
	scroll: { padding: 20, paddingTop: 28, gap: 2 },
	eyebrow: { ...textStyles.caption, color: colors.accent },
	title: { ...textStyles.title1, color: colors.onCard, marginTop: 6 },
	vibe: { ...textStyles.body, color: colors.onCardDim, marginTop: 8 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.onCardDim,
	},
	rowRight: { alignItems: "flex-end" },
	rowLabel: { ...textStyles.footnote, color: colors.onCardDim },
	rowValue: { ...textStyles.title2, color: colors.onCard },
	rowNote: { ...textStyles.caption, color: colors.onCardDim },
	block: { marginTop: 18, gap: 4 },
	sample: { ...textStyles.body, color: colors.onCard },
	actions: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 20,
		paddingBottom: 20,
	},
	btn: {
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 18,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	btnDisabled: { opacity: 0.4 },
	pressed: { opacity: 0.8 },
	btnLabel: { ...textStyles.headline, color: colors.ink },
	btnLabelDisabled: { ...textStyles.headline, color: colors.ink2 },
});
