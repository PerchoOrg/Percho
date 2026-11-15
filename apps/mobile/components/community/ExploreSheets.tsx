/**
 * What a tile on the community explore page opens (phase339): the full chart
 * behind the tile's finding, in a bottom sheet.
 *
 * The page is one screen because nobody reads eight sections (owner
 * 2026-11-15); the charts that prove each finding live here, on demand.
 */
import type { CommunityProfile } from "@percho/shared/community-profile";
import { useState } from "react";
import {
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	type EventView,
	NEAR_MILES,
	type NearbyStop,
	type NearbyView,
	axisTop,
	rankGroups,
	usdShort,
} from "../../lib/community/explore";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { Lines, RankTrack, StopStrip } from "./ExploreCharts";

export type ExploreSheetKey =
	| "ranks"
	| "homeValue"
	| "dues"
	| "nearby"
	| "words"
	| "events";

const open = (url: string) => void Linking.openURL(url).catch(() => {});
const LINK_MARK = " ↗";

function Ranks({ ranks }: { ranks: NonNullable<CommunityProfile["ranks"]> }) {
	return (
		<>
			<Text style={styles.title}>Where it ranks</Text>
			<View style={styles.block}>
				{rankGroups(ranks.rows).map((g) => (
					<View key={g.group}>
						<Text style={styles.group}>{g.group}</Text>
						{g.rows.map((r) => (
							<View key={r.label} style={styles.rankRow}>
								<View style={styles.rankLeft}>
									<Text style={styles.rowTitle}>{r.label}</Text>
									{!!r.note && <Text style={styles.rowNote}>{r.note}</Text>}
								</View>
								<View style={styles.rankTrack}>
									<RankTrack
										percentile={r.percentile}
										{...(r.percentile2 !== undefined
											? { percentile2: r.percentile2 }
											: {})}
									/>
								</View>
								<View style={styles.rankRight}>
									<Text style={styles.rankValue}>{r.rank}</Text>
									<Text style={styles.rowNote}>{r.of}</Text>
								</View>
							</View>
						))}
					</View>
				))}
				<View style={styles.rankRow}>
					<View style={styles.rankLeft} />
					<View style={[styles.rankTrack, styles.ends]}>
						<Text style={styles.rowNote}>lowest</Text>
						<Text style={styles.rowNote}>highest</Text>
					</View>
					<View style={styles.rankRight} />
				</View>
				<Text style={styles.caption}>
					The dot is this community; the tick is the median.
				</Text>
			</View>
			{(ranks.schools?.length ?? 0) > 0 && (
				<View style={styles.links}>
					{ranks.schools?.map((s) => (
						<Pressable
							key={s.url}
							hitSlop={6}
							onPress={() => open(s.url)}
							accessibilityRole="link"
						>
							<Text style={styles.link}>
								{s.name}
								{LINK_MARK}
							</Text>
						</Pressable>
					))}
				</View>
			)}
			{!!ranks.note && <Text style={styles.caption}>{ranks.note}</Text>}
		</>
	);
}

function HomeValue({
	homeValue,
}: { homeValue: NonNullable<CommunityProfile["homeValue"]> }) {
	const { series, holding } = homeValue;
	const values = series.map((p) => p.value);
	const baseline = series.map((p) => p.baseline);
	const max = axisTop([...values, ...baseline]);
	const first = series[0];
	const last = series[series.length - 1];
	const mid = series[Math.floor((series.length - 1) / 2)];
	const total = holding?.rows.reduce((a, r) => a + r.usd, 0) ?? 0;
	// Where a line ends, as a share of the chart's height from the top.
	const endAt = (v: number) => `${(1 - v / max) * 100}%` as const;
	return (
		<>
			<Text style={styles.title}>{homeValue.headline}</Text>
			<View style={styles.block}>
				<View style={styles.chart}>
					<View style={styles.plot}>
						{[max, max / 2].map((v) => (
							<View key={v} style={[styles.gridline, { top: endAt(v) }]}>
								<Text style={styles.gridLabel}>{usdShort(v)}</Text>
							</View>
						))}
						<View style={styles.baselineRule} />
						<Lines
							height={CHART_H}
							max={max}
							series={[
								{
									values: baseline,
									color: colors.ink3,
									weight: 2,
									endDot: true,
								},
								{ values, color: colors.accent, weight: 2.5, endDot: true },
							]}
						/>
					</View>
					{last && (
						<>
							<Text style={[styles.endValue, { top: endAt(last.value) }]}>
								{usdShort(last.value)}
							</Text>
							<Text
								style={[
									styles.endValue,
									styles.endBaseline,
									{ top: endAt(last.baseline) },
								]}
							>
								{usdShort(last.baseline)}
							</Text>
						</>
					)}
				</View>
				<View style={styles.years}>
					<Text style={styles.rowNote}>{first?.year}</Text>
					<Text style={styles.rowNote}>{mid?.year}</Text>
					<Text style={styles.rowNote}>{last?.year}</Text>
				</View>
				<View style={styles.key}>
					<View style={[styles.keyDot, { backgroundColor: colors.accent }]} />
					<Text style={styles.rowNote}>{homeValue.area}</Text>
					<View
						style={[
							styles.keyDot,
							styles.keyGap,
							{ backgroundColor: colors.ink3 },
						]}
					/>
					<Text style={styles.rowNote}>{homeValue.baseline}</Text>
				</View>
			</View>
			{holding && (
				<View style={styles.block}>
					<Text style={styles.big}>{holding.display}</Text>
					<Text style={styles.caption}>{holding.basis}</Text>
					<View style={styles.costBar}>
						{holding.rows.map((r, i) => (
							<View
								key={r.label}
								style={[
									styles.costPart,
									{ flex: r.usd / (total || 1) },
									i === 0 && styles.costLead,
								]}
							/>
						))}
					</View>
					{holding.rows.map((r, i) => (
						<View key={r.label} style={styles.costRow}>
							<View style={[styles.costSwatch, i === 0 && styles.costLead]} />
							<Text style={styles.costLabel}>
								{r.label}
								{!!r.note && (
									<Text style={styles.rowNote}>{`  ${r.note}`}</Text>
								)}
							</Text>
							<Text style={styles.costValue}>${r.usd}</Text>
						</View>
					))}
				</View>
			)}
		</>
	);
}

function Dues({ dues }: { dues: NonNullable<CommunityProfile["dues"]> }) {
	return (
		<>
			<Text style={styles.title}>{dues.headline}</Text>
			<View style={styles.columns}>
				<View style={[styles.block, styles.column]}>
					<Text style={[styles.columnHead, styles.pos]}>In your dues</Text>
					<Text style={styles.amount}>
						{dues.display}
						<Text style={styles.rowNote}>{`  ${dues.period}`}</Text>
					</Text>
					{dues.included.map((it) => (
						<View key={it.title} style={styles.item}>
							<Text style={styles.rowTitle}>{it.title}</Text>
							{!!it.note && <Text style={styles.rowNote}>{it.note}</Text>}
						</View>
					))}
				</View>
				<View style={[styles.block, styles.column]}>
					<Text style={[styles.columnHead, styles.accent]}>
						Separate, optional
					</Text>
					<Text style={styles.amount}>
						Extra
						<Text style={styles.rowNote}>{"  ask each"}</Text>
					</Text>
					{dues.separate.map((it) => (
						<View key={it.title} style={styles.item}>
							<Text style={styles.rowTitle}>{it.title}</Text>
							{!!it.note && <Text style={styles.rowNote}>{it.note}</Text>}
							{!!it.url && (
								<Pressable
									hitSlop={6}
									onPress={() => it.url && open(it.url)}
									accessibilityRole="link"
								>
									<Text style={[styles.link, styles.itemLink]}>
										Its site{LINK_MARK}
									</Text>
								</Pressable>
							)}
						</View>
					))}
				</View>
			</View>
		</>
	);
}

function Nearby({ view }: { view: NearbyView }) {
	const [stop, setStop] = useState<NearbyStop | null>(null);
	return (
		<>
			<Text style={styles.title}>
				{view.near} of {view.stops.length} stops in the film are within{" "}
				{NEAR_MILES} miles
			</Text>
			<View style={styles.block}>
				<StopStrip view={view} selected={stop} onSelect={setStop} />
				<Text style={styles.caption}>
					{stop ? `${stop.name} · ${stop.miles} mi` : "Tap a dot."}
				</Text>
			</View>
		</>
	);
}

function Words({
	words,
	interests,
}: {
	words: NonNullable<CommunityProfile["words"]>;
	interests: readonly string[];
}) {
	return (
		<>
			<Text style={styles.title}>What residents say</Text>
			<View style={styles.block}>
				{words.rows.map((w, i) => (
					<View key={w.word} style={styles.wordRow}>
						<Text style={[styles.word, i < 3 && styles.wordLead]}>
							{w.word}
						</Text>
						<View style={styles.wordTrack}>
							<View
								style={[
									styles.wordBar,
									{ width: `${Math.max(3, w.pct)}%` },
									i < 3 && styles.wordBarLead,
								]}
							/>
						</View>
						<Text style={[styles.wordPct, i < 3 && styles.wordLead]}>
							{w.pct}%
						</Text>
					</View>
				))}
				<Text style={styles.caption}>
					Share of {words.scope} whose residents use the same word. Shorter is
					more theirs.
				</Text>
			</View>
			{interests.length > 0 && (
				<>
					<Text style={styles.group}>What they are into</Text>
					<View style={styles.chips}>
						{interests.map((it) => (
							<View key={it} style={styles.chip}>
								<Text style={styles.chipText}>{it}</Text>
							</View>
						))}
					</View>
				</>
			)}
		</>
	);
}

function Events({ events }: { events: readonly EventView[] }) {
	return (
		<>
			<Text style={styles.title}>Coming up</Text>
			<View style={styles.block}>
				{events.map((e, i) => (
					<Pressable
						key={e.key}
						style={[styles.event, i > 0 && styles.eventRule]}
						onPress={() => e.url && open(e.url)}
						disabled={!e.url}
						accessibilityRole={e.url ? "link" : "text"}
					>
						<View style={styles.date}>
							<Text style={styles.dateMonth}>{e.month}</Text>
							<Text style={styles.dateDay}>{e.day}</Text>
						</View>
						<View style={styles.eventText}>
							<Text style={styles.rowTitle}>{e.title}</Text>
							<Text style={styles.rowNote}>
								{e.when} · {e.where}
							</Text>
						</View>
						{!!e.url && <Text style={styles.link}>↗</Text>}
					</Pressable>
				))}
			</View>
		</>
	);
}

/** The body of the sheet a tile opens. */
export function ExploreSheet({
	which,
	profile,
	nearby,
	events,
	interests,
}: {
	which: ExploreSheetKey;
	profile: CommunityProfile;
	nearby: NearbyView | null;
	events: readonly EventView[];
	interests: readonly string[];
}) {
	return (
		<ScrollView
			contentContainerStyle={styles.body}
			showsVerticalScrollIndicator={false}
		>
			{which === "ranks" && profile.ranks && <Ranks ranks={profile.ranks} />}
			{which === "homeValue" && profile.homeValue && (
				<HomeValue homeValue={profile.homeValue} />
			)}
			{which === "dues" && profile.dues && <Dues dues={profile.dues} />}
			{which === "nearby" && nearby && <Nearby view={nearby} />}
			{which === "words" && profile.words && (
				<Words words={profile.words} interests={interests} />
			)}
			{which === "events" && <Events events={events} />}
		</ScrollView>
	);
}

const CHART_H = 150;
const END_LABEL_W = 50;

const styles = StyleSheet.create({
	body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 36 },
	title: { ...textStyles.title2, color: colors.ink, marginBottom: 12 },
	// The sheet is white; its blocks are the page's paper, recessed.
	block: {
		backgroundColor: colors.bg,
		borderRadius: radii.btn,
		padding: 14,
		marginBottom: 10,
	},
	group: {
		...textStyles.caption,
		fontSize: 10.5,
		color: colors.ink2,
		marginTop: 6,
		marginBottom: 2,
	},
	caption: {
		...textStyles.footnote,
		fontSize: 12,
		lineHeight: 17,
		color: colors.ink2,
		marginTop: 8,
	},
	rowTitle: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
	},
	rowNote: { ...textStyles.footnote, fontSize: 11.5, color: colors.ink2 },
	link: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "500",
		color: colors.accent,
	},
	links: {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: 14,
		rowGap: 8,
		marginTop: 2,
	},

	rankRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 7,
	},
	rankLeft: { width: 96 },
	rankTrack: { flex: 1 },
	rankRight: { width: 86, alignItems: "flex-end" },
	rankValue: {
		...textStyles.headline,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	ends: { flexDirection: "row", justifyContent: "space-between" },

	chart: { height: CHART_H, marginTop: 6 },
	plot: {
		position: "absolute",
		left: 0,
		right: END_LABEL_W,
		top: 0,
		bottom: 0,
	},
	gridline: {
		position: "absolute",
		left: 0,
		right: 0,
		height: StyleSheet.hairlineWidth,
		backgroundColor: colors.border,
	},
	gridLabel: {
		...textStyles.footnote,
		fontSize: 10,
		color: colors.ink2,
		position: "absolute",
		left: 0,
		top: 2,
	},
	baselineRule: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: StyleSheet.hairlineWidth,
		backgroundColor: colors.border,
	},
	endValue: {
		...textStyles.footnote,
		fontSize: 12,
		fontWeight: "700",
		color: colors.ink,
		position: "absolute",
		right: 0,
		width: END_LABEL_W - 8,
		marginTop: -8,
	},
	endBaseline: { fontWeight: "400", color: colors.ink2 },
	years: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginRight: END_LABEL_W,
		marginTop: 6,
	},
	key: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
	keyDot: { width: 10, height: 10, borderRadius: 5 },
	keyGap: { marginLeft: 10 },

	big: { ...textStyles.display, fontSize: 32, color: colors.ink },
	costBar: {
		flexDirection: "row",
		gap: 2,
		height: 14,
		marginTop: 12,
		marginBottom: 8,
	},
	costPart: { backgroundColor: colors.ink3, borderRadius: 3 },
	costLead: { backgroundColor: colors.accent },
	costRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 4,
	},
	costSwatch: {
		width: 10,
		height: 10,
		borderRadius: 3,
		backgroundColor: colors.ink3,
	},
	costLabel: {
		...textStyles.footnote,
		fontSize: 14,
		color: colors.ink,
		flex: 1,
	},
	costValue: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},

	columns: { flexDirection: "row", gap: 10 },
	column: { flex: 1, padding: 12 },
	columnHead: { ...textStyles.caption, fontSize: 10.5 },
	pos: { color: colors.pos },
	accent: { color: colors.accent },
	amount: {
		...textStyles.title2,
		fontSize: 20,
		color: colors.ink,
		marginTop: 2,
		marginBottom: 4,
	},
	item: {
		paddingVertical: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
		gap: 1,
	},
	itemLink: { fontSize: 12, marginTop: 2 },

	wordRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 5,
	},
	word: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "500",
		color: colors.ink,
		width: 100,
	},
	wordLead: { fontWeight: "700", color: colors.ink },
	wordTrack: {
		flex: 1,
		height: 8,
		borderRadius: 4,
		backgroundColor: colors.surface2,
	},
	wordBar: { height: 8, borderRadius: 4, backgroundColor: colors.ink3 },
	wordBarLead: { backgroundColor: colors.accent },
	wordPct: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink2,
		width: 34,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
	chip: {
		paddingHorizontal: 11,
		paddingVertical: 7,
		borderRadius: radii.pill,
		backgroundColor: colors.bg,
	},
	chipText: { ...textStyles.footnote, fontSize: 14, color: colors.ink },

	event: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
	},
	eventRule: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	eventText: { flex: 1, minWidth: 0, gap: 1 },
	date: {
		width: 46,
		height: 50,
		borderRadius: 12,
		backgroundColor: colors.surface,
		alignItems: "center",
		justifyContent: "center",
	},
	dateMonth: {
		...textStyles.caption,
		fontSize: 9.5,
		letterSpacing: 0.8,
		color: colors.accent,
	},
	dateDay: { ...textStyles.title2, fontSize: 19, color: colors.ink },
});
