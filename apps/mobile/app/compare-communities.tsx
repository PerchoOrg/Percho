/**
 * `/compare-communities?ids=a,b[,c]` — 2–3 saved communities side by side.
 *
 * Pushed from the Saved tab. Each community re-fetches its detail (the store
 * keeps ids only), and the table is `lib/community/compare-communities.ts`.
 * Tap a column header → that community's page.
 *
 * Built on `/compare`'s layout deliberately — same label column, same row
 * hairlines, same "—" for a figure we do not have. A buyer who has compared
 * homes should not have to learn a second table to compare neighbourhoods.
 *
 * The one difference is the PICKER, or rather its absence: `/compare` is
 * reached by ticking homes, because a shortlist of saved homes runs long. The
 * saved communities ARE the shortlist — the same argument the area compare
 * makes — so Saved passes them straight through.
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
import { communityDetailUrl } from "../lib/api/base";
import {
	COMMUNITY_COMPARE_MAX,
	COMMUNITY_COMPARE_MIN,
	buildCommunityCompareTable,
} from "../lib/community/compare-communities";
import type { CommunityDetailDTO } from "../lib/community/detail-dto";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

type State =
	| { status: "loading" }
	| { status: "ready"; communities: CommunityDetailDTO[] }
	| { status: "error" };

export default function CompareCommunitiesScreen() {
	const insets = useSafeAreaInsets();
	const { ids } = useLocalSearchParams<{ ids?: string }>();
	const list = (ids ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, COMMUNITY_COMPARE_MAX);
	const key = list.join(",");
	const [state, setState] = useState<State>({ status: "loading" });
	const [nonce, setNonce] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger; `key` stands in for `list`
	useEffect(() => {
		let live = true;
		setState({ status: "loading" });
		(async () => {
			try {
				const rows = await Promise.all(
					key.split(",").map(async (id) => {
						const res = await fetch(communityDetailUrl(id));
						if (!res.ok) return null;
						return (await res.json()) as CommunityDetailDTO;
					}),
				);
				if (!live) return;
				const ok = rows.filter((c): c is CommunityDetailDTO => c !== null);
				// One column is not a comparison. A community that 404s (delisted,
				// or a stale saved id) drops out, and if that leaves fewer than two
				// the screen says so rather than drawing a single lonely column.
				setState(
					ok.length >= COMMUNITY_COMPARE_MIN
						? { status: "ready", communities: ok }
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
			? buildCommunityCompareTable(state.communities)
			: null;

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
					<Text style={styles.body}>Couldn’t load these neighbourhoods.</Text>
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
					<View style={styles.tableRow}>
						<View style={styles.labelCol} />
						{table.headers.map((h) => (
							<Pressable
								key={h.id}
								style={styles.cell}
								onPress={() => router.push(`/community/${h.slug}`)}
								accessibilityRole="button"
								accessibilityLabel={`Open ${h.name}`}
							>
								{h.thumbUrl ? (
									<Image source={{ uri: h.thumbUrl }} style={styles.thumb} />
								) : (
									<View style={styles.thumb} />
								)}
								<Text style={styles.headName} numberOfLines={2}>
									{h.name}
								</Text>
								{!!h.place && (
									<Text style={styles.headPlace} numberOfLines={1}>
										{h.place}
									</Text>
								)}
							</Pressable>
						))}
					</View>

					{table.rows.map((r) => (
						<View key={r.label} style={[styles.tableRow, styles.dataRow]}>
							<View style={styles.labelCol}>
								<Text style={styles.label}>{r.label}</Text>
								{r.note && <Text style={styles.note}>{r.note}</Text>}
							</View>
							{r.cells.map((c, i) => (
								<View
									key={table.headers[i]?.id ?? String(i)}
									style={styles.cell}
								>
									<Text style={[styles.value, !c && styles.valueBlank]}>
										{c ?? "—"}
									</Text>
								</View>
							))}
						</View>
					))}

					{/* The same promise the home table's foot makes, and it has to be
					    made here too: nothing on this screen is ranked, and the
					    counts are of the places we know about rather than of every
					    place that exists. */}
					<Text style={styles.foot}>
						The same figures each neighbourhood’s page shows — no ranking, no
						score. Ratings are from residents whose review we have approved, and
						a count is of the places we know about nearby, not a census.
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
	center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
	body: { ...textStyles.body, color: colors.ink2 },
	btn: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		paddingHorizontal: 20,
		paddingVertical: 12,
	},
	btnTxt: { ...textStyles.headline, color: colors.surface },
	tableRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
	dataRow: {
		paddingVertical: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	labelCol: { width: 92 },
	label: { ...textStyles.footnote, color: colors.ink2 },
	note: { ...textStyles.caption, fontSize: 9.5, color: colors.ink3 },
	cell: { flex: 1 },
	thumb: {
		width: "100%",
		aspectRatio: 4 / 3,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
		marginBottom: 6,
	},
	headName: { ...textStyles.footnote, color: colors.ink },
	headPlace: { ...textStyles.caption, color: colors.ink2 },
	value: { ...textStyles.footnote, color: colors.ink },
	valueBlank: { color: colors.ink3 },
	foot: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: 18,
		lineHeight: 15,
	},
});
