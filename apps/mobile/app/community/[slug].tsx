/**
 * `/community/[slug]` — "Why people love it".
 *
 * The destination of the community card's CTA (owner, 2026-08-02:
 * 「最后还有why people love it的跳转button」). The card had drawn that button since
 * the 2026-07-30 redline with no `onExplore` handler behind it, on the grounds
 * that there was nowhere to send it. Now there is.
 *
 * ── Scope: the button's own promise, not spec-v3 §3.3 ───────────────────────
 *
 * §3.3 specifies a six-section explore page anchored on 四柱 (安/学/便/潜). None
 * of the four has data on the live DB — no crime, school-rating or commute
 * source, `community_pois` populated for 1 of 8,679 communities,
 * `median_home_value` NULL on all of them, 3 of 260 listings carrying a
 * `community_id`. §3.4's own rule is 「缺数据显示 "–" 不编造」, and four
 * "not enough data" grades is not a destination worth pushing a screen for.
 *
 * What IS real is the material the button names: what residents said, and the
 * evidence under it. So this screen is the card's three tiles expanded, then
 * every other reason the neighbourhood stated, then the interest ranking that
 * backs the "#N resident interest" sub-lines, then the demographic figures.
 * Server rules live in `apps/web/lib/community/detail.ts`.
 *
 * When a pillar gets a source, §3.3 is the target and this becomes its Vibe
 * section. It is not a placeholder in the meantime — every row on it is a real
 * row.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	RedlineIcon,
	type RedlineIconName,
} from "../../components/cards/redline/RedlineChrome";
import { apiBase } from "../../lib/api/base";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

interface ReasonDTO {
	label: string;
	icon: RedlineIconName;
	/** Present only when a DB row is evidence for THIS reason. */
	fact?: string;
}

interface CommunityDetailDTO {
	id: string;
	slug: string;
	name: string;
	city: string;
	state: string;
	heroUrl: string;
	blurb?: string;
	topReasons: ReasonDTO[];
	moreReasons: ReasonDTO[];
	stats: { label: string; value: string }[];
	interests: string[];
}

/** Reason row: the resident's own word, its glyph, and its evidence. */
function ReasonRow({ reason }: { reason: ReasonDTO }) {
	return (
		<View style={styles.row}>
			<View style={styles.rowIcon}>
				<RedlineIcon name={reason.icon} size={16} color={colors.ink} />
			</View>
			<View style={styles.rowText}>
				<Text style={styles.rowLabel}>{reason.label}</Text>
				{/*
				 * No fallback line. A reason with no evidence renders as the label
				 * alone — writing "resident-reported" under it would dress an
				 * unevidenced claim as a cited one. 17.7% of communities resolve zero
				 * facts and this is what they look like.
				 */}
				{!!reason.fact && <Text style={styles.rowFact}>{reason.fact}</Text>}
			</View>
		</View>
	);
}

export default function CommunityWhyScreen() {
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const insets = useSafeAreaInsets();
	const [data, setData] = useState<CommunityDetailDTO | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!slug) return;
		let alive = true;
		(async () => {
			try {
				const res = await fetch(
					`${apiBase()}/api/mobile/community/${encodeURIComponent(slug)}`,
				);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = (await res.json()) as CommunityDetailDTO;
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
				<Text style={styles.err}>Couldn't load this neighbourhood.</Text>
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

	const place = [data.city, data.state].filter(Boolean).join(", ");

	return (
		<View style={styles.root}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.hero}>
					<Image source={{ uri: data.heroUrl }} style={styles.heroImg} />
					<View style={styles.heroScrim} />
					<View style={[styles.heroText, { paddingTop: insets.top + 40 }]}>
						<Text style={styles.eyebrow}>WHY PEOPLE LOVE IT</Text>
						<Text style={styles.name}>{data.name}</Text>
						{!!place && <Text style={styles.place}>{place}</Text>}
					</View>
				</View>

				<Pressable
					onPress={() => router.back()}
					hitSlop={12}
					accessibilityRole="button"
					accessibilityLabel="Back"
					style={[styles.close, { top: insets.top + 8 }]}
				>
					<Text style={styles.closeTxt}>✕</Text>
				</Pressable>

				<View style={styles.body}>
					{!!data.blurb && <Text style={styles.blurb}>{data.blurb}</Text>}

					{/*
					 * The card's three, in the card's order — `communityReasonsAll` is
					 * the one ranking both surfaces use, so these are the exact tiles
					 * the user just tapped.
					 */}
					{data.topReasons.length > 0 && (
						<>
							<Text style={styles.sectionHead}>ON THE CARD</Text>
							<View style={styles.card}>
								{data.topReasons.map((r) => (
									<ReasonRow key={r.label} reason={r} />
								))}
							</View>
						</>
					)}

					{/* The reason this screen exists: the card holds three, most
					    communities state more. */}
					{data.moreReasons.length > 0 && (
						<>
							<Text style={styles.sectionHead}>ALSO SAID BY RESIDENTS</Text>
							<View style={styles.card}>
								{data.moreReasons.map((r) => (
									<ReasonRow key={r.label} reason={r} />
								))}
							</View>
						</>
					)}

					{data.interests.length > 0 && (
						<>
							<Text style={styles.sectionHead}>WHAT RESIDENTS ARE INTO</Text>
							{/*
							 * The evidence behind every "#N resident interest" above,
							 * shown in Nextdoor's own per-neighbourhood order so the
							 * ordinal can be checked rather than believed.
							 */}
							<View style={styles.chips}>
								{data.interests.map((it, i) => (
									<View key={it} style={styles.chip}>
										<Text style={styles.chipRank}>{i + 1}</Text>
										<Text style={styles.chipTxt}>{it}</Text>
									</View>
								))}
							</View>
						</>
					)}

					{data.stats.length > 0 && (
						<>
							<Text style={styles.sectionHead}>THE NEIGHBOURHOOD</Text>
							<View style={styles.card}>
								{data.stats.map((s) => (
									<View key={s.label} style={styles.statRow}>
										<Text style={styles.statLabel}>{s.label}</Text>
										<Text style={styles.statValue}>{s.value}</Text>
									</View>
								))}
							</View>
						</>
					)}

					{/*
					 * Source line, per §3.4's rule that every evidence block names where
					 * it came from. One source today, stated plainly rather than dressed
					 * up as several.
					 */}
					<Text style={styles.source}>
						Resident-stated attributes and interests from Nextdoor neighbourhood
						profiles.
					</Text>
				</View>
			</ScrollView>
		</View>
	);
}

const HERO_H = 260;

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.bg },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
		backgroundColor: colors.bg,
	},
	err: {
		...textStyles.footnote,
		color: colors.ink2,
		textAlign: "center",
		paddingHorizontal: 32,
	},
	backBtn: {
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: radii.btn,
		backgroundColor: colors.cta,
	},
	backTxt: { ...textStyles.footnote, color: colors.surface },

	hero: { height: HERO_H, backgroundColor: colors.cardPlainTo },
	heroImg: { ...StyleSheet.absoluteFillObject, resizeMode: "cover" },
	/** The name sits on the photo, so the photo needs a floor to sit it on. */
	heroScrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0,0,0,0.42)",
	},
	heroText: { flex: 1, justifyContent: "flex-end", padding: 20 },
	eyebrow: { ...textStyles.caption, color: colors.onCardDim, marginBottom: 8 },
	name: { ...textStyles.title1, color: colors.onCard },
	place: { ...textStyles.footnote, color: colors.onCardDim, marginTop: 6 },
	close: {
		position: "absolute",
		right: 14,
		width: 34,
		height: 34,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.glass,
	},
	closeTxt: { fontSize: 15, color: colors.ink },

	body: { paddingHorizontal: 18, paddingTop: 18 },
	blurb: { ...textStyles.body, color: colors.ink, lineHeight: 22 },
	sectionHead: {
		...textStyles.caption,
		color: colors.accent,
		marginTop: 26,
		marginBottom: 10,
	},
	card: {
		backgroundColor: colors.surface,
		borderRadius: radii.card,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		paddingHorizontal: 14,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 13,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	rowIcon: {
		width: 32,
		height: 32,
		borderRadius: radii.pill,
		backgroundColor: colors.surface2,
		alignItems: "center",
		justifyContent: "center",
	},
	rowText: { flex: 1, minWidth: 0 },
	rowLabel: { ...textStyles.headline, color: colors.ink },
	rowFact: { ...textStyles.caption, color: colors.ink2, marginTop: 3 },

	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 11,
		paddingVertical: 7,
		borderRadius: radii.pill,
		backgroundColor: colors.surface,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
	},
	chipRank: { ...textStyles.caption, color: colors.accent },
	chipTxt: { ...textStyles.footnote, color: colors.ink },

	statRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 13,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	statLabel: { ...textStyles.footnote, color: colors.ink2 },
	statValue: { ...textStyles.headline, color: colors.ink },

	source: {
		...textStyles.caption,
		color: colors.ink3,
		textTransform: "none",
		letterSpacing: 0,
		marginTop: 22,
		lineHeight: 16,
	},
});
