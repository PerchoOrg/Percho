/**
 * The Saved tab's flat views (phase386): the grid and the list. Both draw
 * `SavedTile`s (`lib/saved/shelves.ts`) and leave what a tap means — open, or
 * pick for a comparison — to the tab, so Select works the same in every view.
 */
import { fmlsNumberLabel } from "@percho/shared/fmls";
import { LinearGradient } from "expo-linear-gradient";
import {
	Image,
	Pressable,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import type { SavedTile } from "../../lib/saved/shelves";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export interface SavedViewProps {
	tiles: readonly SavedTile[];
	selecting: boolean;
	picked: readonly string[];
	/** The kind the first pick locked the selection to. */
	lockedKind: SavedTile["kind"] | null;
	onPress: (tile: SavedTile) => void;
}

/** What a tile is, said once on it: the flat views mix towns and what is in them. */
export const KIND_TAG: Record<SavedTile["kind"], string> = {
	area: "City",
	community: "Neighbourhood",
	listing: "Home",
};

const PAGE_PAD = 20;
const GRID_GAP = 10;

/** The state a tile is drawn in while selecting. */
function pickState(tile: SavedTile, p: SavedViewProps) {
	return {
		on: p.picked.includes(tile.id),
		dim: p.selecting && p.lockedKind !== null && p.lockedKind !== tile.kind,
	};
}

/** Kind, name, where and what its page found — for a screen reader. */
function spoken(tile: SavedTile): string {
	return [KIND_TAG[tile.kind], tile.title, tile.sub, tile.fact]
		.filter(Boolean)
		.join(", ");
}

/** Photographs, two across: the name and the finding sit on the picture. */
export function SavedGrid(props: SavedViewProps) {
	const { width } = useWindowDimensions();
	const tileW = Math.floor((width - PAGE_PAD * 2 - GRID_GAP) / 2);
	return (
		<View style={styles.grid}>
			{props.tiles.map((t) => {
				const { on, dim } = pickState(t, props);
				return (
					<Pressable
						key={t.id}
						style={[
							styles.gridTile,
							{ width: tileW, height: Math.round(tileW * 1.28) },
							dim && styles.dim,
						]}
						disabled={dim}
						onPress={() => props.onPress(t)}
						accessibilityRole={props.selecting ? "checkbox" : "button"}
						accessibilityState={props.selecting ? { checked: on } : undefined}
						accessibilityLabel={spoken(t)}
					>
						{!!t.thumbUrl && (
							<Image
								source={{ uri: t.thumbUrl }}
								style={StyleSheet.absoluteFill}
							/>
						)}
						<LinearGradient
							colors={[colors.cardGradFrom, colors.cardGradTo]}
							style={styles.gridShade}
						/>
						<View style={styles.gridText}>
							<Text style={styles.gridKind}>{KIND_TAG[t.kind]}</Text>
							<Text style={styles.gridTitle} numberOfLines={2}>
								{t.title}
							</Text>
							{!!t.sub && (
								<Text style={styles.gridSub} numberOfLines={1}>
									{t.sub}
								</Text>
							)}
							{!!t.fact && (
								<Text style={styles.gridFact} numberOfLines={2}>
									{t.fact}
								</Text>
							)}
							{!!fmlsNumberLabel(t.mlsNumber) && (
								<Text style={styles.gridSub} numberOfLines={1}>
									{fmlsNumberLabel(t.mlsNumber)}
								</Text>
							)}
						</View>
						{props.selecting && (
							<View
								style={[styles.tick, styles.tickOnPhoto, on && styles.tickOn]}
							>
								{on && <Text style={styles.tickMark}>✓</Text>}
							</View>
						)}
						{on && <View style={styles.gridRing} pointerEvents="none" />}
					</Pressable>
				);
			})}
		</View>
	);
}

/** One compact row a save: a thumbnail, the name, where, what its page found. */
export function SavedList(props: SavedViewProps) {
	return (
		<View style={styles.list}>
			{props.tiles.map((t, i) => {
				const { on, dim } = pickState(t, props);
				return (
					<Pressable
						key={t.id}
						style={[styles.row, i > 0 && styles.rowRule, dim && styles.dim]}
						disabled={dim}
						onPress={() => props.onPress(t)}
						accessibilityRole={props.selecting ? "checkbox" : "button"}
						accessibilityState={props.selecting ? { checked: on } : undefined}
						accessibilityLabel={spoken(t)}
					>
						{t.thumbUrl ? (
							<Image source={{ uri: t.thumbUrl }} style={styles.rowPh} />
						) : (
							<View style={styles.rowPh} />
						)}
						<View style={styles.rowBody}>
							<Text style={styles.rowTitle} numberOfLines={1}>
								{t.title}
							</Text>
							<Text style={styles.rowSub} numberOfLines={1}>
								{[KIND_TAG[t.kind], t.sub].filter(Boolean).join(" · ")}
							</Text>
							{!!t.fact && (
								<Text style={styles.rowFact} numberOfLines={1}>
									{t.fact}
								</Text>
							)}
							{!!fmlsNumberLabel(t.mlsNumber) && (
								<Text style={styles.rowSub} numberOfLines={1}>
									{fmlsNumberLabel(t.mlsNumber)}
								</Text>
							)}
						</View>
						{props.selecting ? (
							<View style={[styles.tick, on && styles.tickOn]}>
								{on && <Text style={styles.tickMark}>✓</Text>}
							</View>
						) : (
							<Text style={styles.chevron}>›</Text>
						)}
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	dim: { opacity: 0.34 },

	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: GRID_GAP,
		paddingHorizontal: PAGE_PAD,
	},
	gridTile: {
		borderRadius: radii.tile,
		overflow: "hidden",
		backgroundColor: colors.cardPlainTo,
		justifyContent: "flex-end",
	},
	gridShade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "72%",
	},
	gridText: { padding: 10, gap: 2 },
	gridKind: { ...textStyles.caption, fontSize: 9.5, color: colors.onCardDim },
	gridTitle: { ...textStyles.title2, fontSize: 17, color: colors.onCard },
	gridSub: { ...textStyles.note, color: colors.onCardDim },
	gridFact: {
		...textStyles.note,
		fontWeight: "600",
		color: colors.onCard,
		marginTop: 2,
	},
	gridRing: {
		position: "absolute",
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
		borderRadius: radii.tile,
		borderWidth: 3,
		borderColor: colors.accent,
	},

	list: {
		marginHorizontal: PAGE_PAD,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: 10,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
	},
	rowRule: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	rowPh: {
		width: 60,
		height: 60,
		borderRadius: 10,
		backgroundColor: colors.surface2,
	},
	rowBody: { flex: 1, gap: 1 },
	rowTitle: { ...textStyles.headline, color: colors.ink },
	rowSub: { ...textStyles.note, color: colors.ink2 },
	rowFact: { ...textStyles.note, fontWeight: "600", color: colors.ink },
	chevron: { ...textStyles.title2, fontWeight: "400", color: colors.ink3 },

	tick: {
		width: 24,
		height: 24,
		borderRadius: 12,
		borderWidth: 1.5,
		borderColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	tickOnPhoto: {
		position: "absolute",
		right: 8,
		top: 8,
		borderWidth: 2,
		borderColor: colors.surface,
		backgroundColor: colors.scrim,
	},
	tickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
	tickMark: { ...textStyles.caption, color: colors.surface },
});
