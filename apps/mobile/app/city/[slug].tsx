/**
 * `/city/[slug]` — a city: its film, then its fundamentals, as charts.
 *
 * The destination of the city card's Explore link (phase327). It answers "what
 * is this place as a whole": rankings, the numbers against the state, schools
 * at every level, where it came from, the drive to the city, what is planned.
 *
 * Redrawn in phase333. Owner, on the first version: "现在太多文字 又臭又长 重新设计
 * 比如可以用一些图表". Every section is now a figure (`components/city/
 * CityCharts.tsx`, shaped by `lib/city/page.ts`): the long summary is replaced
 * by the one-line tagline, rankings are badges, the numbers are tiles with
 * their own small chart, history is a timeline that shows one sentence at a
 * time, drive times are bars, plans and sources fold shut.
 *
 * The hero is the community page's `TourHero` (phase331). Every figure names
 * its source; there is no safety section, on purpose — `packages/shared/src/
 * city.ts`.
 */
import type { CityDetailDTO } from "@percho/shared/city";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	DriveTimes,
	GlanceTiles,
	HistoryTimeline,
	PlanList,
	RankingBadges,
	SchoolLadder,
	SourcesFold,
} from "../../components/city/CityCharts";
import { TourHero } from "../../components/community/TourHero";
import { apiBase } from "../../lib/api/base";
import { useSavedStore } from "../../state/saved";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

function Section({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	return (
		<>
			<Text style={styles.sectionHead}>{title}</Text>
			{children}
		</>
	);
}

export default function CityScreen() {
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const insets = useSafeAreaInsets();
	const { width, height: screenH } = useWindowDimensions();
	const [data, setData] = useState<CityDetailDTO | null>(null);
	const [error, setError] = useState<string | null>(null);

	// The community page's hero height (reference §3.1): clamp(340, 46vh, 460).
	const heroH = Math.min(Math.max(340, screenH * 0.46), 460);

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

	return (
		<View style={styles.root}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
				showsVerticalScrollIndicator={false}
			>
				{/* The community page's hero, as is (phase331): same height, glass
				    buttons, sound toggle, and its chip strip — one chip per
				    chapter of the film. */}
				<TourHero
					width={width}
					height={heroH}
					{...(data.videoUrl ? { videoUrl: data.videoUrl } : {})}
					{...(data.posterUrl ? { heroUrl: data.posterUrl } : {})}
					initial={data.name.trim().charAt(0).toUpperCase()}
					segments={data.tourSegments ?? []}
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
					<Text style={styles.tagline}>{data.tagline}</Text>
					<Text style={styles.location}>{data.locationNote}</Text>

					{data.rankings.length > 0 && (
						<View style={styles.badges}>
							<RankingBadges rankings={data.rankings} />
						</View>
					)}

					<Section title="AT A GLANCE">
						<GlanceTiles city={data} />
					</Section>

					{(data.education.schools.length > 0 ||
						data.education.rows.length > 0) && (
						<Section title="SCHOOLS">
							<SchoolLadder education={data.education} />
						</Section>
					)}

					{data.history.length > 0 && (
						<Section title="HISTORY">
							<HistoryTimeline history={data.history} />
						</Section>
					)}

					{data.gettingAround.length > 0 && (
						<Section title="GETTING AROUND">
							<DriveTimes rows={data.gettingAround} />
						</Section>
					)}

					{data.planning.length > 0 && (
						<Section title="WHAT'S NEXT">
							<PlanList planning={data.planning} />
						</Section>
					)}

					<View style={styles.sources}>
						<SourcesFold city={data} />
					</View>
				</View>
			</ScrollView>
		</View>
	);
}

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
	tagline: {
		...textStyles.footnote,
		fontSize: 16,
		lineHeight: 23,
		color: colors.ink,
		marginTop: 10,
	},
	location: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink3,
		marginTop: 4,
	},
	badges: { marginTop: 18, marginHorizontal: -18, paddingLeft: 18 },
	sectionHead: {
		...textStyles.caption,
		fontSize: 12,
		color: colors.accent,
		marginTop: 26,
		marginBottom: 10,
	},
	sources: { marginTop: 26 },
});
