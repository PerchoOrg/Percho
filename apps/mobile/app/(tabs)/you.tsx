/**
 * You tab (spec-v3 05 §5.3) — persona, area familiarity, evidence, reset.
 *
 * ── v1 scope vs §5.3 ────────────────────────────────────────────────────────
 *   · Persona card — deterministic lexicon name (`lib/feed/persona.ts`), or
 *     "Still taking shape" below the evidence threshold. The subtitle drops
 *     the spec's "Stage X of 5" — the funnel collapsed on 2026-08-15 and the
 *     stage is pinned, so the claim would never move.
 *   · Area familiarity — `familiarityFor`, the SAME source the Search tab's
 *     journey layer reads (§5.3 hard rule: the two faces cannot disagree).
 *     Row tap → Search tab focused on the unit.
 *   · Evidence ("WHAT PERCHO KNOWS") — per-dim strength with the §5.3
 *     correction: tap → "Still true?" → No removes the dim's weight.
 *   · Recent — the swipe history and "Bring back" (phase140). The owner
 *     rejected the §1.8 Undo toast on the feed (「之前的视线有点丑陋」); a
 *     correction belongs on the surface that explains what Percho concluded,
 *     not on a control that appears over a card for three seconds.
 *   · Reset — shows the scope it is about to erase before erasing it
 *     (likes, trade-offs, area history), then `clearSignals()`.
 *   · Account (phase B, store launch) — sign in / out and the in-app account
 *     deletion App Review 5.1.1(v) requires. Session state from
 *     `state/auth.ts`; the actions live in `lib/auth.ts`.
 *   · Settings — only the switches that exist (sound autoplay).
 */
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
	Alert,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { familiarityFor, unknownDimsLabel } from "../../lib/area-familiarity";
import { deleteAccount, signOut } from "../../lib/auth";
import { DIM_LABELS, personaName, rankedDims } from "../../lib/feed/persona";
import { useAuthStore } from "../../state/auth";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { useSoundStore } from "../../state/sound";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** How many familiarity rows before the list hands over to Search. */
const MAX_AREA_ROWS = 8;

export default function YouTab() {
	const insets = useSafeAreaInsets();
	const signals = useFeedSession((s) => s.signals);
	const clearSignals = useFeedSession((s) => s.clearSignals);
	const removeDim = useFeedSession((s) => s.removeDim);
	const recent = useFeedSession((s) => s.recent);
	const bringBack = useFeedSession((s) => s.bringBack);

	const soundOn = useSoundStore((s) => s.soundOn);
	const toggleSound = useSoundStore((s) => s.toggle);

	const session = useAuthStore((s) => s.session);

	const stage = useFunnelStore((s) => s.stage);
	const { pool } = useFeedPool({
		stage,
		cities: [],
		likedCommunityIds: [],
		enabled: true,
	});

	/** The evidence-correction prompt is open for this dim. */
	const [askingDim, setAskingDim] = useState<string | null>(null);

	const likes =
		signals.likedListingIds.length + signals.likedCommunityIds.length;
	const tradeoffs = signals.tradeoffCount ?? 0;
	const name = personaName(signals.dims);

	const areas = useMemo(() => {
		return pool.geoUnits
			.map((u) => ({ unit: u, fam: familiarityFor(signals, u.id) }))
			.filter((a) => a.fam.cardsSeen > 0)
			.sort((a, b) => b.fam.score - a.fam.score)
			.slice(0, MAX_AREA_ROWS);
	}, [pool.geoUnits, signals]);

	const dims = useMemo(() => {
		const ranked = rankedDims(signals.dims);
		const max = ranked[0]?.weight ?? 1;
		return ranked.map((d) => ({ ...d, strength: d.weight / max }));
	}, [signals.dims]);

	const confirmReset = () => {
		// The preview IS the section copy above the button; the alert restates
		// it as the destructive confirm (§5.3: no bare reset without a recap).
		Alert.alert(
			"Start fresh?",
			`This clears ${likes} likes, ${tradeoffs} answered trade-offs and your area history. Saved homes stay saved.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clear",
					style: "destructive",
					onPress: () => clearSignals(),
				},
			],
		);
	};

	const focusArea = (unitId: string) =>
		router.navigate({ pathname: "/(tabs)/search", params: { focus: unitId } });

	const confirmDeleteAccount = () => {
		Alert.alert(
			"Delete your account?",
			"This permanently removes your account and your saved homes. There is no undo.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						const res = await deleteAccount();
						if (!res.ok && res.error) {
							Alert.alert("Couldn't delete account", res.error);
						}
					},
				},
			],
		);
	};

	return (
		<ScrollView
			style={styles.screen}
			contentContainerStyle={{
				paddingTop: insets.top + 12,
				paddingBottom: insets.bottom + 32,
				paddingHorizontal: 20,
			}}
		>
			<Text style={styles.title}>You</Text>

			{/* Persona card */}
			<View style={styles.personaCard}>
				<Text style={styles.eyebrow}>YOUR PERSONA</Text>
				<Text style={styles.personaName}>{name ?? "Still taking shape"}</Text>
				<Text style={styles.personaSub}>
					{likes + tradeoffs > 0
						? `Shaped by ${likes} ${likes === 1 ? "like" : "likes"} · ${tradeoffs} trade-off${tradeoffs === 1 ? "" : "s"}`
						: "Swipe the feed and Percho starts learning."}
				</Text>
			</View>

			{/*
			 * RECENT — what the buyer just did, and the one way to take it back.
			 * Rows are SNAPSHOTS taken at swipe time (`lib/feed/recent.ts`), so
			 * the list paints instantly and shows the price the buyer actually
			 * saw. Trade-off answers are absent by construction: §1.8 rules them
			 * out of undo, and `recentEntryFor` returns null for them.
			 */}
			{recent.length > 0 && (
				<>
					<Text style={styles.sectionHead}>RECENT</Text>
					<View style={styles.card}>
						{recent.slice(0, RECENT_SHOWN).map((e) => (
							<View key={e.id} style={styles.recentRow}>
								{e.thumbUrl ? (
									<Image
										source={{ uri: e.thumbUrl }}
										style={styles.recentThumb}
									/>
								) : (
									<View style={[styles.recentThumb, styles.recentThumbEmpty]} />
								)}
								<View style={styles.recentText}>
									<Text style={styles.recentTitle} numberOfLines={1}>
										{e.title}
									</Text>
									{e.subtitle ? (
										<Text style={styles.recentSub} numberOfLines={1}>
											{e.subtitle}
										</Text>
									) : null}
									<Text
										style={[
											styles.recentVerdict,
											e.verdict === "right"
												? styles.verdictYes
												: styles.verdictNo,
										]}
									>
										{e.verdict === "right" ? "Liked" : "Passed"}
									</Text>
								</View>
								<Pressable
									onPress={() => bringBack(e.id)}
									accessibilityRole="button"
									accessibilityLabel={`Bring back ${e.title}`}
									hitSlop={8}
									style={({ pressed }) => [
										styles.bringBack,
										pressed && styles.bringBackPressed,
									]}
								>
									<Text style={styles.bringBackTxt}>Bring back</Text>
								</Pressable>
							</View>
						))}
					</View>
				</>
			)}

			{/* Area familiarity — same data the Search journey layer draws. */}
			<Text style={styles.sectionHead}>HOW WELL YOU KNOW EACH AREA</Text>
			<View style={styles.card}>
				{areas.length === 0 && (
					<Text style={styles.emptyLine}>
						Swipe a few cards and your map starts filling in.
					</Text>
				)}
				{areas.map(({ unit, fam }) => (
					<Pressable
						key={unit.id}
						style={styles.areaRow}
						onPress={() => focusArea(unit.id)}
						accessibilityRole="button"
						accessibilityLabel={`${unit.name}, ${fam.score} percent explored`}
					>
						<View style={styles.areaText}>
							<Text style={styles.areaName}>
								{unit.name} <Text style={styles.areaScore}>{fam.score}%</Text>
							</Text>
							<Text style={styles.areaSub} numberOfLines={1}>
								{fam.cardsSeen} {fam.cardsSeen === 1 ? "card" : "cards"} ·{" "}
								{unknownDimsLabel(fam.unknownDims)}
							</Text>
						</View>
						<View style={styles.meter}>
							<View style={[styles.meterFill, { flex: fam.score }]} />
							<View style={{ flex: Math.max(100 - fam.score, 0) }} />
						</View>
					</Pressable>
				))}
				<Pressable
					style={styles.exploreRow}
					onPress={() => router.navigate("/(tabs)/search")}
					accessibilityRole="button"
				>
					<Text style={styles.exploreTxt}>Explore more areas →</Text>
				</Pressable>
			</View>

			{/* Evidence — tap to correct (§5.3 #3). */}
			<Text style={styles.sectionHead}>WHAT PERCHO KNOWS</Text>
			<View style={styles.card}>
				{dims.length === 0 && (
					<Text style={styles.emptyLine}>
						Answer a trade-off card and what Percho learns shows up here.
					</Text>
				)}
				{dims.map((d) => (
					<Pressable
						key={d.dim}
						style={styles.dimRow}
						onPress={() =>
							setAskingDim((cur) => (cur === d.dim ? null : d.dim))
						}
						accessibilityRole="button"
						accessibilityLabel={`${DIM_LABELS[d.dim]}. Tap to correct.`}
					>
						<View style={styles.dimTop}>
							<Text style={styles.dimLabel}>{DIM_LABELS[d.dim]}</Text>
							<View style={styles.meterWide}>
								<View style={[styles.meterFill, { flex: d.strength }]} />
								<View style={{ flex: Math.max(1 - d.strength, 0.001) }} />
							</View>
						</View>
						{askingDim === d.dim && (
							<View style={styles.stillTrue}>
								<Text style={styles.stillTrueTxt}>Still true?</Text>
								<Pressable
									onPress={() => setAskingDim(null)}
									hitSlop={8}
									accessibilityRole="button"
								>
									<Text style={styles.stillYes}>Yes</Text>
								</Pressable>
								<Pressable
									onPress={() => {
										removeDim(d.dim);
										setAskingDim(null);
									}}
									hitSlop={8}
									accessibilityRole="button"
								>
									<Text style={styles.stillNo}>No, remove</Text>
								</Pressable>
							</View>
						)}
					</Pressable>
				))}
			</View>

			{/* Scope reset — the recap is on screen before the destructive act. */}
			<Text style={styles.sectionHead}>YOUR SCOPE</Text>
			<View style={styles.card}>
				<Text style={styles.scopeLine}>
					{likes} {likes === 1 ? "like" : "likes"} · {tradeoffs} trade-off
					{tradeoffs === 1 ? "" : "s"} · {areas.length}{" "}
					{areas.length === 1 ? "area" : "areas"} explored
				</Text>
				<Pressable
					style={styles.resetBtn}
					onPress={confirmReset}
					accessibilityRole="button"
				>
					<Text style={styles.resetTxt}>Start fresh</Text>
				</Pressable>
			</View>

			{/* Account — sign in/out and the deletion Apple requires in-app. */}
			<Text style={styles.sectionHead}>ACCOUNT</Text>
			<View style={styles.card}>
				{session ? (
					<>
						<View style={styles.settingRow}>
							<Text style={styles.settingLabel} numberOfLines={1}>
								{session.user.email ?? "Signed in with Apple"}
							</Text>
						</View>
						<Pressable
							style={styles.accountRow}
							onPress={() => void signOut()}
							accessibilityRole="button"
						>
							<Text style={styles.accountAction}>Sign out</Text>
						</Pressable>
						<Pressable
							style={styles.accountRow}
							onPress={confirmDeleteAccount}
							accessibilityRole="button"
						>
							<Text style={styles.accountDelete}>Delete account</Text>
						</Pressable>
					</>
				) : (
					<Pressable
						style={styles.accountRowPlain}
						onPress={() => router.push("/auth")}
						accessibilityRole="button"
					>
						<Text style={styles.accountAction}>Sign in</Text>
						<Text style={styles.accountSub}>
							Keep your saved homes on every device
						</Text>
					</Pressable>
				)}
			</View>

			{/* Settings — only real switches. */}
			<Text style={styles.sectionHead}>SETTINGS</Text>
			<View style={styles.card}>
				<View style={styles.settingRow}>
					<Text style={styles.settingLabel}>Sound autoplay</Text>
					<Switch
						value={soundOn}
						onValueChange={toggleSound}
						trackColor={{ true: colors.pos }}
					/>
				</View>
			</View>
		</ScrollView>
	);
}

/**
 * How many verdicts the You tab shows. The store keeps `RECENT_CAP` (30); this
 * is a summary, not an archive, and more rows would push the sections the page
 * is actually about below the fold.
 */
const RECENT_SHOWN = 4;

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	title: { ...textStyles.title1, color: colors.ink, marginBottom: 12 },
	personaCard: {
		backgroundColor: colors.cta,
		borderRadius: radii.tile,
		padding: 18,
		gap: 6,
		marginBottom: 8,
	},
	eyebrow: { ...textStyles.caption, color: colors.onCardDim },
	personaName: { ...textStyles.title2, color: colors.onCard },
	personaSub: { ...textStyles.footnote, color: colors.onCardDim },
	sectionHead: {
		...textStyles.caption,
		color: colors.accent,
		marginTop: 22,
		marginBottom: 8,
	},
	card: {
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		paddingHorizontal: 14,
		paddingVertical: 6,
	},
	emptyLine: {
		...textStyles.footnote,
		color: colors.ink2,
		paddingVertical: 12,
	},
	recentRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
	},
	recentThumb: {
		width: 52,
		height: 52,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
	},
	recentThumbEmpty: { backgroundColor: colors.surface2 },
	recentText: { flex: 1, minWidth: 0 },
	recentTitle: { ...textStyles.headline, color: colors.ink },
	recentSub: { ...textStyles.footnote, color: colors.ink2, marginTop: 2 },
	recentVerdict: { ...textStyles.footnote, fontWeight: "600", marginTop: 2 },
	verdictYes: { color: colors.pos },
	verdictNo: { color: colors.neg },
	/** A link, not a button: undoing is a quiet correction, not a CTA. */
	bringBack: {
		paddingVertical: 8,
		paddingLeft: 8,
		minHeight: 44,
		justifyContent: "center",
	},
	bringBackPressed: { opacity: 0.6 },
	bringBackTxt: { ...textStyles.headline, color: colors.accent },
	areaRow: {
		paddingVertical: 10,
		gap: 6,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	areaText: { gap: 2 },
	areaName: { ...textStyles.headline, color: colors.ink },
	areaScore: { ...textStyles.footnote, color: colors.accent },
	areaSub: { ...textStyles.footnote, color: colors.ink2 },
	meter: {
		flexDirection: "row",
		height: 5,
		borderRadius: 3,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	meterWide: {
		flexDirection: "row",
		height: 5,
		borderRadius: 3,
		backgroundColor: colors.surface2,
		overflow: "hidden",
		flex: 1,
		marginLeft: 12,
	},
	meterFill: { backgroundColor: colors.pos },
	exploreRow: { paddingVertical: 12 },
	exploreTxt: { ...textStyles.footnote, color: colors.accent },
	dimRow: {
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	dimTop: { flexDirection: "row", alignItems: "center" },
	dimLabel: { ...textStyles.body, color: colors.ink },
	stillTrue: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		marginTop: 10,
	},
	stillTrueTxt: { ...textStyles.footnote, color: colors.ink2 },
	stillYes: { ...textStyles.footnote, color: colors.accent },
	stillNo: { ...textStyles.footnote, color: colors.neg },
	scopeLine: { ...textStyles.body, color: colors.ink, paddingVertical: 10 },
	resetBtn: {
		alignSelf: "flex-start",
		backgroundColor: colors.surface2,
		borderRadius: radii.btn,
		paddingHorizontal: 16,
		paddingVertical: 10,
		marginBottom: 10,
	},
	resetTxt: { ...textStyles.headline, color: colors.neg },
	settingRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	settingLabel: { ...textStyles.body, color: colors.ink },
	accountRow: {
		paddingVertical: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
		gap: 2,
	},
	accountRowPlain: { paddingVertical: 12, gap: 2 },
	accountAction: { ...textStyles.headline, color: colors.accent },
	accountDelete: { ...textStyles.headline, color: colors.neg },
	accountSub: { ...textStyles.footnote, color: colors.ink2 },
});
