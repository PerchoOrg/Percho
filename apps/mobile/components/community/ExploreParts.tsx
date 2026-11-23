/**
 * What the community Explore page and the city page are both built from
 * (phase371): the titled tile, the rows a wide tile holds, and the Resources
 * block. They were `ExploreBody`'s own until the owner asked for the city page
 * to be brought in line with it (2026-11-22: "把city card explore也做对应的优化").
 */
import {
	Image,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { logoFor } from "../../lib/community/explore";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** The page's side padding and the gap between two tiles — a half tile's width follows from both. */
export const PAGE_PAD = 18;
export const GAP = 10;

export function Tile({
	label,
	wide,
	width,
	onPress,
	children,
}: {
	label: string;
	wide?: boolean;
	width: number;
	onPress: () => void;
	children: React.ReactNode;
}) {
	return (
		<Pressable
			style={({ pressed }) => [
				styles.tile,
				{ width: wide ? width * 2 + GAP : width },
				pressed && styles.pressed,
			]}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${label} — more`}
		>
			<View style={styles.tileHead}>
				<Text style={parts.tileLabel}>{label}</Text>
				<Text style={styles.chevron}>›</Text>
			</View>
			{children}
		</Pressable>
	);
}

/**
 * Resources: links under their headings, each with its site's own mark before
 * the word (owner 2026-11-22: "链接最好用logo和文字 更醒目"). A row scrolls
 * sideways, so a heading costs one line however many links it holds.
 */
export function Resources({
	groups,
}: {
	groups: readonly {
		group: string;
		links: readonly { label: string; url: string }[];
	}[];
}) {
	if (groups.length === 0) return null;
	return (
		<View style={styles.resources}>
			<Text style={parts.tileLabel}>Resources</Text>
			{groups.map((g) => (
				<View key={g.group} style={styles.resourceRow}>
					<Text style={styles.resourceGroup} numberOfLines={1}>
						{g.group}
					</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.resourceScroll}
						contentContainerStyle={styles.pills}
					>
						{g.links.map((l) => {
							const logo = logoFor(l.url);
							return (
								<Pressable
									key={l.url}
									style={({ pressed }) => [
										styles.pill,
										pressed && styles.pressed,
									]}
									onPress={() => void Linking.openURL(l.url).catch(() => {})}
									accessibilityRole="link"
								>
									{!!logo && (
										<Image source={{ uri: logo }} style={styles.pillLogo} />
									)}
									<Text style={styles.pillText}>{l.label}</Text>
								</Pressable>
							);
						})}
					</ScrollView>
				</View>
			))}
		</View>
	);
}

/** The type and layout a tile's content is set in, shared by both pages. */
export const parts = StyleSheet.create({
	grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginTop: 16 },
	/**
	 * `ink2`, not the accent (phase367). Six coloured labels were the loudest
	 * thing in the grid, ahead of the figures they name. The accent on this
	 * page is the finding itself — a rank, the community's line on a chart.
	 */
	tileLabel: { ...textStyles.caption, fontSize: 10.5, color: colors.ink2 },
	figure: {
		...textStyles.title2,
		fontSize: 24,
		color: colors.ink,
		marginTop: 4,
	},
	figureUnit: { ...textStyles.footnote, fontSize: 12, color: colors.ink2 },
	foot: {
		...textStyles.footnote,
		fontSize: 11.5,
		color: colors.ink2,
		marginTop: 5,
	},
	footSecond: {
		...textStyles.footnote,
		fontSize: 11.5,
		color: colors.ink2,
		marginTop: 1,
	},
	/** A wide tile's rows: a name on one line, its figure at the right edge. */
	rows: { marginTop: 4 },
	row: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 10,
		paddingVertical: 4,
	},
	rowKind: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink2,
		width: 84,
	},
	rowName: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
		flex: 1,
		minWidth: 0,
	},
	/** A distance, a zone: the row's quieter second fact. */
	rowAside: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink2,
		fontVariant: ["tabular-nums"],
	},
	/** A standing, in the row's own type. Wide enough for "Top 100%". */
	rowShare: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "600",
		color: colors.ink,
		width: 62,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},
});

const styles = StyleSheet.create({
	pressed: { opacity: 0.7 },
	tile: {
		backgroundColor: colors.surface,
		borderRadius: radii.btn,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 12,
	},
	tileHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	chevron: {
		...textStyles.footnote,
		fontSize: 18,
		lineHeight: 18,
		color: colors.ink3,
	},
	resources: { marginTop: 18, gap: 8 },
	resourceRow: { flexDirection: "row", alignItems: "center" },
	resourceGroup: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink2,
		width: 76,
	},
	// A row of links runs to the screen's right edge; the heading keeps the
	// page's inset.
	resourceScroll: { marginRight: -PAGE_PAD },
	pills: { paddingRight: PAGE_PAD, gap: 7 },
	pill: {
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
	pillText: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "500",
		color: colors.ink,
	},
	pillLogo: { width: 16, height: 16, borderRadius: 4 },
});
