/**
 * `/city/[slug]` — a city: its film, then its fundamentals.
 *
 * The destination of the city card's Explore link (phase327). A city is not a
 * community with a bigger boundary, and this page is not the community page
 * with different data: it answers "what is this place as a whole" — how it
 * ranks, how it compares with its state, where it came from, how fast it grew,
 * its schools, getting around, what is planned. The film is the short answer
 * and plays at the top; the page is where the figures can be read at the
 * reader's own pace, which a film cannot offer (two cuts that tried were
 * rejected as "像ppt").
 *
 * Every figure names its source. There is no safety section, on purpose — see
 * `packages/shared/src/city.ts`.
 *
 * The shape on the wire is `CityDetailDTO`, shared with the server.
 */
import type { CityDetailDTO, CitySource } from "@percho/shared/city";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CityFilm } from "../../components/city/CityFilm";
import { apiBase } from "../../lib/api/base";
import { useSavedStore } from "../../state/saved";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** Schools by level, in the order a family meets them. */
const SCHOOL_LEVELS = [
	["elementary", "Elementary"],
	["middle", "Middle"],
	["high", "High"],
	["college", "College"],
] as const;

/** "Fortune, 2024" */
const cite = (s: CitySource) => (s.year ? `${s.name}, ${s.year}` : s.name);

/** A bar's length as a share of the longest bar in its group. */
const share = (value: number, max: number) =>
	`${Math.max(2, Math.round((value / (max || 1)) * 100))}%` as const;

function Section({
	title,
	note,
	children,
}: { title: string; note?: string; children: React.ReactNode }) {
	return (
		<>
			<View style={styles.sectionRow}>
				<Text style={styles.sectionHead}>{title}</Text>
				{!!note && <Text style={styles.sectionNote}>{note}</Text>}
			</View>
			{children}
		</>
	);
}

export default function CityScreen() {
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const [data, setData] = useState<CityDetailDTO | null>(null);
	const [error, setError] = useState<string | null>(null);

	// A city is saved under the id its feed card carries, so the card's
	// bookmark and this page's are one save.
	const savedId = data?.geoUnitId ? `area-${data.geoUnitId}` : null;
	const saved = useSavedStore((s) => (savedId ? s.isSaved(savedId) : false));
	const toggleSaved = useSavedStore((s) => s.toggle);

	useEffect(() => {
		if (!slug) return;
		let alive = true;
		(async () => {
			try {
				const res = await fetch(
					`${apiBase()}/api/mobile/city/${encodeURIComponent(slug)}`,
				);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = (await res.json()) as CityDetailDTO;
				if (alive) setData(json);
			} catch (e) {
				if (alive) setError(e instanceof Error ? e.message : "failed to load");
			}
		})();
		return () => {
			alive = false;
		};
	}, [slug]);

	if (error) {
		return (
			<View style={[styles.center, { paddingTop: insets.top }]}>
				<Text style={styles.err}>Couldn't load this city.</Text>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Text style={styles.backTxt}>Back</Text>
				</Pressable>
			</View>
		);
	}

	if (!data) {
		return (
			<View style={[styles.center, { paddingTop: insets.top }]}>
				<ActivityIndicator color={colors.accent} />
			</View>
		);
	}

	const where = [data.county ? `${data.county} County` : null, data.state]
		.filter(Boolean)
		.join(", ");
	const growthMax = Math.max(...data.growth.series.map((p) => p.value), 1);

	return (
		<View style={[styles.root, { paddingTop: insets.top }]}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
				showsVerticalScrollIndicator={false}
			>
				<CityFilm
					width={width}
					{...(data.videoUrl ? { videoUrl: data.videoUrl } : {})}
					{...(data.posterUrl ? { posterUrl: data.posterUrl } : {})}
					saved={saved}
					onBack={() => router.back()}
					onToggleSave={() => {
						if (savedId) toggleSaved(savedId, "area");
					}}
				/>

				<View style={styles.body}>
					<View style={styles.headline}>
						<Text style={styles.name}>{data.name}</Text>
						{!!where && <Text style={styles.place}>{where}</Text>}
					</View>
					<Text style={styles.location}>{data.locationNote}</Text>
					<Text style={styles.lead}>{data.summary}</Text>

					{/* Schools first: the question families ask first, at every
					    level (owner 2026-11-15). */}
					{data.education.schools.length > 0 && (
						<Section title="SCHOOLS">
							<View style={styles.card}>
								{SCHOOL_LEVELS.map(([level, heading]) => {
									const schools = data.education.schools.filter(
										(sc) => sc.level === level,
									);
									if (schools.length === 0) return null;
									return (
										<View key={level} style={styles.levelBlock}>
											<Text style={styles.levelHead}>{heading}</Text>
											{schools.map((sc) => (
												<View key={sc.name} style={styles.rankRow}>
													<View style={styles.rankFigure}>
														{sc.rank ? (
															<>
																<Text style={styles.rankValue}>{sc.rank}</Text>
																{!!sc.scope && (
																	<Text style={styles.rankScope}>
																		{sc.scope}
																	</Text>
																)}
															</>
														) : (
															<Text style={styles.rankScope}>{heading}</Text>
														)}
													</View>
													<View style={styles.rankText}>
														<Text style={styles.rowLabel}>{sc.name}</Text>
														<Text style={styles.rowFact}>{sc.detail}</Text>
													</View>
												</View>
											))}
										</View>
									);
								})}
							</View>
						</Section>
					)}

					{data.rankings.length > 0 && (
						<Section title="RANKINGS">
							<View style={styles.card}>
								{data.rankings.map((r, i) => (
									<View
										key={`${r.rank}-${r.title}`}
										style={[styles.rankRow, i > 0 && styles.divider]}
									>
										<View style={styles.rankFigure}>
											<Text style={styles.rankValue}>{r.rank}</Text>
											<Text style={styles.rankScope}>{r.scope}</Text>
										</View>
										<View style={styles.rankText}>
											<Text style={styles.rowLabel}>{r.title}</Text>
											<Text style={styles.rowFact}>{r.detail}</Text>
										</View>
									</View>
								))}
							</View>
						</Section>
					)}

					{data.compare.rows.length > 0 && (
						<Section
							title={`${data.name.toUpperCase()} VS. ${data.compare.against.toUpperCase()}`}
						>
							<View style={[styles.card, styles.cardPad]}>
								{data.compare.rows.map((row) => {
									const max = Math.max(row.city.value, row.state.value);
									return (
										<View key={row.label} style={styles.compareItem}>
											<View style={styles.compareHead}>
												<Text style={styles.compareLabel}>{row.label}</Text>
												<Text style={styles.compareTakeaway}>
													{row.takeaway}
												</Text>
											</View>
											{(
												[
													[data.name, row.city, styles.barCity],
													[data.compare.against, row.state, styles.barOther],
												] as const
											).map(([who, v, fill]) => (
												<View key={who} style={styles.barRow}>
													<Text style={styles.barWho} numberOfLines={1}>
														{who}
													</Text>
													<View style={styles.track}>
														<View
															style={[fill, { width: share(v.value, max) }]}
														/>
													</View>
													<Text style={styles.barValue}>{v.display}</Text>
												</View>
											))}
										</View>
									);
								})}
								<Text style={styles.source}>{cite(data.compare.source)}</Text>
							</View>
						</Section>
					)}

					{data.stats.length > 0 && (
						<Section title="AT A GLANCE">
							<View style={styles.tiles}>
								{data.stats.map((s) => (
									<View key={s.label} style={styles.tile}>
										<Text style={styles.tileLabel}>{s.label}</Text>
										<Text style={styles.tileValue}>{s.value}</Text>
										{!!s.note && <Text style={styles.tileNote}>{s.note}</Text>}
									</View>
								))}
							</View>
						</Section>
					)}

					{data.history.length > 0 && (
						<Section title="HISTORY">
							<View style={[styles.card, styles.cardPad]}>
								{data.history.map((h, i) => (
									<View key={h.year} style={styles.event}>
										<View style={styles.eventRail}>
											<View style={styles.eventDot} />
											{i < data.history.length - 1 && (
												<View style={styles.eventLine} />
											)}
										</View>
										<View style={styles.eventText}>
											<Text style={styles.eventYear}>{h.year}</Text>
											<Text style={styles.eventBody}>{h.text}</Text>
										</View>
									</View>
								))}
							</View>
						</Section>
					)}

					{data.growth.series.length > 1 && (
						<Section title="GROWTH" note={data.growth.takeaway}>
							<View style={[styles.card, styles.cardPad]}>
								<View style={styles.columns}>
									{data.growth.series.map((p) => (
										<View key={p.label} style={styles.column}>
											<Text style={styles.columnValue}>
												{p.value.toLocaleString("en-US")}
											</Text>
											<View
												style={[
													styles.columnBar,
													{ height: Math.max(4, (p.value / growthMax) * 96) },
												]}
											/>
											<Text style={styles.columnLabel}>{p.label}</Text>
										</View>
									))}
								</View>
								<Text style={styles.source}>
									Residents · {cite(data.growth.source)}
								</Text>
							</View>
						</Section>
					)}

					{data.education.rows.length > 0 && (
						<Section title="GRADUATION" note={data.education.measure}>
							<View style={[styles.card, styles.cardPad]}>
								{data.education.rows.map((row) => (
									<View key={row.label} style={styles.barRow}>
										<Text style={styles.barWhoWide} numberOfLines={1}>
											{row.label}
										</Text>
										<View style={styles.track}>
											<View
												style={[
													row.baseline ? styles.barOther : styles.barCity,
													{ width: share(row.pct, 100) },
												]}
											/>
										</View>
										<Text style={styles.barValueNarrow}>{row.display}</Text>
									</View>
								))}
								<Text style={styles.source}>{data.education.note}</Text>
							</View>
						</Section>
					)}

					{data.gettingAround.length > 0 && (
						<Section title="GETTING AROUND">
							<View style={styles.card}>
								{data.gettingAround.map((g, i) => (
									<View
										key={g.label}
										style={[styles.pairRow, i > 0 && styles.divider]}
									>
										<Text style={styles.pairLabel}>{g.label}</Text>
										<Text style={styles.pairValue}>{g.value}</Text>
									</View>
								))}
							</View>
						</Section>
					)}

					{data.planning.length > 0 && (
						<Section title="WHAT'S PLANNED">
							<View style={styles.card}>
								{data.planning.map((p, i) => (
									<View
										key={p.title}
										style={[styles.planRow, i > 0 && styles.divider]}
									>
										<Text style={styles.rowLabel}>{p.title}</Text>
										<Text style={styles.rowFact}>{p.text}</Text>
									</View>
								))}
							</View>
						</Section>
					)}

					{data.sources.length > 0 && (
						<Text style={styles.credit}>
							Sources: {data.sources.map(cite).join(" · ")}
						</Text>
					)}
					{data.credits.google.length > 0 && (
						<Text style={styles.credit}>
							Film photos: Google Maps contributors{" "}
							{data.credits.google.join(", ")}
						</Text>
					)}
					{data.credits.commons.length > 0 && (
						<Text style={styles.credit}>
							Wikimedia Commons:{" "}
							{data.credits.commons.map((c, i) => (
								<Text
									key={c.url}
									style={styles.creditLink}
									onPress={() => void Linking.openURL(c.url).catch(() => {})}
								>
									{i > 0 ? ", " : ""}
									{c.author}
									{c.licence ? ` (${c.licence})` : ""}
								</Text>
							))}
						</Text>
					)}
				</View>
			</ScrollView>
		</View>
	);
}

const hairline = {
	borderTopWidth: StyleSheet.hairlineWidth,
	borderTopColor: colors.border,
} as const;

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.bg },
	center: {
		flex: 1,
		backgroundColor: colors.bg,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
	},
	err: { ...textStyles.footnote, fontSize: 15, color: colors.ink2 },
	backBtn: {
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: radii.pill,
		backgroundColor: colors.cta,
	},
	backTxt: { ...textStyles.footnote, color: colors.surface },

	body: { paddingHorizontal: 18, paddingTop: 20 },
	headline: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 10,
	},
	name: { ...textStyles.title1, color: colors.ink, flexShrink: 1 },
	place: { ...textStyles.footnote, fontSize: 14, color: colors.ink2 },
	location: {
		...textStyles.footnote,
		fontSize: 14,
		color: colors.ink2,
		marginTop: 4,
	},
	lead: {
		...textStyles.footnote,
		fontSize: 16,
		lineHeight: 24,
		color: colors.ink,
		marginTop: 14,
	},

	sectionRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 10,
		marginTop: 26,
		marginBottom: 10,
	},
	sectionHead: { ...textStyles.caption, fontSize: 12, color: colors.accent },
	sectionNote: {
		...textStyles.caption,
		fontSize: 12,
		color: colors.ink3,
		textTransform: "none",
		letterSpacing: 0,
		flexShrink: 1,
		textAlign: "right",
	},
	card: {
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		paddingHorizontal: 14,
	},
	cardPad: { paddingVertical: 14 },
	divider: hairline,
	rowLabel: { ...textStyles.headline, color: colors.ink },
	rowFact: {
		...textStyles.footnote,
		fontSize: 13,
		lineHeight: 19,
		color: colors.ink2,
		marginTop: 3,
	},

	rankRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 13,
	},
	rankFigure: { width: 78 },
	rankValue: {
		...textStyles.title1,
		color: colors.accent,
		fontVariant: ["tabular-nums"],
	},
	rankScope: {
		...textStyles.caption,
		fontSize: 11,
		color: colors.ink3,
		textTransform: "none",
		letterSpacing: 0,
		marginTop: 2,
	},
	rankText: { flex: 1, minWidth: 0 },
	levelBlock: { paddingTop: 12 },
	levelHead: {
		...textStyles.caption,
		fontSize: 11,
		color: colors.ink2,
	},

	compareItem: { marginBottom: 14 },
	compareHead: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		gap: 8,
		marginBottom: 6,
	},
	compareLabel: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
		flexShrink: 1,
	},
	compareTakeaway: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "600",
		color: colors.pos,
	},
	barRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginVertical: 4,
	},
	barWho: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink2,
		width: 62,
	},
	barWhoWide: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink,
		width: 124,
	},
	track: {
		flex: 1,
		height: 9,
		borderRadius: 5,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	barCity: { height: 9, borderRadius: 5, backgroundColor: colors.accent },
	barOther: { height: 9, borderRadius: 5, backgroundColor: colors.ink3 },
	barValue: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "700",
		color: colors.ink,
		width: 74,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},
	barValueNarrow: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "700",
		color: colors.ink,
		width: 58,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},

	tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	tile: {
		flexGrow: 1,
		flexBasis: "45%",
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		padding: 12,
	},
	tileLabel: { ...textStyles.footnote, fontSize: 12, color: colors.ink2 },
	tileValue: {
		...textStyles.title1,
		fontSize: 22,
		lineHeight: 28,
		color: colors.ink,
		marginTop: 2,
		fontVariant: ["tabular-nums"],
	},
	tileNote: {
		...textStyles.footnote,
		fontSize: 11,
		color: colors.ink3,
		marginTop: 1,
	},

	event: { flexDirection: "row", gap: 10 },
	eventRail: { width: 10, alignItems: "center" },
	eventDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: colors.accent,
		marginTop: 4,
	},
	eventLine: { flex: 1, width: 2, backgroundColor: colors.surface2 },
	eventText: { flex: 1, paddingBottom: 12 },
	eventYear: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "700",
		color: colors.accent,
	},
	eventBody: {
		...textStyles.footnote,
		fontSize: 14,
		lineHeight: 20,
		color: colors.ink,
		marginTop: 1,
	},

	columns: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-around",
		gap: 8,
		paddingTop: 4,
	},
	column: { flex: 1, alignItems: "center", gap: 5 },
	columnValue: {
		...textStyles.footnote,
		fontSize: 12,
		fontWeight: "700",
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	columnBar: {
		width: "62%",
		borderRadius: 5,
		backgroundColor: colors.accent,
	},
	columnLabel: { ...textStyles.footnote, fontSize: 12, color: colors.ink2 },

	pairRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
		paddingVertical: 12,
	},
	pairLabel: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "500",
		color: colors.ink,
		flexShrink: 1,
	},
	pairValue: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink2,
		flexShrink: 1,
		textAlign: "right",
	},
	planRow: { paddingVertical: 12 },

	source: {
		...textStyles.caption,
		fontSize: 11,
		color: colors.ink3,
		textTransform: "none",
		letterSpacing: 0,
		lineHeight: 16,
		marginTop: 8,
	},
	credit: {
		...textStyles.caption,
		fontSize: 12,
		color: colors.ink3,
		textTransform: "none",
		letterSpacing: 0,
		marginTop: 14,
		lineHeight: 18,
	},
	creditLink: { textDecorationLine: "underline" },
});
