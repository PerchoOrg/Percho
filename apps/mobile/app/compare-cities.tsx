/**
 * `/compare-cities?slugs=suwanee-ga,duluth-ga` — 2–3 saved cities side by side
 * (phase402, owner: 「city compare还是之前的版本 改成community compare的版本」).
 *
 * The community comparison's screen, fed by the cities' own pages: their
 * films' first frames as the header, one colour a city, "In short", then a
 * card per Explore direction — `lib/city/compare-visuals.ts` fills them. It
 * replaces the county table (`/compare-areas`) for any set of saved places
 * that all have a city page; that table compared counties, so two cities in
 * one county could not be compared at all.
 */
import type { CityDetailDTO } from "@percho/shared/city";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	CompareCards,
	CompareHero,
	CompareKey,
	type ComparePlace,
	InShort,
	placeColor,
} from "../components/compare/CompareVisuals";
import { apiBase } from "../lib/api/base";
import {
	CITY_COMPARE_MAX,
	CITY_COMPARE_MIN,
	buildCityCompareVisuals,
	buildCityInShort,
} from "../lib/city/compare-visuals";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

type State =
	| { status: "loading" }
	| { status: "ready"; cities: CityDetailDTO[] }
	| { status: "error" };

export default function CompareCitiesScreen() {
	const insets = useSafeAreaInsets();
	const { slugs } = useLocalSearchParams<{ slugs?: string }>();
	const key = (slugs ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, CITY_COMPARE_MAX)
		.join(",");
	const [state, setState] = useState<State>({ status: "loading" });
	const [nonce, setNonce] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger
	useEffect(() => {
		let live = true;
		setState({ status: "loading" });
		(async () => {
			try {
				const rows = await Promise.all(
					key.split(",").map(async (slug) => {
						const res = await fetch(
							`${apiBase()}/api/mobile/city/${encodeURIComponent(slug)}`,
						);
						if (!res.ok) return null;
						return (await res.json()) as CityDetailDTO;
					}),
				);
				if (!live) return;
				const ok = rows.filter((c): c is CityDetailDTO => c !== null);
				// One column is not a comparison — the community screen's rule.
				setState(
					ok.length >= CITY_COMPARE_MIN
						? { status: "ready", cities: ok }
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

	const cities = state.status === "ready" ? state.cities : null;
	const visuals = useMemo(
		() => (cities ? buildCityCompareVisuals(cities) : null),
		[cities],
	);
	const short = useMemo(
		() => (visuals && cities ? buildCityInShort(visuals, cities) : []),
		[visuals, cities],
	);
	const places: ComparePlace[] = (cities ?? []).map((c, i) => ({
		id: c.slug,
		name: c.name,
		place: c.county ? `${c.county} County, ${c.state}` : c.state,
		...(c.posterUrl ? { thumbUrl: c.posterUrl } : {}),
		color: placeColor(i),
	}));

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
			<View style={styles.header}>
				<Pressable
					onPress={() => router.back()}
					hitSlop={12}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Text style={styles.back}>‹</Text>
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
					<Text style={styles.body}>Couldn’t load these cities.</Text>
					<Pressable
						style={styles.btn}
						onPress={() => setNonce((n) => n + 1)}
						accessibilityRole="button"
					>
						<Text style={styles.btnTxt}>Try again</Text>
					</Pressable>
				</View>
			)}

			{visuals && (
				<ScrollView
					contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
					// The colour key (the second child) stays under the header.
					stickyHeaderIndices={[1]}
					showsVerticalScrollIndicator={false}
				>
					<CompareHero
						places={places}
						onOpen={(slug) => router.push(`/city/${slug}`)}
					/>
					<CompareKey places={places} />
					{short.length > 0 && <InShort lines={short} places={places} />}
					<CompareCards visuals={visuals} places={places} />
					<Text style={styles.foot}>
						Each figure is the one on the city’s own page, with its source
						there. Nothing here is ranked; crime is stated, never compared.
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
	back: { ...textStyles.title1, fontWeight: "400", color: colors.accent },
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
	foot: { ...textStyles.note, color: colors.ink3, marginTop: 18 },
});
