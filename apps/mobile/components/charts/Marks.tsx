/**
 * The small marks the place pages and the side-by-side draw their figures
 * with (phase390): a bar, a ring, a donut, a row of level pips, a strip of
 * columns, a span on a scale.
 *
 * They began in the neighbourhood comparison (phase386–389). Owner on that
 * screen, 2026-11-24: "把多样的可视化推广到community和city card里的explore界面
 * 里" — so they live here, and each tile picks the mark its figure calls for:
 * a standing out of 100 is a ring, parts of a total are a donut, a distance is
 * a bar, a grade on a fixed scale is pips, a count over the years is columns.
 *
 * Plain Views and RN `Animated`: the app ships no chart or SVG library.
 */
import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors, compareSeries } from "../../theme/tokens";

/** 0 → 1 once, on mount: a mark grows into place. */
export function useGrow(delay = 0): Animated.Value {
	const v = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		Animated.timing(v, {
			toValue: 1,
			duration: 560,
			delay,
			easing: Easing.out(Easing.cubic),
			// Width and height are layout; the native driver cannot move them.
			useNativeDriver: false,
		}).start();
	}, [v, delay]);
	return v;
}

/** The colour of the i-th thing told apart — a compared place, a part of a total. */
export function seriesColor(index: number): string {
	return (
		compareSeries[Math.min(index, compareSeries.length - 1)] ?? colors.accent
	);
}

// ─── bar ────────────────────────────────────────────────────────────────────

/** A horizontal bar filled to `pct`. The track stays when there is no figure. */
export function Bar({
	pct,
	color = colors.accent,
	index = 0,
	height = 8,
}: {
	pct: number | undefined;
	color?: string;
	/** Its place in a run of bars: each starts a beat after the last. */
	index?: number;
	height?: number;
}) {
	const grow = useGrow(index * 90);
	const shape = { height, borderRadius: height / 2 };
	return (
		<View style={[styles.track, shape]}>
			{pct !== undefined && (
				<Animated.View
					style={[
						shape,
						{
							backgroundColor: color,
							width: grow.interpolate({
								inputRange: [0, 1],
								outputRange: ["0%", `${Math.max(3, Math.min(100, pct))}%`],
							}),
						},
					]}
				/>
			)}
		</View>
	);
}

/**
 * A span on a scale: from `from` to `to`, out of `max`. A drive that takes 48
 * minutes off-peak and 72 at rush is one bar that starts at 48 and ends at 72.
 */
export function Span({
	from,
	to,
	max,
	color = colors.accent,
	height = 6,
}: { from: number; to: number; max: number; color?: string; height?: number }) {
	const grow = useGrow();
	const pct = (v: number) => Math.max(0, Math.min(100, (v / (max || 1)) * 100));
	const shape = { height, borderRadius: height / 2 };
	return (
		<View style={[styles.track, shape]}>
			{/* The quiet run up to the shortest time, then the span itself. */}
			<Animated.View
				style={[
					styles.spanLead,
					shape,
					{
						width: grow.interpolate({
							inputRange: [0, 1],
							outputRange: ["0%", `${pct(to)}%`],
						}),
					},
				]}
			/>
			<Animated.View
				style={[
					styles.spanFill,
					shape,
					{
						backgroundColor: color,
						left: `${pct(from)}%`,
						width: grow.interpolate({
							inputRange: [0, 1],
							outputRange: ["0%", `${Math.max(2, pct(to) - pct(from))}%`],
						}),
					},
				]}
			/>
		</View>
	);
}

// ─── ring and donut ─────────────────────────────────────────────────────────

/**
 * An arc from the top, clockwise, to `pct` of the circle.
 *
 * No SVG, so the arc is two half-rings, each turning inside a clip the width
 * of half the circle: the right clip shows the first 180°, the left the rest.
 */
function Arc({
	size,
	weight,
	pct,
	color,
	grow,
}: {
	size: number;
	weight: number;
	pct: number;
	color: string;
	grow: Animated.Value;
}) {
	const angle = Math.max(0, Math.min(100, pct)) * 3.6;
	if (angle <= 0) return null;
	// Where the sweep crosses from the right half into the left.
	const turn = angle > 180 ? 180 / angle : 1;
	const box = { width: size, height: size };
	const half = (rotate: Animated.AnimatedInterpolation<string>) => (
		<Animated.View style={[styles.layer, box, { transform: [{ rotate }] }]}>
			<View style={[styles.clip, { width: size / 2, height: size }]}>
				<View
					style={[
						box,
						{ borderRadius: size / 2, borderWidth: weight, borderColor: color },
					]}
				/>
			</View>
		</Animated.View>
	);
	return (
		<>
			<View
				style={[
					styles.clip,
					styles.layer,
					{ left: size / 2, width: size / 2, height: size },
				]}
			>
				<View style={[styles.layer, box, { left: -size / 2 }]}>
					{half(
						grow.interpolate({
							inputRange: [0, turn, 1],
							outputRange: [
								"0deg",
								`${Math.min(angle, 180)}deg`,
								`${Math.min(angle, 180)}deg`,
							],
						}),
					)}
				</View>
			</View>
			{angle > 180 && (
				<View
					style={[styles.clip, styles.layer, { width: size / 2, height: size }]}
				>
					{half(
						grow.interpolate({
							inputRange: [0, turn, 1],
							outputRange: ["180deg", "180deg", `${angle}deg`],
						}),
					)}
				</View>
			)}
		</>
	);
}

/** A ring filled to `pct`, with its figure inside. */
export function Ring({
	size,
	pct,
	color = colors.accent,
	index = 0,
	children,
}: {
	size: number;
	pct: number | undefined;
	color?: string;
	index?: number;
	children?: ReactNode;
}) {
	const grow = useGrow(index * 90);
	const weight = Math.round(size / 9);
	const box = { width: size, height: size };
	return (
		<View style={box}>
			<View
				style={[
					styles.layer,
					box,
					styles.ringTrack,
					{ borderRadius: size / 2, borderWidth: weight },
				]}
			/>
			<Arc
				size={size}
				weight={weight}
				pct={pct ?? 0}
				color={color}
				grow={grow}
			/>
			<View style={[styles.layer, box, styles.center]}>{children}</View>
		</View>
	);
}

/**
 * Parts of one total, as a ring: each part an arc, clockwise from the top,
 * the total inside.
 *
 * Drawn as arcs from the top to each part's END, the longest first, so each
 * shorter arc covers the start of the one beneath and what shows of every
 * arc is its own part.
 */
export function Donut({
	size,
	parts,
	children,
}: {
	size: number;
	parts: readonly { value: number; color: string }[];
	children?: ReactNode;
}) {
	const grow = useGrow();
	const weight = Math.round(size / 7);
	const box = { width: size, height: size };
	const total = parts.reduce((a, p) => a + p.value, 0) || 1;
	let run = 0;
	const ends = parts.map((p) => {
		run += p.value;
		return { color: p.color, pct: (run / total) * 100 };
	});
	return (
		<View style={box}>
			{[...ends].reverse().map((e) => (
				<Arc
					key={e.color}
					size={size}
					weight={weight}
					pct={e.pct}
					color={e.color}
					grow={grow}
				/>
			))}
			<View style={[styles.layer, box, styles.center]}>{children}</View>
		</View>
	);
}

// ─── pips and columns ───────────────────────────────────────────────────────

/** A grade on a fixed scale: `of` pips, the first `level` of them filled. */
export function Pips({
	level,
	of = 5,
	color = colors.ink,
}: { level: number; of?: number; color?: string }) {
	return (
		<View style={styles.pips}>
			{Array.from({ length: of }, (_, i) => (
				<View
					// A fixed run of identical pips: the position is the identity.
					// biome-ignore lint/suspicious/noArrayIndexKey: see above
					key={i}
					style={[styles.pip, i < level && { backgroundColor: color }]}
				/>
			))}
		</View>
	);
}

/** Counts over time as columns on one baseline; the newest wears the accent. */
export function Columns({
	values,
	height,
}: { values: readonly number[]; height: number }) {
	const grow = useGrow();
	const max = Math.max(1, ...values);
	return (
		<View style={[styles.columns, { height }]}>
			{values.map((v, i) => (
				<Animated.View
					// One column a period, in order: the position is the identity.
					// biome-ignore lint/suspicious/noArrayIndexKey: see above
					key={i}
					style={[
						styles.column,
						i === values.length - 1 && styles.columnNow,
						{
							height: grow.interpolate({
								inputRange: [0, 1],
								outputRange: [0, Math.max(3, (v / max) * height)],
							}),
						},
					]}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	track: { backgroundColor: colors.surface2, overflow: "hidden" },
	spanLead: {
		position: "absolute",
		left: 0,
		top: 0,
		backgroundColor: colors.border,
	},
	spanFill: { position: "absolute", top: 0 },

	layer: { position: "absolute", left: 0, top: 0 },
	clip: { overflow: "hidden" },
	ringTrack: { borderColor: colors.surface2 },
	center: { alignItems: "center", justifyContent: "center" },

	pips: { flexDirection: "row", gap: 2 },
	pip: {
		width: 9,
		height: 6,
		borderRadius: 2,
		backgroundColor: colors.surface2,
	},

	columns: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
	column: {
		flex: 1,
		borderTopLeftRadius: 3,
		borderTopRightRadius: 3,
		backgroundColor: colors.seriesMuted,
	},
	columnNow: { backgroundColor: colors.accent },
});
