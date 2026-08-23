/**
 * PhotoViewer (phase118 spec — Overlays) — the full-screen browser.
 *
 * `contain`, not `cover`: this is the one surface whose job is showing the
 * WHOLE photo, uncropped, over the near-black backdrop (`explore.overlayBg`)
 * that keeps warm paper from tinting the photograph (see `colors.photoVoid`'s
 * note). An absolutely-positioned View, not a Modal — an always-mounted
 * transparent Modal black-screened the feed on iOS (DEVLOG 2026-07-27), so the
 * screen mounts this only while open.
 */
import { useRef, useState } from "react";
import {
	FlatList,
	Image,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DetailPhotoDTO } from "../../../lib/listing/detail-dto";
import { type RoomGroups, roomLabel } from "../../../lib/listing/rooms";
import { explore, fonts } from "../../../theme/tokens";

export interface PhotoViewerProps {
	photos: readonly DetailPhotoDTO[];
	rooms: RoomGroups;
	initialIndex: number;
	onClose: () => void;
}

export function PhotoViewer(props: PhotoViewerProps) {
	const { photos, rooms, initialIndex, onClose } = props;
	const { width, height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const [index, setIndex] = useState(initialIndex);
	const listRef = useRef<FlatList<DetailPhotoDTO>>(null);

	const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const next = Math.round(e.nativeEvent.contentOffset.x / width);
		if (next !== index && next >= 0 && next < photos.length) setIndex(next);
	};

	const current = photos[index];
	const room = rooms.keyByIndex[index];
	const caption =
		current?.tags?.caption?.trim() ||
		(room && room !== "other" ? roomLabel(room) : null);

	return (
		<View style={styles.overlay}>
			<View style={[styles.bar, { paddingTop: insets.top }]}>
				<Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
					<Text style={styles.close}>✕</Text>
				</Pressable>
				<Text style={styles.counter}>
					{index + 1} / {photos.length}
				</Text>
				<View style={styles.closeBtn} />
			</View>
			<FlatList
				ref={listRef}
				data={photos as DetailPhotoDTO[]}
				keyExtractor={(p) => p.id}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				initialScrollIndex={initialIndex}
				getItemLayout={(_, i) => ({
					length: width,
					offset: width * i,
					index: i,
				})}
				onScroll={handleScroll}
				scrollEventThrottle={32}
				renderItem={({ item }) => (
					<View style={[styles.slide, { width }]}>
						<Image
							source={{ uri: item.url }}
							style={{ width, height: height * 0.72 }}
							resizeMode="contain"
						/>
					</View>
				)}
			/>
			<View style={[styles.captionWrap, { paddingBottom: insets.bottom + 14 }]}>
				{!!caption && <Text style={styles.caption}>{caption}</Text>}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFillObject,
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
	counter: {
		color: explore.onMedia,
		fontSize: 13,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
		fontFamily: fonts.ui,
	},
	slide: { flex: 1, justifyContent: "center" },
	captionWrap: { paddingHorizontal: 18, paddingTop: 14, minHeight: 30 },
	caption: {
		color: explore.onMediaDim,
		fontSize: 12,
		lineHeight: 17,
		fontFamily: fonts.ui,
	},
});
