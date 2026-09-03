/**
 * PhotoGrid (phase119 spec — Overlays) — the room-grouped nine-up view behind
 * the hero's ⊞ button. Sections follow the same `buildRoomGroups` taxonomy as
 * the strip and the viewer; an untagged import degrades to one "ALL PHOTOS"
 * section rather than fabricating rooms. Tapping a tile hands the photo index
 * back to the screen, which swaps this overlay for the viewer at that photo.
 */
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DetailPhotoDTO } from "../../../lib/listing/detail-dto";
import type { RoomGroups } from "../../../lib/listing/rooms";
import { explore, fonts } from "../../../theme/tokens";

export interface PhotoGridProps {
	photos: readonly DetailPhotoDTO[];
	rooms: RoomGroups;
	onPick: (photoIndex: number) => void;
	onClose: () => void;
}

const GUTTER = 4;
const SIDE = 12;

export function PhotoGrid(props: PhotoGridProps) {
	const { photos, rooms, onPick, onClose } = props;
	const { width } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const tile = (width - SIDE * 2 - GUTTER * 2) / 3;

	const sections =
		rooms.groups.length > 0
			? rooms.groups.map((g) => ({
					key: g.key,
					head: `${g.label.toUpperCase()} · ${g.count}`,
					indices: photos
						.map((_, i) => i)
						.filter((i) => rooms.keyByIndex[i] === g.key),
				}))
			: [
					{
						key: "all",
						head: `ALL PHOTOS · ${photos.length}`,
						indices: photos.map((_, i) => i),
					},
				];

	return (
		<View style={styles.overlay}>
			<View style={[styles.bar, { paddingTop: insets.top }]}>
				<Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
					<Text style={styles.close}>✕</Text>
				</Pressable>
				<Text style={styles.title}>All photos</Text>
				<View style={styles.closeBtn} />
			</View>
			<ScrollView
				contentContainerStyle={{
					paddingHorizontal: SIDE,
					paddingBottom: insets.bottom + 20,
				}}
			>
				{sections.map((section) => (
					<View key={section.key}>
						<Text style={styles.head}>{section.head}</Text>
						<View style={styles.grid}>
							{section.indices.map((i) => {
								const photo = photos[i];
								if (!photo) return null;
								return (
									<Pressable
										key={photo.id}
										onPress={() => onPick(i)}
										style={{ width: tile, height: tile }}
									>
										<Image
											source={{ uri: photo.url }}
											style={styles.tileImg}
											resizeMode="cover"
										/>
									</Pressable>
								);
							})}
						</View>
					</View>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFill,
		zIndex: 20,
		backgroundColor: explore.overlayBg,
	},
	bar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingBottom: 10,
	},
	closeBtn: { width: 24, alignItems: "center" },
	close: { color: explore.onMedia, fontSize: 19 },
	title: {
		color: explore.onMedia,
		fontSize: 13,
		fontWeight: "600",
		fontFamily: fonts.ui,
	},
	head: {
		color: explore.onMediaDim,
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 1.4,
		paddingTop: 16,
		paddingBottom: 6,
		fontFamily: fonts.ui,
	},
	grid: { flexDirection: "row", flexWrap: "wrap", gap: GUTTER },
	tileImg: { width: "100%", height: "100%", borderRadius: 8 },
});
