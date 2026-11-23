/**
 * The city page's sections, drawn as charts (phase333).
 *
 * Owner: "现在太多文字 又臭又长 重新设计 比如可以用一些图表". Each component
 * here shows its section as a figure and keeps sentences behind a tap. The
 * shaping is `lib/city/page.ts` (pure, tested); these only draw. Plain Views —
 * the app ships no chart or SVG library, and none of these need one.
 */
import type { CityDetailDTO, CitySource } from "@percho/shared/city";
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
	type GlanceTile,
	driveTimes,
	glanceTiles,
	schoolColumns,
	stopLabel,
} from "../../lib/city/page";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** The accent, lightened: the rush-hour share of a drive bar (the city-card demo's `--accentSoft`). */
const RUSH_TINT = "#C9E2D9";

/** "Fortune · 2024" */
const cite = (s: CitySource) => (s.year ? `${s.name} · ${s.year}` : s.name);
/**
 * Open a figure's source (owner 2026-11-15: every ranking links to where it
 * came from). Safari, not an in-app view — the app ships no web-browser module.
 */
const openSource = (url?: string) => {
	if (url) void Linking.openURL(url).catch(() => {});
};
/** The mark on a figure that links out. */
const LINK_MARK = " ↗";

const pct = (value: number, max: number) =>
	`${Math.max(3, Math.round((value / (max || 1)) * 100))}%` as const;

// ─── rankings ───────────────────────────────────────────────────────────────

export function RankingBadges({
	rankings,
}: { rankings: CityDetailDTO["rankings"] }) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.badgeRow}
		>
			{rankings.map((r) => (
				<Pressable
					key={`${r.rank}-${r.title}`}
					style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
					onPress={() => openSource(r.source.url)}
					disabled={!r.source.url}
					accessibilityRole="link"
					accessibilityLabel={`${r.rank} ${r.scope}, ${r.title} — ${cite(r.source)}`}
				>
					<View style={styles.badgeTop}>
						<Text style={styles.badgeRank}>{r.rank}</Text>
						<Text style={styles.badgeScope}>{r.scope}</Text>
					</View>
					<Text style={styles.badgeTitle} numberOfLines={2}>
						{r.title}
					</Text>
					<Text style={styles.badgeSource} numberOfLines={1}>
						{cite(r.source)}
						{r.source.url ? LINK_MARK : ""}
					</Text>
				</Pressable>
			))}
		</ScrollView>
	);
}

// ─── at a glance ────────────────────────────────────────────────────────────

/** A tile that opens its source when it has one. */
function Linked({
	url,
	children,
}: { url?: string; children: React.ReactNode }) {
	if (!url) return <View style={styles.tile}>{children}</View>;
	return (
		<Pressable
			style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
			onPress={() => openSource(url)}
			accessibilityRole="link"
		>
			{children}
		</Pressable>
	);
}

function Tile({ tile, url }: { tile: GlanceTile; url?: string }) {
	switch (tile.kind) {
		case "growth": {
			const max = Math.max(...tile.series.map((p) => p.value), 1);
			const first = tile.series[0];
			const last = tile.series[tile.series.length - 1];
			return (
				<Linked url={url}>
					<Text style={styles.tileLabel}>
						{tile.label}
						{url ? LINK_MARK : ""}
					</Text>
					<Text style={styles.tileValue}>{tile.value}</Text>
					<View style={styles.spark}>
						{tile.series.map((p, i) => (
							<View
								key={p.label}
								style={[
									styles.sparkBar,
									{
										height: `${Math.max(6, (p.value / max) * 100)}%`,
										opacity: 0.35 + (0.65 * (i + 1)) / tile.series.length,
									},
								]}
							/>
						))}
					</View>
					<View style={styles.sparkAxis}>
						<Text style={styles.tileTiny}>{first?.label}</Text>
						<Text style={styles.tileTiny}>{last?.label}</Text>
					</View>
					<Text style={styles.tileTakeaway}>{tile.takeaway}</Text>
				</Linked>
			);
		}
		case "compare": {
			const max = Math.max(tile.city.value, tile.state.value);
			return (
				<Linked url={url}>
					<Text style={styles.tileLabel} numberOfLines={2}>
						{tile.label}
						{url ? LINK_MARK : ""}
					</Text>
					<Text style={styles.tileValue}>{tile.city.display}</Text>
					<View style={styles.pairTrack}>
						<View
							style={[styles.pairCity, { width: pct(tile.city.value, max) }]}
						/>
					</View>
					<View style={styles.pairTrack}>
						<View
							style={[styles.pairState, { width: pct(tile.state.value, max) }]}
						/>
					</View>
					<Text style={styles.tileTiny}>
						{tile.against} {tile.state.display}
					</Text>
					<Text style={styles.tileTakeaway}>{tile.takeaway}</Text>
				</Linked>
			);
		}
		case "share":
			return (
				<View style={styles.tile}>
					<Text style={styles.tileLabel} numberOfLines={2}>
						{tile.label}
					</Text>
					<Text style={styles.tileValue}>{tile.value}</Text>
					<View style={styles.splitTrack}>
						<View style={[styles.splitFill, { width: `${tile.pct}%` }]} />
					</View>
					{!!tile.note && <Text style={styles.tileTiny}>{tile.note}</Text>}
				</View>
			);
		case "stat":
			return (
				<View style={styles.tile}>
					<Text style={styles.tileLabel} numberOfLines={2}>
						{tile.label}
					</Text>
					<Text style={styles.tileValue}>{tile.value}</Text>
					{!!tile.note && <Text style={styles.tileTiny}>{tile.note}</Text>}
				</View>
			);
	}
}

export function GlanceTiles({
	city,
	only,
}: {
	city: CityDetailDTO;
	/** Which tiles to draw — the page shows growth and cost apart from the rest. */
	only?: (tile: GlanceTile) => boolean;
}) {
	return (
		<View style={styles.tiles}>
			{glanceTiles(city)
				.filter((t) => !only || only(t))
				.map((t) => (
					<Tile
						key={`${t.kind}-${t.label}`}
						tile={t}
						url={
							t.kind === "growth"
								? city.growth.source.url
								: t.kind === "compare"
									? city.compare.source.url
									: undefined
						}
					/>
				))}
		</View>
	);
}

// ─── schools ────────────────────────────────────────────────────────────────

export function SchoolLadder({
	education,
}: { education: CityDetailDTO["education"] }) {
	const { columns, colleges } = schoolColumns(education.schools);
	return (
		<View style={styles.card}>
			{columns.length > 0 && (
				<View style={styles.ladder}>
					{columns.map((c) => (
						<View key={c.level} style={styles.ladderCol}>
							<Text style={styles.ladderHead}>{c.heading}</Text>
							{c.schools.map((s, i) => (
								<Pressable
									key={s.name}
									style={({ pressed }) => [
										styles.ladderItem,
										pressed && styles.pressed,
									]}
									onPress={() => openSource(s.source.url)}
									disabled={!s.source.url}
									accessibilityRole="link"
									accessibilityLabel={`${s.name}${s.rank ? `, ${s.rank} in Georgia` : ""} — ${cite(s.source)}`}
								>
									{!!s.rank && (
										<Text
											style={[
												styles.ladderRank,
												i > 0 && styles.ladderRankNext,
											]}
										>
											{s.rank}
										</Text>
									)}
									<Text style={styles.ladderName} numberOfLines={2}>
										{s.name}
										{s.source.url ? LINK_MARK : ""}
									</Text>
								</Pressable>
							))}
						</View>
					))}
				</View>
			)}
			{columns.length > 0 && (
				<Text style={styles.cardFoot}>Rank in Georgia · U.S. News</Text>
			)}
			{/* Why some of "Suwanee's" schools are another county's — one line,
			    where the reader meets them (it was buried in the sources). */}
			{!!education.note && (
				<Text style={styles.cardFoot}>{education.note}</Text>
			)}
			{colleges.map((c) => (
				<Pressable
					key={c.name}
					style={({ pressed }) => [styles.college, pressed && styles.pressed]}
					onPress={() => openSource(c.source.url)}
					disabled={!c.source.url}
					accessibilityRole="link"
				>
					<Text style={styles.collegeTag}>COLLEGE</Text>
					<Text style={styles.collegeName} numberOfLines={1}>
						{c.name}
						{c.source.url ? LINK_MARK : ""}
					</Text>
				</Pressable>
			))}
			{education.rows.length > 0 && (
				<View style={styles.grad}>
					<Text style={styles.gradHead}>{education.measure}</Text>
					{education.rows.map((row) => (
						<View key={row.label} style={styles.gradRow}>
							<Text style={styles.gradName} numberOfLines={1}>
								{row.label}
							</Text>
							<View style={styles.gradTrack}>
								<View
									style={[
										row.baseline ? styles.gradOther : styles.gradFill,
										{ width: `${row.pct}%` },
									]}
								/>
							</View>
							<Text style={styles.gradValue}>{row.display}</Text>
						</View>
					))}
				</View>
			)}
		</View>
	);
}

// ─── history ────────────────────────────────────────────────────────────────

export function HistoryTimeline({
	history,
}: { history: CityDetailDTO["history"] }) {
	const [at, setAt] = useState(history.length - 1);
	const picked = history[at];
	return (
		<View style={styles.card}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.timeline}
			>
				{history.map((e, i) => (
					<Pressable
						key={e.year}
						onPress={() => setAt(i)}
						accessibilityRole="button"
						accessibilityLabel={`${e.year}: ${e.text}`}
						style={styles.stop}
					>
						<Text
							style={[styles.stopYear, i === at && styles.stopYearOn]}
							numberOfLines={1}
						>
							{e.year}
						</Text>
						<View style={styles.stopRail}>
							<View
								style={[styles.stopLine, i === 0 && styles.stopLineFirst]}
							/>
							<View style={[styles.stopDot, i === at && styles.stopDotOn]} />
						</View>
						<Text
							style={[styles.stopLabel, i === at && styles.stopLabelOn]}
							numberOfLines={2}
						>
							{stopLabel(e)}
						</Text>
					</Pressable>
				))}
			</ScrollView>
			{!!picked && <Text style={styles.stopText}>{picked.text}</Text>}
		</View>
	);
}

// ─── getting around ─────────────────────────────────────────────────────────

export function DriveTimes({ rows }: { rows: CityDetailDTO["gettingAround"] }) {
	const { bars, axisMax, notes } = driveTimes(rows);
	const ticks = Array.from({ length: axisMax / 30 + 1 }, (_, i) => i * 30);
	return (
		<View style={styles.card}>
			{bars.map((b) => (
				<View key={b.label} style={styles.drive}>
					<View style={styles.driveHead}>
						<Text style={styles.driveLabel} numberOfLines={1}>
							{b.label}
						</Text>
						<Text style={styles.driveValue}>
							{b.min === b.max ? `${b.min}` : `${b.min}–${b.max}`} min
						</Text>
					</View>
					<View style={styles.driveTrack}>
						<View style={[styles.driveRush, { width: pct(b.max, axisMax) }]} />
						<View style={[styles.driveFree, { width: pct(b.min, axisMax) }]} />
					</View>
				</View>
			))}
			{bars.length > 0 && (
				<View style={styles.axis}>
					{ticks.map((t) => (
						<Text key={t} style={styles.tileTiny}>
							{t}
						</Text>
					))}
				</View>
			)}
			{bars.length > 0 && (
				<View style={styles.legend}>
					<View style={[styles.driveFree, styles.legendSwatch]} />
					<Text style={styles.tileTiny}>off-peak</Text>
					<View style={[styles.driveRush, styles.legendSwatch]} />
					<Text style={styles.tileTiny}>rush hour</Text>
				</View>
			)}
			{notes.length > 0 && (
				<View style={styles.notes}>
					{notes.map((n) => (
						<View key={n.label} style={styles.note}>
							<Text style={styles.noteLabel} numberOfLines={1}>
								{n.label}
							</Text>
							<Text style={styles.noteValue} numberOfLines={1}>
								{n.value}
							</Text>
						</View>
					))}
				</View>
			)}
		</View>
	);
}

// ─── plans, sources ─────────────────────────────────────────────────────────

/** A title that opens to its text. */
function Fold({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	return (
		<View>
			<Pressable
				onPress={() => setOpen((o) => !o)}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				style={styles.foldRow}
			>
				<Text style={styles.foldTitle}>{title}</Text>
				<Text style={styles.foldChevron}>{open ? "–" : "+"}</Text>
			</Pressable>
			{open && <View style={styles.foldBody}>{children}</View>}
		</View>
	);
}

export function PlanList({
	planning,
}: { planning: CityDetailDTO["planning"] }) {
	return (
		<View style={styles.card}>
			{planning.map((p, i) => (
				<View key={p.title} style={i > 0 && styles.divider}>
					<Fold title={p.title}>
						<Text style={styles.foldText}>{p.text}</Text>
					</Fold>
				</View>
			))}
		</View>
	);
}

// ─── styles ─────────────────────────────────────────────────────────────────

const tiny = {
	...textStyles.caption,
	fontSize: 11,
	color: colors.ink3,
	textTransform: "none",
	letterSpacing: 0,
} as const;

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		padding: 14,
	},
	cardFoot: { ...tiny, marginTop: 10 },
	divider: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},

	badgeRow: { gap: 8, paddingRight: 18 },
	badge: {
		width: 148,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		padding: 12,
		gap: 4,
	},
	badgeTop: { flexDirection: "row", alignItems: "baseline", gap: 6 },
	badgeRank: {
		...textStyles.title1,
		color: colors.accent,
		fontVariant: ["tabular-nums"],
	},
	badgeScope: { ...tiny, color: colors.ink2 },
	badgeTitle: {
		...textStyles.footnote,
		fontSize: 13,
		lineHeight: 17,
		fontWeight: "600",
		color: colors.ink,
	},
	badgeSource: tiny,

	tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	tile: {
		flexGrow: 1,
		flexBasis: "45%",
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		padding: 12,
		gap: 4,
	},
	tileLabel: {
		...textStyles.footnote,
		fontSize: 12,
		lineHeight: 15,
		color: colors.ink2,
	},
	tileValue: {
		...textStyles.title1,
		fontSize: 22,
		lineHeight: 27,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	tileTiny: tiny,
	tileTakeaway: {
		...textStyles.footnote,
		fontSize: 12,
		fontWeight: "600",
		color: colors.pos,
	},
	spark: {
		height: 34,
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 4,
		marginTop: 4,
	},
	sparkBar: { flex: 1, borderRadius: 3, backgroundColor: colors.accent },
	sparkAxis: { flexDirection: "row", justifyContent: "space-between" },
	pairTrack: {
		height: 7,
		borderRadius: 4,
		backgroundColor: colors.surface2,
		overflow: "hidden",
		marginTop: 2,
	},
	pairCity: { height: 7, borderRadius: 4, backgroundColor: colors.accent },
	pairState: {
		height: 7,
		borderRadius: 4,
		backgroundColor: colors.seriesMuted,
	},
	splitTrack: {
		height: 10,
		borderRadius: 5,
		backgroundColor: colors.surface2,
		overflow: "hidden",
		marginTop: 4,
	},
	splitFill: { height: 10, backgroundColor: colors.accent },

	ladder: { flexDirection: "row", gap: 10 },
	ladderCol: { flex: 1, gap: 8 },
	ladderHead: { ...textStyles.caption, fontSize: 11, color: colors.ink2 },
	ladderItem: { gap: 1 },
	// Ink, not the accent: the owner asked for school standings in ordinary
	// type, not as green headline figures (2026-11-22).
	ladderRank: {
		...textStyles.title1,
		fontSize: 24,
		lineHeight: 28,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	ladderRankNext: { fontSize: 18, lineHeight: 22, color: colors.ink },
	ladderName: {
		...textStyles.footnote,
		fontSize: 12,
		lineHeight: 15,
		color: colors.ink,
	},
	college: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	collegeTag: {
		...textStyles.caption,
		fontSize: 10,
		color: colors.ink2,
		borderWidth: 1,
		borderColor: colors.ink2,
		borderRadius: radii.pill,
		paddingHorizontal: 7,
		paddingVertical: 2,
		overflow: "hidden",
	},
	collegeName: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
		flexShrink: 1,
	},
	grad: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
		gap: 6,
	},
	gradHead: { ...tiny, color: colors.ink2 },
	gradRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	gradName: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink,
		width: 118,
	},
	gradTrack: {
		flex: 1,
		height: 8,
		borderRadius: 4,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	gradFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
	gradOther: {
		height: 8,
		borderRadius: 4,
		backgroundColor: colors.seriesMuted,
	},
	gradValue: {
		...textStyles.footnote,
		fontSize: 12,
		fontWeight: "700",
		color: colors.ink,
		width: 50,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},

	timeline: { paddingRight: 8 },
	stop: { width: 104, gap: 6 },
	stopYear: {
		...textStyles.footnote,
		fontSize: 12,
		fontWeight: "600",
		color: colors.ink3,
	},
	stopYearOn: { color: colors.accent },
	stopRail: { height: 14, justifyContent: "center" },
	stopLine: {
		position: "absolute",
		left: 0,
		right: 0,
		height: 2,
		backgroundColor: colors.surface2,
	},
	stopLineFirst: { left: 6 },
	stopDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: colors.ink3,
		marginLeft: 1,
	},
	stopDotOn: {
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: colors.accent,
		marginLeft: 0,
	},
	stopLabel: {
		...textStyles.footnote,
		fontSize: 12,
		lineHeight: 15,
		color: colors.ink2,
		paddingRight: 8,
	},
	stopLabelOn: { color: colors.ink, fontWeight: "600" },
	stopText: {
		...textStyles.footnote,
		fontSize: 14,
		lineHeight: 20,
		color: colors.ink,
		marginTop: 12,
		paddingTop: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},

	drive: { marginBottom: 12, gap: 5 },
	driveHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
	driveLabel: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink,
		flexShrink: 1,
	},
	driveValue: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "700",
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	driveTrack: {
		height: 10,
		borderRadius: 5,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	driveRush: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		borderRadius: 5,
		backgroundColor: RUSH_TINT,
	},
	driveFree: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		borderRadius: 5,
		backgroundColor: colors.accent,
	},
	axis: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: -4,
	},
	legend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
	legendSwatch: { position: "relative", width: 14, height: 8 },
	notes: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
		gap: 8,
	},
	note: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
	noteLabel: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink,
		flexShrink: 1,
	},
	noteValue: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink2,
		flexShrink: 1,
	},

	foldRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 10,
		paddingVertical: 10,
	},
	foldTitle: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
		flexShrink: 1,
	},
	foldChevron: {
		fontSize: 18,
		color: colors.ink3,
		width: 18,
		textAlign: "center",
	},
	foldBody: { paddingBottom: 10, gap: 8 },
	foldText: {
		...textStyles.footnote,
		fontSize: 13,
		lineHeight: 19,
		color: colors.ink2,
	},
	pressed: { opacity: 0.6 },
});
