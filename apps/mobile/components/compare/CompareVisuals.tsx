/**
 * The drawn half of the community side-by-side (phase386, owner: "比较页面要
 * 生动一些"): the places' photos as the header, then a card per Explore
 * direction with each place's figure as a bar, a dot on a mile line or a
 * line over the years. The shaping is `lib/community/compare-visuals.ts`.
 *
 * A place wears ONE colour down the page (`compareSeries`, by column). The
 * colour is identity, never a verdict; the key that names each colour stays
 * pinned under the header while the cards scroll.
 *
 * Plain Views, like the Explore charts: the app ships no chart or SVG library.
 */
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useRef } from "react";
import {
	Animated,
	Easing,
	Image,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import type {
	CompareVisuals,
	DistanceRow,
} from "../../lib/community/compare-visuals";
import { colors, compareSeries, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { Lines } from "../community/ExploreCharts";

export interface ComparePlace {
	id: string;
	name: string;
	/** "Cumming, GA" */
	place: string;
	thumbUrl?: string;
	color: string;
}

/** The column's colour. Five slots, and a compare never holds more. */
export function placeColor(index: number): string {
	return compareSeries[index % compareSeries.length] ?? colors.accent;
}

// ─── header ─────────────────────────────────────────────────────────────────

/** The places as photographs, side by side. Tap one to open its page. */
export function CompareHero({
	places,
	onOpen,
}: {
	places: readonly ComparePlace[];
	onOpen: (id: string) => void;
}) {
	const pair = places.length === 2;
	const roomy = places.length <= 3;
	return (
		<View style={[styles.hero, { height: pair ? 208 : roomy ? 172 : 140 }]}>
			{places.map((p) => (
				<Pressable
					key={p.id}
					style={styles.heroCell}
					onPress={() => onOpen(p.id)}
					accessibilityRole="button"
					accessibilityLabel={`Open ${p.name}`}
				>
					{!!p.thumbUrl && (
						<Image
							source={{ uri: p.thumbUrl }}
							style={StyleSheet.absoluteFill}
						/>
					)}
					<LinearGradient
						colors={[colors.cardGradFrom, colors.cardGradTo]}
						style={styles.heroShade}
					/>
					<View style={[styles.heroKey, { backgroundColor: p.color }]} />
					<View style={styles.heroText}>
						<Text
							style={roomy ? styles.heroName : styles.heroNameSm}
							numberOfLines={3}
						>
							{p.name}
						</Text>
						{roomy && !!p.place && (
							<Text style={styles.heroPlace} numberOfLines={1}>
								{p.place}
							</Text>
						)}
					</View>
				</Pressable>
			))}
			{pair && (
				<View style={styles.vs} pointerEvents="none">
					<Text style={styles.vsTxt}>vs</Text>
				</View>
			)}
		</View>
	);
}

/** Which colour is which place — pinned while the cards scroll. */
export function CompareKey({ places }: { places: readonly ComparePlace[] }) {
	return (
		<View style={styles.key}>
			{places.map((p) => (
				<View key={p.id} style={styles.keyItem}>
					<View style={[styles.dot, { backgroundColor: p.color }]} />
					<Text style={styles.keyName} numberOfLines={1}>
						{p.name}
					</Text>
				</View>
			))}
		</View>
	);
}

// ─── marks ──────────────────────────────────────────────────────────────────

/** 0 → 1 once, on mount: bars grow and dots travel out from home. */
function useGrow(delay: number): Animated.Value {
	const v = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		Animated.timing(v, {
			toValue: 1,
			duration: 560,
			delay,
			easing: Easing.out(Easing.cubic),
			// Width and left are layout; the native driver cannot move them.
			useNativeDriver: false,
		}).start();
	}, [v, delay]);
	return v;
}

function Bar({
	pct,
	color,
	index,
}: { pct: number | undefined; color: string; index: number }) {
	const grow = useGrow(index * 90);
	return (
		<View style={styles.track}>
			{pct !== undefined && (
				<Animated.View
					style={[
						styles.fill,
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

/** One place's line in a card: its dot, what the figure is of, the figure. */
function PlaceLine({
	place,
	text,
	value,
	aside,
	children,
}: {
	place: ComparePlace;
	/** What the figure belongs to — a school, a store. Absent: no figure. */
	text: string | undefined;
	value?: string | undefined;
	aside?: string | undefined;
	children?: ReactNode;
}) {
	return (
		<View style={styles.line}>
			<View style={[styles.dot, { backgroundColor: place.color }]} />
			<View style={styles.lineBody}>
				<View style={styles.lineTop}>
					<Text
						style={[styles.lineText, !text && styles.blank]}
						numberOfLines={1}
					>
						{text ?? "—"}
					</Text>
					{!!aside && <Text style={styles.lineAside}>{aside}</Text>}
					{!!value && <Text style={styles.lineValue}>{value}</Text>}
				</View>
				{children}
			</View>
		</View>
	);
}

function Dot({
	miles,
	axisMiles,
	color,
	index,
}: { miles: number; axisMiles: number; color: string; index: number }) {
	const grow = useGrow(index * 90);
	return (
		<Animated.View
			style={[
				styles.mileDot,
				{
					backgroundColor: color,
					left: grow.interpolate({
						inputRange: [0, 1],
						outputRange: ["0%", `${Math.min(100, (miles / axisMiles) * 100)}%`],
					}),
				},
			]}
		/>
	);
}

/** A kind of place: every community's nearest one on a shared mile line. */
function MileRow({
	row,
	places,
}: { row: DistanceRow; places: readonly ComparePlace[] }) {
	return (
		<View style={styles.group}>
			<Text style={styles.groupLabel}>{row.label}</Text>
			<View style={styles.mileAxis}>
				<View style={styles.mileLine} />
				<View style={styles.mileTrack}>
					{row.cells.map((c, i) => {
						const p = places[i];
						return c && p ? (
							<Dot
								key={p.id}
								miles={c.miles}
								axisMiles={row.axisMiles}
								color={p.color}
								index={i}
							/>
						) : null;
					})}
				</View>
			</View>
			<View style={styles.mileEnds}>
				<Text style={styles.mileEnd}>home</Text>
				<Text style={styles.mileEnd}>{row.axisMiles} mi</Text>
			</View>
			{places.map((p, i) => {
				const c = row.cells[i];
				return (
					<PlaceLine
						key={p.id}
						place={p}
						text={c?.name}
						value={c ? `${c.miles} mi` : undefined}
					/>
				);
			})}
		</View>
	);
}

function Card({
	title,
	note,
	children,
}: { title: string; note?: string; children: ReactNode }) {
	return (
		<View style={styles.card}>
			<View style={styles.cardHead}>
				<Text style={styles.cardTitle}>{title}</Text>
				{!!note && <Text style={styles.cardNote}>{note}</Text>}
			</View>
			{children}
		</View>
	);
}

// ─── the cards ──────────────────────────────────────────────────────────────

/** A card per Explore direction, in the page's own order. */
export function CompareCards({
	visuals,
	places,
}: { visuals: CompareVisuals; places: readonly ComparePlace[] }) {
	const { safety, schools, convenience, potential, cost } = visuals;
	const holdingMax = Math.max(
		1,
		...(cost?.holding ?? []).map((h) => h?.usd ?? 0),
	);
	return (
		<>
			{safety && (
				<Card title="Safety" note="the nearest hospital, and the flood zone">
					{safety.rows.map((r) => (
						<MileRow key={r.label} row={r} places={places} />
					))}
					{safety.flood.some(Boolean) && (
						<View style={styles.group}>
							<Text style={styles.groupLabel}>Flood zone</Text>
							{places.map((p, i) => (
								<PlaceLine key={p.id} place={p} text={safety.flood[i]} />
							))}
						</View>
					)}
				</Card>
			)}

			{schools.length > 0 && (
				<Card title="Schools" note="nearby, by their standing in Georgia">
					{schools.map((level) => (
						<View key={level.level} style={styles.group}>
							<Text style={styles.groupLabel}>{level.level}</Text>
							{places.map((p, i) => {
								const c = level.cells[i];
								return (
									<PlaceLine
										key={p.id}
										place={p}
										text={c?.name}
										aside={c?.distance}
										value={c ? `Top ${c.share}%` : undefined}
									>
										<Bar
											pct={c ? 100 - c.share : undefined}
											color={p.color}
											index={i}
										/>
									</PlaceLine>
								);
							})}
						</View>
					))}
				</Card>
			)}

			{convenience.length > 0 && (
				<Card title="Convenience" note="the closest of each kind">
					{convenience.map((r) => (
						<MileRow key={r.label} row={r} places={places} />
					))}
				</Card>
			)}

			{potential && (
				<Card title="Potential" note="what a typical home there is worth">
					<View style={styles.figures}>
						{places.map((p, i) => {
							const c = potential.cells[i];
							return (
								<View key={p.id} style={styles.figureCell}>
									<View
										style={[styles.figureKey, { backgroundColor: p.color }]}
									/>
									<Text
										style={[styles.figure, !c && styles.blank]}
										numberOfLines={1}
										adjustsFontSizeToFit
									>
										{c?.display ?? "—"}
									</Text>
									{!!c && (
										<Text style={styles.figureNote} numberOfLines={3}>
											{[c.area, c.change].filter(Boolean).join(" · ")}
										</Text>
									)}
								</View>
							);
						})}
					</View>
					{potential.years.length > 0 && (
						<>
							<View style={styles.chart}>
								<Lines
									height={112}
									max={potential.max}
									series={potential.series.flatMap((values, i) =>
										values
											? [
													{
														values,
														color: placeColor(i),
														weight: 2.5,
														endDot: true,
													},
												]
											: [],
									)}
								/>
							</View>
							<View style={styles.mileEnds}>
								<Text style={styles.mileEnd}>{potential.years[0]}</Text>
								<Text style={styles.mileEnd}>
									{potential.years[potential.years.length - 1]}
								</Text>
							</View>
						</>
					)}
				</Card>
			)}

			{cost && (
				<Card title="Cost" note="before the mortgage">
					{cost.holding.some(Boolean) && (
						<View style={styles.group}>
							<Text style={styles.groupLabel}>A month to hold a home</Text>
							{places.map((p, i) => {
								const h = cost.holding[i];
								return (
									<PlaceLine
										key={p.id}
										place={p}
										text={h ? p.name : undefined}
										value={h?.display}
									>
										<Bar
											pct={h ? (h.usd / holdingMax) * 100 : undefined}
											color={p.color}
											index={i}
										/>
									</PlaceLine>
								);
							})}
						</View>
					)}
					{cost.dues.some(Boolean) && (
						<View style={styles.group}>
							<Text style={styles.groupLabel}>HOA dues</Text>
							{places.map((p, i) => (
								<PlaceLine
									key={p.id}
									place={p}
									text={cost.dues[i] ? p.name : undefined}
									value={cost.dues[i]}
								/>
							))}
						</View>
					)}
				</Card>
			)}
		</>
	);
}

const DOT = 10;
const MILE_DOT = 16;

const styles = StyleSheet.create({
	hero: {
		flexDirection: "row",
		gap: 3,
		borderRadius: radii.tile,
		overflow: "hidden",
	},
	heroCell: {
		flex: 1,
		backgroundColor: colors.cardPlainTo,
		justifyContent: "flex-end",
	},
	heroShade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "70%",
	},
	heroKey: { position: "absolute", left: 0, right: 0, top: 0, height: 5 },
	heroText: { padding: 10, gap: 2 },
	heroName: { ...textStyles.title2, fontSize: 19, color: colors.onCard },
	heroNameSm: { ...textStyles.headline, fontSize: 12.5, color: colors.onCard },
	heroPlace: { ...textStyles.note, color: colors.onCardDim },
	vs: {
		position: "absolute",
		left: "50%",
		top: "50%",
		width: 36,
		height: 36,
		marginLeft: -18,
		marginTop: -18,
		borderRadius: 18,
		backgroundColor: colors.surface,
		alignItems: "center",
		justifyContent: "center",
	},
	vsTxt: {
		...textStyles.headline,
		fontFamily: textStyles.title2.fontFamily,
		color: colors.ink,
	},

	key: {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: 14,
		rowGap: 4,
		paddingVertical: 10,
		backgroundColor: colors.bg,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	keyItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		flexShrink: 1,
	},
	keyName: {
		...textStyles.footnote,
		fontWeight: "600",
		color: colors.ink,
		flexShrink: 1,
	},
	dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },

	card: {
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 14,
		marginTop: 12,
	},
	cardHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	cardTitle: { ...textStyles.headline, fontSize: 17, color: colors.ink },
	cardNote: { ...textStyles.note, color: colors.ink2, flex: 1 },
	group: { marginTop: 12, gap: 7 },
	groupLabel: { ...textStyles.caption, color: colors.ink2 },

	line: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	lineBody: { flex: 1, gap: 4 },
	lineTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	lineText: { ...textStyles.footnote, color: colors.ink, flex: 1 },
	lineAside: { ...textStyles.note, color: colors.ink2 },
	lineValue: { ...textStyles.footnote, fontWeight: "600", color: colors.ink },
	blank: { color: colors.ink3 },
	track: {
		height: 8,
		borderRadius: 4,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	fill: { height: 8, borderRadius: 4 },

	// The line is inset by half a dot each side, so a place at home or at the
	// axis's end is drawn whole.
	mileAxis: { height: MILE_DOT + 4, justifyContent: "center" },
	mileLine: {
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.surface2,
	},
	mileTrack: {
		position: "absolute",
		left: MILE_DOT / 2,
		right: MILE_DOT / 2,
		top: 2,
		height: MILE_DOT,
	},
	mileDot: {
		position: "absolute",
		top: 0,
		width: MILE_DOT,
		height: MILE_DOT,
		marginLeft: -MILE_DOT / 2,
		borderRadius: MILE_DOT / 2,
		borderWidth: 2,
		borderColor: colors.surface,
	},
	mileEnds: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: -3,
	},
	mileEnd: { ...textStyles.note, fontSize: 10.5, color: colors.ink2 },

	figures: { flexDirection: "row", gap: 10, marginTop: 12 },
	figureCell: { flex: 1, gap: 3 },
	figureKey: { width: 22, height: 4, borderRadius: 2 },
	figure: { ...textStyles.title2, color: colors.ink },
	figureNote: { ...textStyles.note, color: colors.ink2 },
	chart: { marginTop: 14, marginHorizontal: 6 },
});
