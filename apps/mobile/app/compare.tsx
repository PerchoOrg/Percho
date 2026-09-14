/**
 * `/compare?ids=a,b[,c]` — 2–3 saved homes side by side (phase D, 05 §5.2).
 *
 * Pushed from the Saved tab. Each home re-fetches its detail (the store
 * keeps ids only), the table is `lib/listing/compare.ts`, and the monthly
 * figure uses the same live rate as the listing page's cost block.
 * Tap a column header → that home's page.
 *
 * Since phase270 the screen LEADS with the take (`lib/listing/take.ts`,
 * owner: results "should look like a real suggestion from a friend or
 * agent") and the table follows as the evidence. The table itself still
 * ranks nothing — the opinion lives in the card that is labelled as one.
 *
 * Since phase280 the evidence is four named aspect sections — Schools,
 * Convenience, Safety, Potential, the owner's four — with "the basics"
 * (cost, size, HOA…) underneath; only the basics collapse behind the
 * "show all" toggle, and price lives in the header column.
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
	ColumnHeaderSpacer,
	CompareBlock,
} from "../components/compare/CompareSection";
import { TakeCard } from "../components/compare/TakeCard";
import { listingDetailUrl } from "../lib/api/base";
import { splitRows } from "../lib/compare/take";
import {
	COMPARE_MAX,
	COMPARE_MIN,
	buildCompareTable,
} from "../lib/listing/compare";
import type { ListingDetailDTO } from "../lib/listing/detail-dto";
import { useRates } from "../lib/listing/rates";
import { buildHomeTake } from "../lib/listing/take";
import { usePriorityStore } from "../state/priorities";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

type State =
	| { status: "loading" }
	| { status: "ready"; homes: ListingDetailDTO[] }
	| { status: "error" };

export default function CompareScreen() {
	const insets = useSafeAreaInsets();
	const { ids } = useLocalSearchParams<{ ids?: string }>();
	const list = (ids ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, COMPARE_MAX);
	const key = list.join(",");
	const rate = useRates();
	// What the buyer said matters, from the You tab. Orders both the take's
	// case and the table's rows; never changes a figure or who wins one.
	const weights = usePriorityStore((s) => s.weights);
	const [state, setState] = useState<State>({ status: "loading" });
	const [nonce, setNonce] = useState(0);
	const [showAll, setShowAll] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger; `key` stands in for `list`
	useEffect(() => {
		let live = true;
		setState({ status: "loading" });
		(async () => {
			try {
				const homes = await Promise.all(
					key.split(",").map(async (id) => {
						const res = await fetch(listingDetailUrl(id));
						if (!res.ok) return null;
						return (await res.json()) as ListingDetailDTO;
					}),
				);
				if (!live) return;
				const ok = homes.filter((h): h is ListingDetailDTO => h !== null);
				setState(
					ok.length >= COMPARE_MIN
						? { status: "ready", homes: ok }
						: { status: "error" },
				);
			} catch {
				if (live) setState({ status: "error" });
			}
		})();
		return () => {
			live = false;
		};
	}, [key, nonce]);

	const table =
		state.status === "ready"
			? buildCompareTable(state.homes, rate.annualRate, weights)
			: null;
	const take =
		state.status === "ready"
			? buildHomeTake(state.homes, rate.annualRate, weights)
			: null;
	// Owner: "reduce the numbers part it is not very useful." Only the basics
	// collapse — the four aspect sections are the point of the screen and are
	// always whole. The basics are ordered by what the buyer said matters, so
	// the few that survive the cut are the few they asked for.
	const { shown, collapsible } = splitRows(table?.basics ?? [], showAll);

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
			<View style={styles.header}>
				<Pressable
					onPress={() => router.back()}
					hitSlop={12}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Text style={styles.back}>‹ Saved</Text>
				</Pressable>
				<Text style={styles.title}>Compare</Text>
			</View>

			{state.status === "loading" && (
				<View style={styles.center}>
					<ActivityIndicator color={colors.ink2} />
				</View>
			)}
			{state.status === "error" && (
				<View style={styles.center}>
					<Text style={styles.body}>Couldn’t load these homes.</Text>
					<Pressable
						style={styles.btn}
						onPress={() => setNonce((n) => n + 1)}
						accessibilityRole="button"
					>
						<Text style={styles.btnTxt}>Try again</Text>
					</Pressable>
				</View>
			)}

			{table && (
				<ScrollView
					contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
				>
					{take && <TakeCard take={take} />}
					<Text style={styles.factsHead}>The numbers behind it</Text>
					<View style={styles.headerRow}>
						<ColumnHeaderSpacer count={table.headers.length} />
						{table.headers.map((h) => (
							<Pressable
								key={h.id}
								style={styles.cell}
								onPress={() => router.push(`/listing/${h.id}`)}
								accessibilityRole="button"
							>
								{h.thumbUrl ? (
									<Image source={{ uri: h.thumbUrl }} style={styles.thumb} />
								) : (
									<View style={styles.thumb} />
								)}
								<Text style={styles.headAddr} numberOfLines={2}>
									{h.address}
								</Text>
								<Text style={styles.headCity} numberOfLines={2}>
									{h.city}
								</Text>
								{h.price && <Text style={styles.headPrice}>{h.price}</Text>}
							</Pressable>
						))}
					</View>

					{table.aspects.map((a) => (
						<CompareBlock
							key={a.key}
							title={a.title}
							{...(a.note ? { note: a.note } : {})}
							rows={a.rows}
							ids={table.headers.map((h) => h.id)}
						/>
					))}

					<CompareBlock
						title="The basics"
						rows={shown}
						ids={table.headers.map((h) => h.id)}
					>
						{collapsible && (
							<Pressable
								style={styles.more}
								onPress={() => setShowAll((v) => !v)}
								accessibilityRole="button"
							>
								<Text style={styles.moreTxt}>
									{showAll
										? "Show fewer"
										: `Show all ${table.basics.length} figures`}
								</Text>
							</Pressable>
						)}
					</CompareBlock>

					<Text style={styles.foot}>
						Built from these figures alone — feel free to disagree. Schools are
						the nearest by distance, not an assignment; the basics follow your
						You-tab priorities.
					</Text>
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginBottom: 12,
	},
	back: { ...textStyles.body, color: colors.accent },
	title: { ...textStyles.title2, color: colors.ink },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
	},
	body: { ...textStyles.body, color: colors.ink2 },
	btn: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		paddingHorizontal: 20,
		paddingVertical: 12,
	},
	btnTxt: { ...textStyles.headline, color: colors.surface },
	factsHead: { ...textStyles.caption, color: colors.ink3, marginBottom: 10 },
	headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	// Row/section geometry lives in `components/compare/CompareSection.tsx`
	// since phase281 — one renderer for homes and communities.
	cell: { flex: 1 },
	more: { minHeight: 44, justifyContent: "center", marginTop: 12 },
	moreTxt: { ...textStyles.footnote, fontWeight: "600", color: colors.accent },
	thumb: {
		width: "100%",
		aspectRatio: 4 / 3,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
		marginBottom: 6,
	},
	headAddr: { ...textStyles.footnote, color: colors.ink, textAlign: "center" },
	headCity: {
		...textStyles.caption,
		color: colors.ink2,
		textAlign: "center",
	},
	headPrice: {
		...textStyles.footnote,
		fontWeight: "600",
		color: colors.ink,
		textAlign: "center",
		marginTop: 1,
	},
	foot: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: 18,
		lineHeight: 15,
	},
});
