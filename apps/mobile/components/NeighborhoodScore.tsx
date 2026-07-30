/**
 * NeighborhoodScore — the four-dimension score panel on the listing card.
 *
 * This is demo variant "C Editorial 环形", picked by the owner on 2026-07-30 out
 * of four candidates: a progress ring carrying the overall number, with the four
 * dimensions listed underneath as label / mini-track / value rows.
 *
 * ── Two things that look like bugs but are the point ─────────────────────────
 *
 * 1. Safety and Potential render as "—", not 0. Their `score` is null because we
 *    hold no crime feed and no sold-price history (checked: no `crime_stats`,
 *    `safety`, `price_history`, `market_stats` or `comps` tables). A zero would
 *    claim the neighbourhood is unsafe; a dash says we don't know. On a
 *    real-estate card that difference is legal, not cosmetic.
 *
 * 2. `overall` averages only the scored dimensions, so it reads 8.3 while two of
 *    four rows are dashes. Averaging nulls as zeros would print 4.15 and slander
 *    every listing until the missing feeds land.
 *
 * ── Ring sizing was a real defect, fixed by measurement ─────────────────────
 *
 * The demo first drew this at 62pt. The maths was correct (83.0% of the arc) but
 * at that diameter the 17% gap is ~7pt of stroke on a 3pt-thick ring, and it
 * read as a closed circle — a progress ring that always looks full is worse than
 * no ring. 76pt with a 6pt stroke makes the gap legible, which is why the size
 * is not a "nice round number".
 *
 * `react-native-svg` was added for this (15.12.1, ships inside Expo Go, so no
 * native rebuild). `Circle` + `strokeDasharray`/`strokeDashoffset` is the only
 * way to draw a partial arc in RN — a rotated bordered `View` can do halves and
 * quarters but not 83%.
 */
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, Text, View } from "react-native";
import type { NeighborhoodScores } from "../lib/feed/card-types";
import { colors, scoreTokens } from "../theme/tokens";
import { textStyles } from "../theme/typography";

interface NeighborhoodScoreProps {
	scores: NeighborhoodScores;
}

const RING = 76;
const STROKE = 6;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function NeighborhoodScore({ scores }: NeighborhoodScoreProps) {
	const { overall, dims } = scores;
	// Nothing to show at all — render nothing rather than an empty panel, so the
	// card reflows and no "0.0 / 10" ever appears.
	if (overall == null && dims.every((d) => d.score == null)) return null;

	const pct = overall == null ? 0 : Math.max(0, Math.min(1, overall / 10));

	return (
		<View style={styles.wrap}>
			<View style={styles.ringRow}>
				<Svg width={RING} height={RING}>
					<Circle
						cx={RING / 2}
						cy={RING / 2}
						r={R}
						stroke={scoreTokens.track}
						strokeWidth={STROKE}
						fill="none"
					/>
					{overall != null && (
						<Circle
							cx={RING / 2}
							cy={RING / 2}
							r={R}
							stroke={colors.accent}
							strokeWidth={STROKE}
							strokeLinecap="round"
							fill="none"
							strokeDasharray={`${CIRC} ${CIRC}`}
							strokeDashoffset={CIRC * (1 - pct)}
							// Start the arc at 12 o'clock instead of 3 o'clock.
							transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
						/>
					)}
				</Svg>
				<View style={styles.ringText}>
					<View style={styles.overallRow}>
						<Text style={styles.overall}>
							{overall == null ? "—" : overall.toFixed(1)}
						</Text>
						<Text style={styles.outOf}> / 10</Text>
					</View>
					<Text style={styles.caption}>Neighborhood</Text>
				</View>
			</View>

			<View style={styles.list}>
				{dims.map((d) => {
					const na = d.score == null;
					return (
						<View key={d.key} style={styles.row}>
							<Text style={[styles.label, na && styles.dim]} numberOfLines={1}>
								{d.label}
							</Text>
							<View style={styles.track}>
								{!na && (
									<View
										style={[styles.fill, { width: `${(d.score ?? 0) * 10}%` }]}
									/>
								)}
							</View>
							<Text style={[styles.value, na && styles.dim]}>
								{na ? "—" : (d.score ?? 0).toFixed(1)}
							</Text>
						</View>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { marginTop: 12 },
	ringRow: { flexDirection: "row", alignItems: "center", gap: 11 },
	ringText: { flex: 1, minWidth: 0 },
	overallRow: { flexDirection: "row", alignItems: "baseline" },
	overall: {
		fontSize: 22,
		lineHeight: 24,
		fontWeight: "600",
		letterSpacing: -0.6,
		color: colors.onCard,
		// Keeps the number from reflowing as it animates/changes between cards.
		fontVariant: ["tabular-nums"],
	},
	outOf: { ...textStyles.caption, color: colors.onCardDim },
	caption: {
		...textStyles.caption,
		marginTop: 3,
		letterSpacing: 1.1,
		textTransform: "uppercase",
		color: colors.onCardDim,
	},
	list: { marginTop: 10 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 6,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: scoreTokens.hairline,
	},
	label: { flex: 1, minWidth: 0, ...textStyles.footnote, color: colors.onCard },
	track: {
		width: 54,
		height: 3,
		borderRadius: 2,
		backgroundColor: scoreTokens.track,
		overflow: "hidden",
	},
	fill: { height: "100%", borderRadius: 2, backgroundColor: scoreTokens.fill },
	value: {
		minWidth: 24,
		textAlign: "right",
		...textStyles.footnote,
		fontWeight: "600",
		color: colors.onCard,
		fontVariant: ["tabular-nums"],
	},
	dim: { color: scoreTokens.faint },
});
