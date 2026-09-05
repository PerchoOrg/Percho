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
 * evidence under it. Server rules live in `apps/web/lib/communities/detail.ts`.
 *
 * ── Structure, top to bottom (owner's redesign notes, 2026-09-04/05) ────────
 *
 *   TourHero      the film + one chip per CATEGORY it visits (listing pattern)
 *   Headline      name left, city/state right, on one baseline
 *   StatBand      residents / owner-occupied / median age, as numerals
 *   NearbyChart   counts of real places by kind, bars, biggest first
 *   WHY PEOPLE…   the card's three reasons, WITH their evidence lines
 *   ALSO SAID     every other stated reason, as labels only
 *   INTO          the interest ranking, chips, no ordinals
 *   REVIEWS       score, four dimension bars, the reviews themselves
 *
 * The through-line of the 2026-09-05 pass is "text is not preferred, numbers
 * are, except for the key insights": the blurb paragraph is gone, the reason
 * sentences survive only on the top three, and everything that was a
 * `label ——— value` row is now a numeral or a bar. Nothing was deleted for
 * space that is not still on the page as a figure.
 *
 * When a pillar gets a source, §3.3 is the target and this becomes its Vibe
 * section. It is not a placeholder in the meantime — every row on it is a real
 * row.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	RedlineIcon,
	type RedlineIconName,
} from "../../components/cards/redline/RedlineChrome";
import { NearbyChart } from "../../components/community/NearbyChart";
import { RatingBars } from "../../components/community/RatingBars";
import { StatBand } from "../../components/community/StatBand";
import { TourHero } from "../../components/community/TourHero";
import { apiBase } from "../../lib/api/base";
import type { TourSegment } from "../../lib/community/tour-buckets";
import {
	type ReviewDimension,
	type ReviewStatus,
	fetchMyReview,
	reviewMonth,
} from "../../lib/reviews/reviews";
import { useAuthStore } from "../../state/auth";
import { useSavedStore } from "../../state/saved";
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
	/** The community's film — the SAME one the feed card plays. */
	videoUrl?: string;
	/** Present only when `videoUrl` is the assembled tour. */
	tourSegments?: TourSegment[];
	/** Prose description. Fetched but no longer shown — see the header. */
	blurb?: string;
	topReasons: ReasonDTO[];
	moreReasons: ReasonDTO[];
	stats: { label: string; value: string }[];
	/**
	 * Counts of real places by kind, biggest first. Charted, not narrated.
	 * Optional because a phone can be newer than the deployed API — this
	 * shipped 2026-09-05 and a build in the field must not crash without it.
	 */
	nearby?: { bucket: string; count: number }[];
	interests: string[];
	/** Approved resident reviews (phase E). Absent until one is approved. */
	reviews?: {
		count: number;
		avgRating: number;
		dimensionAvgs: Partial<Record<ReviewDimension, number>>;
		items: {
			id: string;
			rating: number;
			dimensions: Partial<Record<ReviewDimension, number>>;
			body: string;
			date: string;
		}[];
	};
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
	const { width, height: screenH } = useWindowDimensions();
	const [data, setData] = useState<CommunityDetailDTO | null>(null);
	const [error, setError] = useState<string | null>(null);

	// The listing hero's height rule (reference §3.1): clamp(340, 46vh, 460).
	const heroH = Math.min(Math.max(340, screenH * 0.46), 460);

	// The community's save entry point lives HERE, not on the card face — the
	// card's top-right corner belongs to the tour video's place/distance label
	// (owner 2026-08-20: "remove the save button on the top right for cards").
	const saved = useSavedStore((s) => (data ? s.isSaved(data.id) : false));
	const toggleSaved = useSavedStore((s) => s.toggle);

	// The signed-in user's own review, in any status — so the CTA can read
	// "Edit your review" and a pending one can say so. Anon sees only approved
	// rows, so this is skipped without a session.
	const uid = useAuthStore((s) => s.session?.user.id);
	const [myStatus, setMyStatus] = useState<ReviewStatus | null>(null);
	useEffect(() => {
		if (!uid || !data) return;
		let alive = true;
		fetchMyReview(uid, data.id)
			.then((mine) => alive && setMyStatus(mine?.status ?? null))
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [uid, data]);

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
				{/*
				 * The film with its places as a strip — the listing hero's pattern.
				 * Same film the feed card plays (HLS for an assembled tour, mp4 for
				 * a legacy AI video); the strip appears only when the film's
				 * structure is known.
				 */}
				<TourHero
					width={width}
					height={heroH}
					{...(data.videoUrl ? { videoUrl: data.videoUrl } : {})}
					heroUrl={data.heroUrl}
					segments={data.tourSegments ?? []}
					saved={saved}
					onBack={() => router.back()}
					onToggleSave={() => toggleSaved(data.id, "community")}
					// Share (phase D) — the public web page for this community.
					onShare={() => {
						const url = `https://www.percho.co/c/${data.slug}`;
						void Share.share({
							message: `${data.name} — ${url}`,
							url,
						}).catch(() => {});
					}}
				/>

				<View style={styles.body}>
					{/*
					 * Headline under the media, where the listing page puts its own.
					 * City and state sit to the RIGHT of the name on the same
					 * baseline (owner 2026-09-05), like the listing's price / specs row.
					 */}
					<View style={styles.headline}>
						<Text style={styles.name} numberOfLines={2}>
							{data.name}
						</Text>
						{!!place && <Text style={styles.place}>{place}</Text>}
					</View>

					{/* Three figures as numerals — the old label/value rows charted. */}
					<View style={styles.bandWrap}>
						<StatBand stats={data.stats} />
					</View>

					{/* Counts of real places, biggest first. The page's densest
					    numbers, and the evidence under half the reasons below. */}
					{(data.nearby?.length ?? 0) > 0 && (
						<>
							<Text style={styles.sectionHead}>WHAT'S NEARBY</Text>
							<NearbyChart nearby={data.nearby ?? []} />
						</>
					)}

					{/*
					 * The card's three, in the card's order — `communityReasonsAll` is
					 * the one ranking both surfaces use, so these are the exact tiles
					 * the user just tapped. These keep their evidence lines: they are
					 * the key insights the owner's 2026-09-05 note exempts from
					 * "text is not preferred".
					 */}
					{data.topReasons.length > 0 && (
						<>
							<Text style={styles.sectionHead}>WHY PEOPLE LOVE IT</Text>
							<View style={styles.card}>
								{data.topReasons.map((r) => (
									<ReasonRow key={r.label} reason={r} />
								))}
							</View>
						</>
					)}

					{/*
					 * Everything else the neighbourhood stated, as labels only. It was
					 * an icon + label + sentence row each, which on a community stating
					 * ten attributes is ten paragraphs of the page. The numbers those
					 * sentences carried are charted above — no evidence left the page,
					 * it stopped being narrated one line at a time.
					 */}
					{data.moreReasons.length > 0 && (
						<>
							<Text style={styles.sectionHead}>ALSO SAID BY RESIDENTS</Text>
							<View style={styles.chips}>
								{data.moreReasons.map((r) => (
									<View key={r.label} style={styles.chip}>
										<RedlineIcon name={r.icon} size={13} color={colors.ink2} />
										<Text style={styles.chipTxt}>{r.label}</Text>
									</View>
								))}
							</View>
						</>
					)}

					{data.interests.length > 0 && (
						<>
							<Text style={styles.sectionHead}>WHAT RESIDENTS ARE INTO</Text>
							{/*
							 * Nextdoor's own per-neighbourhood order, so the ranking is
							 * still readable off the row. The ordinal badges are gone
							 * (owner 2026-09-05, "no need to show numbers") — position
							 * already says what they said.
							 */}
							<View style={styles.chips}>
								{data.interests.map((it) => (
									<View key={it} style={styles.chip}>
										<Text style={styles.chipTxt}>{it}</Text>
									</View>
								))}
							</View>
						</>
					)}

					{/*
					 * Resident reviews (phase E). Real people, read by a person before
					 * they appear, shown without names. The section is always here so
					 * the door to write one is always visible — an empty section beats
					 * a generated one.
					 */}
					<Text style={styles.sectionHead}>RESIDENT REVIEWS</Text>
					{data.reviews ? (
						<View style={styles.card}>
							<View style={styles.statRow}>
								<Text style={styles.scoreValue}>
									{data.reviews.avgRating.toFixed(1)}
									<Text style={styles.scoreOf}> / 5</Text>
								</Text>
								<Text style={styles.statLabel}>
									{data.reviews.count}{" "}
									{data.reviews.count === 1 ? "review" : "reviews"}
								</Text>
							</View>
							{/* The four dimensions as bars — they were one run-on line. */}
							<RatingBars dimensionAvgs={data.reviews.dimensionAvgs} />
							{data.reviews.items.map((r) => (
								<View key={r.id} style={styles.review}>
									<View style={styles.reviewHead}>
										<Text style={styles.reviewRating}>
											{"★".repeat(r.rating)}
											<Text style={styles.reviewRatingOff}>
												{"★".repeat(5 - r.rating)}
											</Text>
										</Text>
										<Text style={styles.reviewMeta}>
											A resident · {reviewMonth(r.date)}
										</Text>
									</View>
									<Text style={styles.reviewBody}>{r.body}</Text>
									{/* App Store 1.2 (UGC): a way to report, next to every item. */}
									<Pressable
										hitSlop={8}
										accessibilityRole="link"
										onPress={() =>
											Linking.openURL(
												`mailto:hello@percho.co?subject=${encodeURIComponent(`Report review ${r.id}`)}`,
											).catch(() => {})
										}
									>
										<Text style={styles.reviewReport}>Report</Text>
									</Pressable>
								</View>
							))}
						</View>
					) : (
						<Text style={styles.reviewEmpty}>
							No resident reviews yet. Live here? Yours would be the first.
						</Text>
					)}
					{myStatus === "pending" && (
						<Text style={styles.reviewPending}>
							Your review is waiting to be read.
						</Text>
					)}
					<Pressable
						style={styles.reviewCta}
						accessibilityRole="button"
						onPress={() => {
							if (!uid) {
								router.push("/auth");
								return;
							}
							router.push({
								pathname: "/community/review",
								params: { id: data.id, name: data.name },
							});
						}}
					>
						<Text style={styles.reviewCtaTxt}>
							{myStatus ? "Edit your review" : "Write a review"}
						</Text>
					</Pressable>

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

	body: { paddingHorizontal: 18, paddingTop: 20 },
	/** Name left, place right, on one baseline — the listing headline's row. */
	headline: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 10,
	},
	name: { ...textStyles.title1, color: colors.ink, flexShrink: 1 },
	place: { ...textStyles.footnote, color: colors.ink2 },
	bandWrap: { marginTop: 16 },
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
	chipTxt: { ...textStyles.footnote, color: colors.ink },

	statRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		paddingVertical: 13,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	statLabel: { ...textStyles.footnote, color: colors.ink2 },
	/** The reviews score, printed like a price rather than like a field. */
	scoreValue: {
		...textStyles.title1,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	scoreOf: { ...textStyles.footnote, color: colors.ink2 },
	review: {
		paddingVertical: 13,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
		gap: 6,
	},
	reviewHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	reviewRating: { fontSize: 13, color: colors.accent, letterSpacing: 1 },
	reviewRatingOff: { color: colors.border },
	reviewMeta: { ...textStyles.caption, color: colors.ink3 },
	reviewBody: { ...textStyles.footnote, color: colors.ink, lineHeight: 20 },
	reviewReport: { ...textStyles.caption, color: colors.ink3, marginTop: 2 },
	reviewEmpty: { ...textStyles.footnote, color: colors.ink2, lineHeight: 20 },
	reviewPending: {
		...textStyles.footnote,
		color: colors.accent,
		marginTop: 10,
	},
	reviewCta: {
		marginTop: 14,
		alignSelf: "flex-start",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: colors.accent,
	},
	reviewCtaTxt: { ...textStyles.footnote, color: colors.accent },

	source: {
		...textStyles.caption,
		color: colors.ink3,
		textTransform: "none",
		letterSpacing: 0,
		marginTop: 22,
		lineHeight: 16,
	},
});
