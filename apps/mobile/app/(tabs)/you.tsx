/**
 * You tab (spec-v3 05 §5.3) — persona, recent, areas, preferences, account.
 *
 * ── phase276 layout (owner, 2026-09-11: "a lot of sections there and people
 *    will get confused") — eight sections became five ────────────────────────
 *   · Persona card — always named (`lib/feed/persona.ts`), with the three
 *     counts as pills. No "Stage X of 5": the funnel collapsed on 2026-08-15.
 *   · Recent — the swipe history as a horizontal strip, verdict on the thumb
 *     and "Bring back" under it (phase140's undo, in a row instead of a list).
 *     The owner rejected the §1.8 Undo toast on the feed; a correction belongs
 *     on the surface that explains what Percho concluded.
 *   · YOUR AREAS — `familiarityFor`, the SAME source the Search tab's
 *     familiar-first sort reads (§5.3 hard rule: the two faces cannot
 *     disagree). Horizontal chips so a buyer who has seen twenty areas gets one
 *     row, not a wall. Chip tap → Search tab focused on the unit.
 *   · YOUR PREFERENCES — one card, two labelled groups. "You set" is what the
 *     buyer TOLD us (`lib/priorities.ts`); "From your swipes" is what we
 *     inferred (`signals.dims`). Kept as separate groups on purpose: they are
 *     different kinds of claim, and merging them would let the app quietly
 *     overrule a stated answer. The × on an inferred chip is §5.3's
 *     correction — it removes the dim's weight.
 *   · Account — sign in / out, the sound switch, "Start fresh" (the scope it
 *     erases is in the confirm), and the in-app deletion App Review 5.1.1(v)
 *     requires. Session state from `state/auth.ts`; actions in `lib/auth.ts`.
 *   · The policy pages and the version are references, not settings — plain
 *     text under the last card, no heading.
 */
import Constants from "expo-constants";
import { router } from "expo-router";
import { useMemo } from "react";
import {
	Alert,
	Image,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { familiarityFor } from "../../lib/area-familiarity";
import { deleteAccount, signOut } from "../../lib/auth";
import { DIM_LABELS, personaName, rankedDims } from "../../lib/feed/persona";
import { PRIORITIES, WEIGHT_LABELS } from "../../lib/priorities";
import { useAuthStore } from "../../state/auth";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { usePriorityStore } from "../../state/priorities";
import { useSoundStore } from "../../state/sound";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export default function YouTab() {
	const insets = useSafeAreaInsets();
	const signals = useFeedSession((s) => s.signals);
	const clearSignals = useFeedSession((s) => s.clearSignals);
	const removeDim = useFeedSession((s) => s.removeDim);
	const recent = useFeedSession((s) => s.recent);
	const bringBack = useFeedSession((s) => s.bringBack);

	const weights = usePriorityStore((s) => s.weights);
	const setWeight = usePriorityStore((s) => s.setWeight);

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

	const likes =
		signals.likedListingIds.length + signals.likedCommunityIds.length;
	const tradeoffs = signals.tradeoffCount ?? 0;
	const name = personaName(signals.dims);

	const areas = useMemo(() => {
		return pool.geoUnits
			.map((u) => ({ unit: u, fam: familiarityFor(signals, u.id) }))
			.filter((a) => a.fam.cardsSeen > 0)
			.sort((a, b) => b.fam.score - a.fam.score);
	}, [pool.geoUnits, signals]);

	const dims = useMemo(() => {
		const ranked = rankedDims(signals.dims);
		const max = ranked[0]?.weight ?? 1;
		return ranked.map((d) => ({ ...d, strength: d.weight / max }));
	}, [signals.dims]);

	const confirmReset = () => {
		// §5.3: no bare reset without a recap of what it erases.
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
				<Text style={styles.eyebrow}>YOUR BUYER TYPE</Text>
				<Text style={styles.personaName}>{name}</Text>
				<View style={styles.pills}>
					<Text style={styles.pill}>
						{likes} {likes === 1 ? "like" : "likes"}
					</Text>
					<Text style={styles.pill}>
						{tradeoffs} trade-off{tradeoffs === 1 ? "" : "s"}
					</Text>
					<Text style={styles.pill}>
						{areas.length} {areas.length === 1 ? "area" : "areas"}
					</Text>
				</View>
			</View>

			{/*
			 * RECENT — what the buyer just did, and the one way to take it back.
			 * Rows are SNAPSHOTS taken at swipe time (`lib/feed/recent.ts`), so
			 * the strip paints instantly and shows the price the buyer actually
			 * saw. Trade-off answers are absent by construction: §1.8 rules them
			 * out of undo, and `recentEntryFor` returns null for them.
			 */}
			{recent.length > 0 && (
				<>
					<Text style={styles.sectionHead}>RECENT</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.strip}
						contentContainerStyle={styles.stripContent}
					>
						{recent.slice(0, RECENT_SHOWN).map((e) => (
							<View key={e.id} style={styles.recentCard}>
								<View style={styles.recentThumb}>
									{e.thumbUrl ? (
										<Image
											source={{ uri: e.thumbUrl }}
											style={StyleSheet.absoluteFill}
										/>
									) : null}
									<Text
										style={[
											styles.verdict,
											e.verdict === "right"
												? styles.verdictYes
												: styles.verdictNo,
										]}
									>
										{e.verdict === "right" ? "LIKED" : "PASSED"}
									</Text>
								</View>
								<Text style={styles.recentTitle} numberOfLines={1}>
									{e.title}
								</Text>
								{e.subtitle ? (
									<Text style={styles.recentSub} numberOfLines={1}>
										{e.subtitle}
									</Text>
								) : null}
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
					</ScrollView>
				</>
			)}

			{/* Area familiarity — same data the Search tab sorts by. */}
			<Text style={styles.sectionHead}>YOUR AREAS</Text>
			{areas.length === 0 ? (
				<View style={styles.card}>
					<Text style={styles.emptyLine}>
						Swipe a few cards and your map starts filling in.
					</Text>
				</View>
			) : (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={styles.strip}
					contentContainerStyle={styles.stripContent}
				>
					{areas.map(({ unit, fam }) => (
						<Pressable
							key={unit.id}
							style={styles.areaChip}
							onPress={() => focusArea(unit.id)}
							accessibilityRole="button"
							accessibilityLabel={`${unit.name}, ${fam.score} percent explored`}
						>
							<Text style={styles.areaName}>
								{unit.name} <Text style={styles.areaScore}>{fam.score}%</Text>
							</Text>
							<View style={styles.meter}>
								<View style={[styles.meterFill, { flex: fam.score }]} />
								<View style={{ flex: Math.max(100 - fam.score, 0) }} />
							</View>
						</Pressable>
					))}
					<Pressable
						style={styles.areaMore}
						onPress={() => router.navigate("/(tabs)/search")}
						accessibilityRole="button"
					>
						<Text style={styles.areaMoreTxt}>See all on map →</Text>
					</Pressable>
				</ScrollView>
			)}

			{/* Declared, then inferred — two groups, one card (see header). */}
			<Text style={styles.sectionHead}>YOUR PREFERENCES</Text>
			<View style={styles.card}>
				<Text style={styles.groupHead}>You set</Text>
				{PRIORITIES.map((p) => (
					<View key={p.key} style={styles.prioRow}>
						<Text style={styles.prioLabel}>{p.label}</Text>
						<View style={styles.prioSteps}>
							{WEIGHT_LABELS.map((weightLabel, w) => (
								<Pressable
									// The step's own meaning is its identity — these four are
									// fixed values, not a list that can reorder.
									key={weightLabel}
									onPress={() => setWeight(p.key, w)}
									hitSlop={6}
									style={[
										styles.prioStep,
										weights[p.key] >= w && w > 0 && styles.prioStepOn,
										weights[p.key] === w && styles.prioStepHere,
									]}
									accessibilityRole="button"
									accessibilityLabel={`${p.label}: ${weightLabel}`}
								/>
							))}
						</View>
					</View>
				))}

				<Text style={[styles.groupHead, styles.groupHeadSplit]}>
					From your swipes
				</Text>
				{dims.length === 0 ? (
					<Text style={styles.emptyLine}>
						Answer a trade-off card and what Percho learns shows up here.
					</Text>
				) : (
					<View style={styles.dimChips}>
						{dims.map((d) => (
							<Pressable
								key={d.dim}
								onPress={() => removeDim(d.dim)}
								hitSlop={4}
								style={[styles.dimChip, d.strength < 0.5 && styles.dimChipWeak]}
								accessibilityRole="button"
								accessibilityLabel={`${DIM_LABELS[d.dim]}. Remove.`}
							>
								<Text style={styles.dimLabel}>{DIM_LABELS[d.dim]}</Text>
								<Text style={styles.dimX}>×</Text>
							</Pressable>
						))}
					</View>
				)}
			</View>

			{/* Account — session, the one switch, and the two destructive acts. */}
			<Text style={styles.sectionHead}>ACCOUNT</Text>
			<View style={styles.card}>
				{session ? (
					<View style={styles.settingRow}>
						<Text style={styles.settingLabel} numberOfLines={1}>
							{session.user.email ?? "Signed in with Apple"}
						</Text>
					</View>
				) : (
					<Pressable
						style={styles.settingRow}
						onPress={() => router.push("/auth")}
						accessibilityRole="button"
					>
						<View>
							<Text style={styles.accountAction}>Sign in</Text>
							<Text style={styles.accountSub}>
								Keep your saved homes on every device
							</Text>
						</View>
					</Pressable>
				)}
				<View style={[styles.settingRow, styles.accountRow]}>
					<Text style={styles.settingLabel}>Sound autoplay</Text>
					<Switch
						value={soundOn}
						onValueChange={toggleSound}
						trackColor={{ true: colors.pos }}
					/>
				</View>
				{/* Email accounts only. An Apple account has no password to set —
				    Apple IS the credential, and offering one would imply the
				    Apple button could be replaced by it. */}
				{session?.user.email ? (
					<Pressable
						style={styles.accountRow}
						onPress={() => router.push("/set-password")}
						accessibilityRole="button"
					>
						<Text style={styles.accountAction}>Set a password</Text>
						<Text style={styles.accountSub}>
							Sign in without waiting for a code
						</Text>
					</Pressable>
				) : null}
				{session ? (
					<Pressable
						style={styles.accountRow}
						onPress={() => void signOut()}
						accessibilityRole="button"
					>
						<Text style={styles.accountAction}>Sign out</Text>
					</Pressable>
				) : null}
				<Pressable
					style={styles.accountRow}
					onPress={confirmReset}
					accessibilityRole="button"
				>
					<Text style={styles.accountDelete}>Start fresh</Text>
					<Text style={styles.accountSub}>
						Clear likes, trade-offs and area history
					</Text>
				</Pressable>
				{session ? (
					<Pressable
						style={styles.accountRow}
						onPress={confirmDeleteAccount}
						accessibilityRole="button"
					>
						<Text style={styles.accountDelete}>Delete account</Text>
					</Pressable>
				) : null}
			</View>

			{/* References — the pages the store listing points at (they open in
			    the system browser, so one source), and the build. */}
			<View style={styles.footer}>
				<View style={styles.footerLinks}>
					{LINKS.map((l, i) => (
						<Text key={l.href} style={styles.footerTxt}>
							{i > 0 ? " · " : ""}
							<Text
								style={styles.footerLink}
								onPress={() => void Linking.openURL(l.href)}
								accessibilityRole="link"
							>
								{l.label}
							</Text>
						</Text>
					))}
				</View>
				<Text style={styles.footerTxt}>
					Percho {Constants.expoConfig?.version ?? "?"}
					{buildLabel()}
				</Text>
			</View>
		</ScrollView>
	);
}

/**
 * How many verdicts the strip shows. The store keeps `RECENT_CAP` (30); this
 * is a summary, not an archive.
 */
const RECENT_SHOWN = 10;

const LINKS = [
	{ label: "Privacy", href: "https://www.percho.co/privacy" },
	{ label: "Terms", href: "https://www.percho.co/terms" },
	{ label: "Contact & support", href: "https://www.percho.co/contact" },
] as const;

/** " (build 2)" from app.json; empty in Expo Go where there is no build. */
function buildLabel(): string {
	const build =
		Constants.expoConfig?.ios?.buildNumber ??
		Constants.expoConfig?.android?.versionCode;
	return build ? ` (build ${build})` : "";
}

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
	pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
	pill: {
		...textStyles.footnote,
		fontWeight: "500",
		color: colors.onCard,
		backgroundColor: "rgba(255,255,255,0.14)",
		borderRadius: radii.pill,
		paddingHorizontal: 10,
		paddingVertical: 4,
		overflow: "hidden",
	},
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
	/** A horizontal strip bleeds to the screen edge, past the page padding. */
	strip: { marginHorizontal: -20 },
	stripContent: { paddingHorizontal: 20, gap: 10 },
	recentCard: { width: 124, gap: 4 },
	recentThumb: {
		width: 124,
		height: 96,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
		overflow: "hidden",
		marginBottom: 2,
	},
	verdict: {
		...textStyles.caption,
		fontSize: 10,
		position: "absolute",
		top: 8,
		left: 8,
		backgroundColor: colors.glass,
		borderRadius: radii.pill,
		paddingHorizontal: 7,
		paddingVertical: 3,
		overflow: "hidden",
	},
	verdictYes: { color: colors.pos },
	verdictNo: { color: colors.neg },
	recentTitle: { ...textStyles.footnote, fontWeight: "600", color: colors.ink },
	recentSub: { ...textStyles.footnote, fontSize: 12, color: colors.ink2 },
	/** A link, not a button: undoing is a quiet correction, not a CTA. */
	bringBack: { paddingVertical: 6, minHeight: 32, justifyContent: "center" },
	bringBackPressed: { opacity: 0.6 },
	bringBackTxt: {
		...textStyles.footnote,
		fontWeight: "600",
		color: colors.accent,
	},
	areaChip: {
		backgroundColor: colors.surface,
		borderRadius: radii.btn,
		paddingHorizontal: 14,
		paddingVertical: 10,
		gap: 6,
		minWidth: 120,
	},
	areaName: { ...textStyles.headline, color: colors.ink },
	areaScore: { ...textStyles.footnote, color: colors.accent },
	areaMore: { justifyContent: "center", paddingHorizontal: 4 },
	areaMoreTxt: {
		...textStyles.footnote,
		fontWeight: "600",
		color: colors.accent,
	},
	meter: {
		flexDirection: "row",
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	meterFill: { backgroundColor: colors.pos },
	groupHead: {
		...textStyles.footnote,
		fontWeight: "600",
		color: colors.ink2,
		paddingTop: 10,
		paddingBottom: 2,
	},
	groupHeadSplit: {
		marginTop: 6,
		paddingTop: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	prioRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 10,
	},
	prioLabel: { ...textStyles.headline, color: colors.ink },
	prioSteps: { flexDirection: "row", gap: 7, alignItems: "center" },
	prioStep: {
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: colors.surface2,
		borderWidth: 1,
		borderColor: colors.border,
	},
	prioStepOn: { backgroundColor: colors.accent, borderColor: colors.accent },
	prioStepHere: { borderColor: colors.ink },
	dimChips: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		paddingTop: 4,
		paddingBottom: 10,
	},
	dimChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: colors.surface2,
		borderRadius: radii.pill,
		paddingLeft: 14,
		paddingRight: 10,
		paddingVertical: 8,
	},
	dimChipWeak: { opacity: 0.6 },
	dimLabel: { ...textStyles.footnote, fontWeight: "500", color: colors.ink },
	dimX: { ...textStyles.footnote, color: colors.ink3 },
	settingRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 10,
	},
	settingLabel: { ...textStyles.body, color: colors.ink },
	accountRow: {
		paddingVertical: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
		gap: 2,
	},
	accountAction: { ...textStyles.headline, color: colors.accent },
	accountDelete: { ...textStyles.headline, color: colors.neg },
	accountSub: { ...textStyles.footnote, color: colors.ink2 },
	footer: { alignItems: "center", gap: 4, marginTop: 26 },
	footerLinks: { flexDirection: "row" },
	footerTxt: { ...textStyles.footnote, fontSize: 12, color: colors.ink3 },
	footerLink: { color: colors.ink2 },
});
