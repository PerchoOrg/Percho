/**
 * The small charts the community explore page is made of (phase339): a line,
 * a strip of stops by distance. Each is drawn twice —
 * small on a tile, full in a sheet — so they live here, apart from both.
 *
 * Plain Views, like `components/city/CityCharts.tsx`: the app ships no chart or
 * SVG library. The geometry is `lib/community/explore.ts` (pure, tested).
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
	NEAR_MILES,
	type NearbyStop,
	type NearbyView,
	pointAt,
	strokes,
} from "../../lib/community/explore";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

// ─── lines ──────────────────────────────────────────────────────────────────

export interface LineSeries {
	values: readonly number[];
	color: string;
	weight: number;
	/** Mark the last point. */
	endDot?: boolean;
}

/** Series over one shared axis that starts at zero and ends at `max`. */
export function Lines({
	height,
	max,
	series,
}: { height: number; max: number; series: readonly LineSeries[] }) {
	const [width, setWidth] = useState(0);
	return (
		<View
			style={{ height }}
			onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
		>
			{width > 0 &&
				series.map((s) => {
					const end = pointAt(
						s.values,
						s.values.length - 1,
						width,
						height,
						max,
					);
					return (
						<View key={s.color} style={StyleSheet.absoluteFill}>
							{strokes(s.values, width, height, max).map((st) => (
								<View
									key={st.cx}
									style={{
										position: "absolute",
										// A piece runs half a weight past each point, so two
										// pieces meet in a round joint rather than a notch.
										left: st.cx - (st.length + s.weight) / 2,
										top: st.cy - s.weight / 2,
										width: st.length + s.weight,
										height: s.weight,
										borderRadius: s.weight / 2,
										backgroundColor: s.color,
										transform: [{ rotate: `${st.angle}rad` }],
									}}
								/>
							))}
							{s.endDot && (
								<View
									style={[
										styles.endDot,
										{
											left: end.x - 5,
											top: end.y - 5,
											backgroundColor: s.color,
										},
									]}
								/>
							)}
						</View>
					);
				})}
		</View>
	);
}

// ─── stops by distance ──────────────────────────────────────────────────────

const along = (miles: number, axisMiles: number) =>
	`${Math.min(100, (miles / axisMiles) * 100)}%` as const;

/** Every stop on one line — the tile's version. */
export function StopStripMini({ view }: { view: NearbyView }) {
	return (
		<View>
			<View style={styles.miniStrip}>
				<View
					style={[
						styles.nearBand,
						{ width: along(NEAR_MILES, view.axisMiles) },
					]}
				/>
				<View style={styles.miniRail} />
				{view.stops.map((s) => (
					<View
						key={s.name}
						style={[styles.miniStop, { left: along(s.miles, view.axisMiles) }]}
					/>
				))}
			</View>
			<View style={styles.miniAxis}>
				<Text style={styles.tiny}>home</Text>
				<Text style={styles.tiny}>{view.axisMiles} mi</Text>
			</View>
		</View>
	);
}

/** One row per kind of stop; tap a dot to read which place it is. */
export function StopStrip({
	view,
	selected,
	onSelect,
}: {
	view: NearbyView;
	selected: NearbyStop | null;
	onSelect: (stop: NearbyStop) => void;
}) {
	const ticks = Array.from({ length: view.axisMiles + 1 }, (_, mi) => mi);
	return (
		<View>
			{view.rows.map((row) => (
				<View key={row.group} style={styles.stopRow}>
					<Text style={styles.stopGroup}>{row.group}</Text>
					<View style={styles.stopTrack}>
						<View
							style={[
								styles.nearBand,
								{ width: along(NEAR_MILES, view.axisMiles) },
							]}
						/>
						{ticks.map((mi) => (
							<View
								key={mi}
								style={[styles.stopTick, { left: along(mi, view.axisMiles) }]}
							/>
						))}
						{row.stops.map((s) => (
							<Pressable
								key={s.name}
								hitSlop={10}
								onPress={() => onSelect(s)}
								accessibilityRole="button"
								accessibilityLabel={`${s.name}, ${s.miles} miles`}
								style={[
									styles.stop,
									{ left: along(s.miles, view.axisMiles) },
									selected?.name === s.name && styles.stopOn,
								]}
							/>
						))}
					</View>
				</View>
			))}
			<View style={styles.stopRow}>
				<View style={styles.stopGroupSpace} />
				<View style={styles.stopAxis}>
					{ticks.map((mi) => (
						<Text
							key={mi}
							style={[
								styles.stopAxisLabel,
								{ left: along(mi, view.axisMiles) },
							]}
						>
							{mi === 0 ? "home" : `${mi} mi`}
						</Text>
					))}
				</View>
			</View>
		</View>
	);
}

const MINI_H = 18;
const MINI_STOP = 7;
const STOP_ROW_H = 32;
const STOP = 14;
const GROUP_W = 92;

const styles = StyleSheet.create({
	endDot: {
		position: "absolute",
		width: 10,
		height: 10,
		borderRadius: 5,
		borderWidth: 2,
		borderColor: colors.surface,
	},

	nearBand: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		borderRadius: 4,
		backgroundColor: colors.accent,
		opacity: 0.08,
	},
	miniStrip: { height: MINI_H, justifyContent: "center" },
	miniRail: { height: 1, backgroundColor: colors.border },
	miniStop: {
		position: "absolute",
		top: (MINI_H - MINI_STOP) / 2,
		width: MINI_STOP,
		height: MINI_STOP,
		marginLeft: -MINI_STOP / 2,
		borderRadius: MINI_STOP / 2,
		backgroundColor: colors.accent,
		opacity: 0.75,
	},
	miniAxis: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 1,
	},
	tiny: {
		...textStyles.footnote,
		fontSize: 10,
		color: colors.ink2,
	},

	stopRow: { flexDirection: "row", alignItems: "center" },
	stopGroup: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "500",
		color: colors.ink,
		width: GROUP_W,
	},
	stopGroupSpace: { width: GROUP_W },
	// The track is inset by half a dot each side, so a stop at 0 or at the
	// axis's end is drawn whole.
	stopTrack: {
		flex: 1,
		height: STOP_ROW_H,
		marginHorizontal: STOP / 2,
	},
	stopTick: {
		position: "absolute",
		top: 0,
		bottom: 0,
		width: StyleSheet.hairlineWidth,
		backgroundColor: colors.border,
	},
	stop: {
		position: "absolute",
		top: (STOP_ROW_H - STOP) / 2,
		width: STOP,
		height: STOP,
		marginLeft: -STOP / 2,
		borderRadius: STOP / 2,
		backgroundColor: colors.accent,
		borderWidth: 2,
		borderColor: colors.surface,
	},
	stopOn: { backgroundColor: colors.ink },
	stopAxis: { flex: 1, height: 18, marginHorizontal: STOP / 2 },
	stopAxisLabel: {
		...textStyles.footnote,
		fontSize: 10.5,
		color: colors.ink2,
		position: "absolute",
		top: 3,
		width: 40,
		marginLeft: -20,
		textAlign: "center",
	},
});
