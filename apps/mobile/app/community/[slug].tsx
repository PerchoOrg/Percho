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
 *
 * ── A community with a profile (phase339) ───────────────────────────────────
 *
 * `communities.profile` is a researched document, and a community that has one
 * gets `ExploreBody` in place of everything between the headline and the
 * reviews: six verdict lines and a screen of tiles, each opening its chart.
 * The sections above are what every other community still draws.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import { RedlineIcon } from "../../components/cards/redline/RedlineChrome";
import { CreditsFoot } from "../../components/community/CreditsFoot";
import { ExploreBody } from "../../components/community/ExploreBody";
import { NearbyChart } from "../../components/community/NearbyChart";
import { PlaceDeckLink } from "../../components/community/PlaceDeckLink";
import { ReviewsSection } from "../../components/community/ReviewsSection";
import { StatBand } from "../../components/community/StatBand";
import { TourHero } from "../../components/community/TourHero";
import { apiBase } from "../../lib/api/base";
import type {
	CommunityDetailDTO,
	CommunityReasonDTO,
} from "../../lib/community/detail-dto";
import type { RecentPlace } from "../../lib/feed/recent";
import { LISTINGS_IN_APP, TEST_HOMES } from "../../lib/listings-in-app";
import { type ReviewStatus, fetchMyReview } from "../../lib/reviews/reviews";
import { backOrFeed } from "../../lib/share/back-or-feed";
import { openShareSheet } from "../../lib/share/share-sheet";
import { useAuthStore } from "../../state/auth";
import { useFeedSession } from "../../state/feed-session";
import { useSavedStore } from "../../state/saved";
import { toggleDislike, toggleLike } from "../../state/verdict";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/* The DTO moved to `lib/community/detail-dto.ts` in phase261 — the compare
   screen reads the same wire shape, and two hand-kept copies of one contract
   is the defect the two phases before it were about. */

/** Reason row: the resident's own word, its glyph, and its evidence. */
function ReasonRow({ reason }: { reason: CommunityReasonDTO }) {
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
	// `open` is set when the page is reached from a figure under the feed
	// card: the tile whose sheet to open (phase378).
	const { slug, open } = useLocalSearchParams<{
		slug: string;
		open?: string;
	}>();
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
	const hidden = useFeedSession((s) =>
		data ? s.hiddenIds.includes(data.id) : false,
	);

	// The signed-in user's own review, in any status — so the CTA can read
	// "Edit your review" and a pending one can say so. Anon sees only approved
	// rows, so this is skipped without a session.
	const uid = useAuthStore((s) => s.session?.user.id);
	const [myStatus, setMyStatus] = useState<ReviewStatus | null>(null);
	useEffect(() => {
		if (!uid || !data) return;
		let alive = true;
		fetchMyReview(uid, { kind: "community", id: data.id })
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

	/**
	 * The interest chips, de-duplicated.
	 *
	 * `communities.interests` is scraped from Nextdoor verbatim and some
	 * neighbourhoods list the same interest twice — Aberdeen carries "Home
	 * Improvement & DIY" twice, which React reported as `Encountered two
	 * children with the same key` and drew as two identical chips
	 * (owner's device, 2026-09-06). The API de-duplicates now too
	 * (`dedupeLabels` in `apps/web/lib/communities/detail.ts`); this stays
	 * because the app talks to whatever version of the API is deployed, and a
	 * duplicate on the wire must not be able to break this screen again.
	 *
	 * First occurrence wins: the order is Nextdoor's own ranking, which is the
	 * evidence behind the "#N resident interest" sub-lines above.
	 */
	const interests = useMemo(() => {
		const seen = new Set<string>();
		return (data?.interests ?? []).filter((label) => {
			const key = label.trim().toLowerCase();
			if (key === "" || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}, [data?.interests]);

	if (error) {
		return (
			<View style={[styles.center, { paddingTop: insets.top }]}>
				<Text style={styles.err}>Couldn't load this neighbourhood.</Text>
				<Pressable onPress={backOrFeed} style={styles.backBtn}>
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
	/** This community as a verdict knows it — the row RECENT will show. */
	const verdictPlace: RecentPlace = {
		id: data.id,
		kind: "community",
		title: data.name,
		subtitle: place,
		...(data.heroUrl ? { thumbUrl: data.heroUrl } : {}),
	};
	// A researched community gets the one-screen page (phase339); the rest keep
	// the sections below, which need nothing but the row.
	const profile = data.profile;
	const writeReview = () => {
		if (!uid) {
			router.push("/auth");
			return;
		}
		router.push({
			pathname: "/community/review",
			params: { id: data.id, name: data.name },
		});
	};

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
					{...(data.heroUrl ? { heroUrl: data.heroUrl } : {})}
					initial={data.name.trim().charAt(0).toUpperCase()}
					segments={data.tourSegments ?? []}
					saved={saved}
					hidden={hidden}
					onBack={backOrFeed}
					// The card's two verdicts, with the card's rules: the heart is
					// a like and a save, the thumbs-down hides the place from the
					// feed and takes a heart with it.
					onToggleSave={() => toggleLike(verdictPlace)}
					onToggleHide={() => toggleDislike(verdictPlace)}
					// Share (phase D) — the public web page for this community,
					// which opens here when the buyer has the app (phase335).
					onShare={() =>
						openShareSheet({
							kind: "community",
							slug: data.slug,
							name: data.name,
						})
					}
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

					{/* Into the neighbourhood's own deck (phase404.4) — its homes. A
					    build without homes does not ask whether there are any. */}
					{(LISTINGS_IN_APP || TEST_HOMES) && (
						<PlaceDeckLink
							focus={{ kind: "community", id: data.slug, name: data.name }}
						/>
					)}

					{profile && (
						<ExploreBody
							profile={profile}
							segments={data.tourSegments}
							open={open}
						/>
					)}

					{/* Three figures as numerals — the old label/value rows charted. */}
					{!profile && (
						<View style={styles.bandWrap}>
							<StatBand stats={data.stats} />
						</View>
					)}

					{/* Counts of real places, biggest first. The page's densest
					    numbers, and the evidence under half the reasons below. */}
					{!profile && (data.nearby?.length ?? 0) > 0 && (
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
					{!profile && data.topReasons.length > 0 && (
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
					{!profile && data.moreReasons.length > 0 && (
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

					{!profile && interests.length > 0 && (
						<>
							<Text style={styles.sectionHead}>WHAT RESIDENTS ARE INTO</Text>
							{/*
							 * Nextdoor's own per-neighbourhood order, so the ranking is
							 * still readable off the row. The ordinal badges are gone
							 * (owner 2026-09-05, "no need to show numbers") — position
							 * already says what they said.
							 */}
							<View style={styles.chips}>
								{interests.map((it) => (
									<View key={it} style={styles.chip}>
										<Text style={styles.chipTxt}>{it}</Text>
									</View>
								))}
							</View>
						</>
					)}

					{/* Reviews, always at the foot, so the door to write one is always
					    visible — an empty section beats a generated one (phase E). */}
					<ReviewsSection
						reviews={data.reviews}
						myStatus={myStatus}
						onWrite={writeReview}
					/>

					<CreditsFoot
						sources={
							profile
								? profile.sources.map((src) => src.name).join(" · ")
								: "Resident-stated attributes and interests from Nextdoor neighbourhood profiles."
						}
						google={data.photoCredits ?? []}
					/>
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
	place: { ...textStyles.footnote, fontSize: 14, color: colors.ink2 },
	bandWrap: { marginTop: 16 },
	sectionHead: {
		...textStyles.caption,
		fontSize: 12,
		color: colors.ink2,
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
	rowFact: {
		...textStyles.caption,
		fontSize: 12,
		color: colors.ink2,
		marginTop: 3,
	},

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
	chipTxt: { ...textStyles.footnote, fontSize: 14, color: colors.ink },
});
