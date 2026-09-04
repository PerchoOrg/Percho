/**
 * `/compare?ids=a,b[,c]` — 2–3 saved homes side by side (phase D, 05 §5.2).
 *
 * Pushed from the Saved tab's compare picker. Each home re-fetches its detail
 * (the store keeps ids only), the table is `lib/listing/compare.ts`, and the
 * monthly figure uses the same live rate as the listing page's cost block.
 * Tap a column header → that home's page.
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
import { listingDetailUrl } from "../lib/api/base";
import {
	COMPARE_MAX,
	COMPARE_MIN,
	buildCompareTable,
} from "../lib/listing/compare";
import type { ListingDetailDTO } from "../lib/listing/detail-dto";
import { useRates } from "../lib/listing/rates";
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
	const [state, setState] = useState<State>({ status: "loading" });
	const [nonce, setNonce] = useState(0);

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
			? buildCompareTable(state.homes, rate.annualRate)
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
					<View style={styles.tableRow}>
						<View style={styles.labelCol} />
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
								<Text style={styles.headCity} numberOfLines={1}>
									{h.city}
								</Text>
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

					<Text style={styles.foot}>
						Figures are the same ones each home’s page shows — no ranking, no
						score. Schools are the nearest public school by distance, not an
						assignment.
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
	headAddr: { ...textStyles.footnote, color: colors.ink },
	headCity: { ...textStyles.caption, color: colors.ink2 },
	value: { ...textStyles.footnote, color: colors.ink },
	valueBlank: { color: colors.ink3 },
	foot: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: 18,
		lineHeight: 15,
	},
});
