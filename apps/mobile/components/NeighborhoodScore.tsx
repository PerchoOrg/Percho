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
 * ── Why the ring is drawn with Views and not `react-native-svg` ──────────────
 *
 * The first version imported `Svg`/`Circle`. It crashed on device with
 * "View config getter callback for component `RNSVGCircle` must be a function
 * (received `undefined`)" — the JS package resolves fine, but Expo Go does not
 * carry RNSVG's native view managers, so every element throws at render. The
 * comment in `AskFace` already said svg "is NOT a dependency of this app"; I
 * added one on the assumption Expo Go bundled it, which is wrong. Using it would
 * mean a custom dev client and a native rebuild for a decoration.
 *
 * So the arc is two clipped halves: a half-width `overflow: hidden` window per
 * side, each holding a full-size ring whose top+right borders are coloured (that
 * paints a semicircle, since border corners meet on the diagonals). Rotating
 * those about the circle's centre slides the visible arc. The angles live in
 * `lib/ui/arc.ts` and are unit-tested per quarter.
 */
import { StyleSheet, Text, View } from "react-native";
import type { NeighborhoodScores } from "../lib/feed/card-types";
import { arcRotation } from "../lib/ui/arc";
import { colors, scoreTokens } from "../theme/tokens";
import { textStyles } from "../theme/typography";

interface NeighborhoodScoreProps {
	scores: NeighborhoodScores;
}

const RING = 76;
const STROKE = 6;
/** Tick count for a no-data track. Keys only; the ticks are identical. */
const NA_TICKS = ["a", "b", "c", "d", "e", "f", "g"] as const;

export function NeighborhoodScore({ scores }: NeighborhoodScoreProps) {
	const { overall, dims } = scores;
	// Nothing to show at all — render nothing rather than an empty panel, so the
	// card reflows and no "0.0 / 10" ever appears.
	if (overall == null && dims.every((d) => d.score == null)) return null;

	const pct = overall == null ? 0 : Math.max(0, Math.min(1, overall / 10));
	const spin = (side: "left" | "right") => ({
		transform: [{ rotate: `${arcRotation(pct, side)}deg` }],
	});

	return (
		<View style={styles.wrap}>
			<View style={styles.ringRow}>
				<View style={styles.ring}>
					<View style={styles.ringTrack} />
					{overall != null && (
						<>
							{/* Right window: the first half of the arc, then solid. */}
							<View style={[styles.window, styles.windowRight]}>
								<View style={[styles.arc, styles.arcInRight, spin("right")]} />
							</View>
							{/* Left window: only in play past the halfway mark. */}
							{pct > 0.5 && (
								<View style={[styles.window, styles.windowLeft]}>
									<View style={[styles.arc, spin("left")]} />
								</View>
							)}
						</>
					)}
				</View>
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
				{dims.map((d, i) => {
					const na = d.score == null;
					return (
						<View key={d.key} style={[styles.row, i === 0 && styles.rowFirst]}>
							<Text style={[styles.label, na && styles.dim]} numberOfLines={1}>
								{d.label}
							</Text>
							<View style={[styles.track, na && styles.trackNa]}>
								{na ? (
									/*
									 * The demo hatches an unscored track with a repeating gradient
									 * so it cannot be misread as a zero-length bar. RN has no
									 * gradient without a native dependency, so the hatch is drawn
									 * as evenly spaced ticks — same message, no new dep.
									 */
									<View style={styles.hatch}>
										{NA_TICKS.map((k) => (
											<View key={k} style={styles.tick} />
										))}
									</View>
								) : (
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

	/* ── Ring: a track circle plus up to two clipped, rotated arc halves ────── */
	ring: { width: RING, height: RING },
	/** The full unfilled circle, always visible under the arc. */
	ringTrack: {
		...StyleSheet.absoluteFillObject,
		borderRadius: RING / 2,
		borderWidth: STROKE,
		borderColor: scoreTokens.ringTrack,
	},
	/** Half-width clipping window; the arc inside is only visible through it. */
	window: {
		position: "absolute",
		top: 0,
		width: RING / 2,
		height: RING,
		overflow: "hidden",
	},
	windowLeft: { left: 0 },
	windowRight: { right: 0 },
	/**
	 * A full-size ring with only two borders coloured = a semicircle from 12 to
	 * 6 o'clock. Rotating it about the circle's centre moves the visible arc.
	 */
	arc: {
		position: "absolute",
		top: 0,
		width: RING,
		height: RING,
		borderRadius: RING / 2,
		borderWidth: STROKE,
		borderColor: "transparent",
		borderTopColor: colors.accent,
		borderRightColor: colors.accent,
	},
	/**
	 * The right window's own left edge is at x = RING/2, so the arc has to be
	 * pulled back by that much to keep the SAME centre of rotation as the left one.
	 */
	arcInRight: { left: -RING / 2 },

	ringText: { flex: 1, minWidth: 0 },
	overallRow: { flexDirection: "row", alignItems: "baseline" },
	overall: {
		fontSize: 22,
		lineHeight: 24,
		fontWeight: "600",
		letterSpacing: -0.6,
		color: scoreTokens.ink,
		// Keeps the number from reflowing as it animates/changes between cards.
		fontVariant: ["tabular-nums"],
	},
	outOf: { ...textStyles.caption, color: scoreTokens.ink3 },
	caption: {
		...textStyles.caption,
		marginTop: 3,
		letterSpacing: 1.1,
		textTransform: "uppercase",
		color: scoreTokens.ink3,
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
	/** `.C .li:first-child{border-top:0}` — the list needs no lid. */
	rowFirst: { borderTopWidth: 0 },
	label: {
		flex: 1,
		minWidth: 0,
		...textStyles.footnote,
		color: scoreTokens.ink,
	},
	track: {
		width: 54,
		height: 3,
		borderRadius: 2,
		backgroundColor: scoreTokens.track,
		overflow: "hidden",
	},
	/** An unscored row's track carries ticks, so it gets no solid fill colour. */
	trackNa: { backgroundColor: "transparent" },
	hatch: { flex: 1, flexDirection: "row", alignItems: "center", gap: 3 },
	tick: { flex: 1, height: 3, backgroundColor: scoreTokens.naTick },
	fill: { height: "100%", borderRadius: 2, backgroundColor: scoreTokens.ink2 },
	value: {
		minWidth: 24,
		textAlign: "right",
		...textStyles.footnote,
		fontWeight: "600",
		color: scoreTokens.ink,
		fontVariant: ["tabular-nums"],
	},
	dim: { color: scoreTokens.ink3 },
});
