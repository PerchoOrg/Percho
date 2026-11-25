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
 * Each card has the form its figure calls for (phase389, owner: "比较的结果
 * 都是线 太单一"): a school's standing is a ring, a single distance is a
 * figure, several distances are bars, a value over the years is a line, and
 * a month's cost is a column stacked by what it is made of.
 *
 * Plain Views, like the Explore charts: the app ships no chart or SVG library.
 */
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
	Animated,
	Image,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	type CompareSection,
	type CompareVisuals,
	type DistanceRow,
	type ShortLine,
	type TextRow,
	sharedFlood,
} from "../../lib/community/compare-visuals";
import { colors, compareSeries, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { Bar, Ring, useGrow } from "../charts/Marks";
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

/**
 * A kind of place: how far each community's nearest one is, a bar a place.
 *
 * It was dots on one shared mile line with the same places listed again
 * underneath (phase386); on the phone that read as two charts of one thing
 * (owner: "有点乱"). One line a place now, the same shape as a school's.
 */
function MileRow({
	row,
	places,
}: { row: DistanceRow; places: readonly ComparePlace[] }) {
	return (
		<View style={styles.group}>
			<Text style={styles.groupLabel}>{row.label}</Text>
			{places.map((p, i) => {
				const c = row.cells[i];
				return (
					<PlaceLine
						key={p.id}
						place={p}
						text={c?.name}
						value={c ? `${c.miles} mi` : undefined}
					>
						<Bar
							pct={c ? (c.miles / row.axisMiles) * 100 : undefined}
							color={p.color}
							index={i}
						/>
					</PlaceLine>
				);
			})}
		</View>
	);
}

/** The few plain lines the comparison opens on — `buildInShort`. */
export function InShort({
	lines,
	places,
}: { lines: readonly ShortLine[]; places: readonly ComparePlace[] }) {
	return (
		<Card title="In short">
			<View style={styles.short}>
				{lines.map((l) => {
					const p = places[l.place];
					return p ? (
						<View key={l.text} style={styles.line}>
							<View
								style={[
									styles.dot,
									styles.shortDot,
									{ backgroundColor: p.color },
								]}
							/>
							<Text style={styles.shortText}>
								<Text style={styles.shortName}>{p.name}</Text>
								{`  ${l.text}`}
							</Text>
						</View>
					) : null;
				})}
			</View>
		</Card>
	);
}

/**
 * A kind of place as figures: how far each community's nearest one is.
 *
 * One number a place needs no chart — the figure is the chart. Safety uses
 * this; Convenience, with a row per kind, keeps the bars.
 */
function MileFigures({
	row,
	places,
}: { row: DistanceRow; places: readonly ComparePlace[] }) {
	return (
		<View style={styles.group}>
			<Text style={styles.groupLabel}>{row.label}</Text>
			<View style={styles.figures}>
				{places.map((p, i) => {
					const c = row.cells[i];
					return (
						<View key={p.id} style={styles.figureCell}>
							<View style={[styles.figureKey, { backgroundColor: p.color }]} />
							<Text
								style={[styles.figure, !c && styles.blank]}
								numberOfLines={1}
								adjustsFontSizeToFit
							>
								{c ? `${c.miles} mi` : "—"}
							</Text>
							{!!c && (
								<Text style={styles.figureNote} numberOfLines={3}>
									{c.name}
								</Text>
							)}
						</View>
					);
				})}
			</View>
		</View>
	);
}

const STACK_H = 132;
/** A part's shade: the place's colour, lighter for each part up the column. */
const partOpacity = (k: number) => Math.max(0.2, 1 - k * 0.26);

/** One place's month as a column, stacked by what it is made of. */
function Stack({
	rows,
	parts,
	height,
	color,
	index,
}: {
	rows: readonly { label: string; usd: number }[];
	/** Every part across the compared places, in a fixed order. */
	parts: readonly string[];
	height: number;
	color: string;
	index: number;
}) {
	const grow = useGrow(index * 90);
	return (
		<Animated.View
			style={[
				styles.stack,
				{
					height: grow.interpolate({
						inputRange: [0, 1],
						outputRange: [0, Math.max(6, height)],
					}),
				},
			]}
		>
			{parts.map((label, k) => {
				const usd = rows.find((r) => r.label === label)?.usd ?? 0;
				return usd > 0 ? (
					<View
						key={label}
						style={{
							flex: usd,
							backgroundColor: color,
							opacity: partOpacity(k),
						}}
					/>
				) : null;
			})}
		</Animated.View>
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

/**
 * Figures as words, one line a place — the city cards' ratings and drive
 * times. A figure every place shares is said once, as the flood zone is.
 */
function TextRows({
	rows,
	places,
}: { rows: readonly TextRow[]; places: readonly ComparePlace[] }) {
	return (
		<>
			{rows.map((r) => {
				const same = sharedFlood(r.cells);
				return (
					<View key={r.label} style={styles.group}>
						<Text style={styles.groupLabel}>{r.label}</Text>
						{same ? (
							<Text style={styles.lineText}>
								{places.length === 2 ? "Both" : `All ${places.length}`}: {same}
							</Text>
						) : (
							places.map((p, i) => (
								<PlaceLine
									key={p.id}
									place={p}
									text={r.cells[i] ? p.name : undefined}
									value={r.cells[i]}
								/>
							))
						)}
					</View>
				);
			})}
		</>
	);
}

// ─── the cards ──────────────────────────────────────────────────────────────

/** A card per Explore direction, in the page's own order. */
export function CompareCards({
	visuals,
	places,
}: { visuals: CompareVisuals; places: readonly ComparePlace[] }) {
	const { safety, schools, convenience, potential, cost } = visuals;
	const texts = (s: CompareSection) => visuals.texts?.[s] ?? [];
	const note = (s: CompareSection, fallback: string) =>
		visuals.notes?.[s] ?? fallback;
	const flood = safety ? sharedFlood(safety.flood) : null;
	const holdingMax = Math.max(
		1,
		...(cost?.holding ?? []).map((h) => h?.usd ?? 0),
	);
	// Every part any place's month has, in the order first listed — a part
	// keeps its shade from one column to the next.
	const holdingParts = [
		...new Set(
			(cost?.holding ?? []).flatMap((h) => h?.rows.map((r) => r.label) ?? []),
		),
	];
	return (
		<>
			{(safety || texts("safety").length > 0) && (
				<Card
					title="Safety"
					note={note("safety", "the nearest hospital, and the flood zone")}
				>
					{safety?.rows.map((r) => (
						<MileFigures key={r.label} row={r} places={places} />
					))}
					{safety?.flood.some(Boolean) && (
						<View style={styles.group}>
							<Text style={styles.groupLabel}>Flood zone</Text>
							{/* The same zone for every place is said once, not once each. */}
							{flood ? (
								<Text style={styles.lineText}>
									{places.length === 2 ? "Both" : `All ${places.length}`}:{" "}
									{flood}
								</Text>
							) : (
								places.map((p, i) => (
									<PlaceLine key={p.id} place={p} text={safety?.flood[i]} />
								))
							)}
						</View>
					)}
					<TextRows rows={texts("safety")} places={places} />
				</Card>
			)}

			{schools.length > 0 && (
				<Card
					title="Schools"
					note={note("schools", "nearby, by their standing in Georgia")}
				>
					{schools.map((level) => (
						<View key={level.level} style={styles.group}>
							<Text style={styles.groupLabel}>{level.level}</Text>
							<View style={styles.columns}>
								{places.map((p, i) => {
									const c = level.cells[i];
									return (
										<View key={p.id} style={styles.column}>
											<Ring
												size={places.length <= 3 ? 72 : 52}
												pct={c ? 100 - c.share : undefined}
												color={p.color}
												index={i}
											>
												{c ? (
													<>
														<Text style={styles.ringTop}>Top</Text>
														<Text style={styles.ringValue}>{c.share}%</Text>
													</>
												) : (
													<Text style={[styles.ringValue, styles.blank]}>
														—
													</Text>
												)}
											</Ring>
											{!!c && (
												<Text style={styles.columnName} numberOfLines={2}>
													{c.name}
												</Text>
											)}
											{!!c?.distance && (
												<Text style={styles.columnNote}>{c.distance}</Text>
											)}
										</View>
									);
								})}
							</View>
						</View>
					))}
				</Card>
			)}

			{(convenience.length > 0 || texts("convenience").length > 0) && (
				<Card
					title="Convenience"
					note={note("convenience", "the closest of each kind")}
				>
					{convenience.map((r) => (
						<MileRow key={r.label} row={r} places={places} />
					))}
					<TextRows rows={texts("convenience")} places={places} />
				</Card>
			)}

			{potential && (
				<Card
					title="Potential"
					note={note("potential", "what a typical home there is worth")}
				>
					<View style={[styles.figures, styles.figuresLead]}>
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
					<TextRows rows={texts("potential")} places={places} />
				</Card>
			)}

			{(cost || texts("cost").length > 0) && (
				<Card title="Cost" note={note("cost", "before the mortgage")}>
					{cost?.holding.some(Boolean) && (
						<View style={styles.group}>
							<Text style={styles.groupLabel}>A month to hold a home</Text>
							<View style={[styles.columns, styles.stacks]}>
								{places.map((p, i) => {
									const h = cost.holding[i];
									return (
										<View key={p.id} style={styles.column}>
											<Text style={[styles.stackValue, !h && styles.blank]}>
												{h?.display ?? "—"}
											</Text>
											{!!h && (
												<Stack
													rows={h.rows}
													parts={holdingParts}
													height={(h.usd / holdingMax) * STACK_H}
													color={p.color}
													index={i}
												/>
											)}
										</View>
									);
								})}
							</View>
							<View style={styles.partKey}>
								{holdingParts.map((label, k) => (
									<View key={label} style={styles.keyItem}>
										<View
											style={[styles.partSwatch, { opacity: partOpacity(k) }]}
										/>
										<Text style={styles.columnNote}>{label}</Text>
									</View>
								))}
							</View>
						</View>
					)}
					{cost?.dues.some(Boolean) && (
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
					<TextRows rows={texts("cost")} places={places} />
				</Card>
			)}
		</>
	);
}

const DOT = 10;

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
	short: { marginTop: 10, gap: 9 },
	shortDot: { marginTop: 5 },
	shortText: { ...textStyles.body, color: colors.ink, flex: 1, lineHeight: 20 },
	shortName: { fontWeight: "600" },
	groupLabel: { ...textStyles.caption, color: colors.ink2 },

	line: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	lineBody: { flex: 1, gap: 4 },
	lineTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	lineText: { ...textStyles.footnote, color: colors.ink, flex: 1 },
	lineAside: { ...textStyles.note, color: colors.ink2 },
	lineValue: { ...textStyles.footnote, fontWeight: "600", color: colors.ink },
	blank: { color: colors.ink3 },

	mileEnds: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: -3,
	},
	mileEnd: { ...textStyles.note, fontSize: 10.5, color: colors.ink2 },

	figures: { flexDirection: "row", gap: 10, marginTop: 4 },
	// Straight under a card's head, with no group label between.
	figuresLead: { marginTop: 12 },

	columns: { flexDirection: "row", gap: 8 },
	column: { flex: 1, alignItems: "center", gap: 4 },
	columnName: {
		...textStyles.note,
		color: colors.ink,
		textAlign: "center",
	},
	columnNote: { ...textStyles.note, fontSize: 11, color: colors.ink2 },
	ringTop: {
		...textStyles.note,
		fontSize: 9.5,
		lineHeight: 11,
		color: colors.ink2,
	},
	ringValue: { ...textStyles.headline, lineHeight: 18, color: colors.ink },

	// Columns stand on one baseline; a part sits 2 pt off the next.
	stacks: { alignItems: "flex-end", marginTop: 2 },
	stack: {
		width: 46,
		borderRadius: 4,
		overflow: "hidden",
		flexDirection: "column-reverse",
		gap: 2,
	},
	stackValue: { ...textStyles.footnote, fontWeight: "600", color: colors.ink },
	partKey: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2 },
	partSwatch: {
		width: 10,
		height: 10,
		borderRadius: 2,
		backgroundColor: colors.ink,
	},
	figureCell: { flex: 1, gap: 3 },
	figureKey: { width: 22, height: 4, borderRadius: 2 },
	figure: { ...textStyles.title2, color: colors.ink },
	figureNote: { ...textStyles.note, color: colors.ink2 },
	chart: { marginTop: 14, marginHorizontal: 6 },
});
