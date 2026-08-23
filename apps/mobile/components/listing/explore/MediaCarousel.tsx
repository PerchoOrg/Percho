/**
 * MediaCarousel — the explore page's hero (phase119 spec §3.1).
 *
 * Slide 0 is the walkthrough video (when one exists), then EVERY photo in MLS
 * order, horizontally paged. Native `pagingEnabled`, never a JS drag — see
 * `PhotoGallery.tsx` for the history of that rule.
 *
 * The room strip at the foot is ONE control with two readings: on the video
 * slide it is the film's entry point, on photo slides it is a room jump. Chips
 * come from `buildRoomGroups` (the VLM tags) and the strip hides itself when
 * no photo carries a room — no empty chrome.
 *
 * `object-fit: cover` here (portrait video and landscape photos mixed — crop
 * is the only sane shared fit); the full-screen viewer uses `contain`, which
 * is where "see the whole photo" lives.
 */
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
	FlatList,
	Image,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
	DetailPhotoDTO,
	ListingVideoDTO,
} from "../../../lib/listing/detail-dto";
import type { RoomGroups } from "../../../lib/listing/rooms";
import { useSoundStore } from "../../../state/sound";
import { explore, radii } from "../../../theme/tokens";
import { fonts } from "../../../theme/tokens";
import { SoundToggle } from "../../SoundToggle";

type Slide =
	| { kind: "video"; video: ListingVideoDTO }
	| { kind: "photo"; photo: DetailPhotoDTO; photoIndex: number };

export interface MediaCarouselProps {
	width: number;
	height: number;
	video?: ListingVideoDTO;
	photos: readonly DetailPhotoDTO[];
	rooms: RoomGroups;
	saved: boolean;
	onBack: () => void;
	onToggleSave: () => void;
	onOpenGrid: () => void;
	/** Tap on a photo slide → full-screen viewer at that photo. */
	onOpenViewer: (photoIndex: number) => void;
	/** Slide changed. `room` is the slide arrived at; dwell is the slide left. */
	onSlideChange: (index: number, room: string, dwellMs: number) => void;
	onRoomJump: (room: string) => void;
}

function fmtDuration(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = Math.round(sec % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The hero's video player. Mounted for the card's whole life (remounting a
 * player on every swipe-back would re-buffer the manifest); `active` gates
 * play. Created muted — §0.7's autoplay rule — then follows the global flag.
 */
function HeroVideo({
	video,
	active,
	width,
	height,
}: {
	video: ListingVideoDTO;
	active: boolean;
	width: number;
	height: number;
}) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const player = useVideoPlayer(video.url, (p) => {
		p.loop = true;
		p.muted = true;
	});

	useEffect(() => {
		player.muted = !soundOn || !active;
	}, [player, soundOn, active]);

	useEffect(() => {
		if (active) {
			player.play();
		} else {
			player.pause();
		}
	}, [player, active]);

	return (
		<View style={{ width, height }}>
			<VideoView
				player={player}
				style={{ width, height }}
				contentFit="cover"
				nativeControls={false}
			/>
		</View>
	);
}

export function MediaCarousel(props: MediaCarouselProps) {
	const {
		width,
		height,
		video,
		photos,
		rooms,
		saved,
		onBack,
		onToggleSave,
		onOpenGrid,
		onOpenViewer,
		onSlideChange,
		onRoomJump,
	} = props;
	const insets = useSafeAreaInsets();

	const slides: Slide[] = [
		...(video ? [{ kind: "video", video } as const] : []),
		...photos.map(
			(photo, photoIndex) => ({ kind: "photo", photo, photoIndex }) as const,
		),
	];
	const photoBase = video ? 1 : 0;

	const [index, setIndex] = useState(0);
	const listRef = useRef<FlatList<Slide>>(null);
	const dwellFrom = useRef(Date.now());

	const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const next = Math.round(e.nativeEvent.contentOffset.x / width);
		if (next === index || next < 0 || next >= slides.length) return;
		const now = Date.now();
		setIndex(next);
		const slide = slides[next];
		const room =
			slide?.kind === "photo"
				? (rooms.keyByIndex[slide.photoIndex] ?? "other")
				: "video";
		onSlideChange(next, room, now - dwellFrom.current);
		dwellFrom.current = now;
	};

	const jumpTo = (slideIndex: number) => {
		listRef.current?.scrollToIndex({ index: slideIndex, animated: true });
	};

	/** Which chip is lit: the video chip on slide 0, else the current room. */
	const activeChip =
		video && index === 0
			? "video"
			: (rooms.keyByIndex[index - photoBase] ?? null);

	const strip =
		rooms.groups.length > 0 || video ? (
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.jumpWrap}
				contentContainerStyle={styles.jumpRow}
			>
				{video && (
					<Pressable
						onPress={() => jumpTo(0)}
						style={[styles.chip, activeChip === "video" && styles.chipActive]}
					>
						<Text
							style={[
								styles.chipLabel,
								activeChip === "video" && styles.chipLabelActive,
							]}
						>
							Video
						</Text>
					</Pressable>
				)}
				{rooms.groups.map((g) => {
					const active = activeChip === g.key;
					return (
						<Pressable
							key={g.key}
							onPress={() => {
								onRoomJump(g.key);
								jumpTo(photoBase + g.firstPhotoIndex);
							}}
							style={[styles.chip, active && styles.chipActive]}
						>
							<Text
								style={[styles.chipLabel, active && styles.chipLabelActive]}
							>
								{g.label}
								<Text
									style={active ? styles.chipCountActive : styles.chipCount}
								>
									{`  ${g.count}`}
								</Text>
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>
		) : null;

	return (
		<View style={{ width, height, backgroundColor: explore.overlayBg }}>
			<FlatList
				ref={listRef}
				data={slides}
				keyExtractor={(s) => (s.kind === "video" ? "video" : s.photo.id)}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={handleScroll}
				scrollEventThrottle={32}
				getItemLayout={(_, i) => ({
					length: width,
					offset: width * i,
					index: i,
				})}
				renderItem={({ item }) =>
					item.kind === "video" ? (
						<HeroVideo
							video={item.video}
							active={index === 0}
							width={width}
							height={height}
						/>
					) : (
						<Pressable onPress={() => onOpenViewer(item.photoIndex)}>
							<Image
								source={{ uri: item.photo.url }}
								style={{ width, height }}
								resizeMode="cover"
							/>
						</Pressable>
					)
				}
			/>

			{/* Washes: a light cap for the top controls, a foot wash for the strip. */}
			<LinearGradient
				colors={[explore.heroScrimFrom, "rgba(8,16,13,0)"]}
				style={styles.topWash}
				pointerEvents="none"
			/>
			<LinearGradient
				colors={["rgba(8,16,13,0)", explore.heroScrimTo]}
				style={styles.footWash}
				pointerEvents="none"
			/>

			<View style={[styles.nav, { top: insets.top + 8 }]}>
				<Pressable onPress={onBack} hitSlop={10} style={styles.gbtn}>
					<Text style={styles.gbtnGlyph}>←</Text>
				</Pressable>
				<Pressable onPress={onToggleSave} hitSlop={10} style={styles.gbtn}>
					<Text style={styles.gbtnGlyph}>{saved ? "♥" : "♡"}</Text>
				</Pressable>
			</View>

			<View style={[styles.tr, { top: insets.top + 54 }]}>
				<View style={styles.glassChip}>
					<Text style={styles.counter}>
						{index + 1} / {slides.length}
					</Text>
				</View>
				<Pressable onPress={onOpenGrid} hitSlop={8} style={styles.glassBtn}>
					<Text style={styles.glassGlyph}>⊞</Text>
				</Pressable>
			</View>

			{/*
			 * The GLOBAL mute toggle (see `state/sound.ts`). This hero is its only
			 * mount outside the dev screen — removing it recreates the 2026-08-15
			 * "buyer cannot unmute anywhere" failure. Slide 0 only, per the
			 * reference (滑走即淡出).
			 */}
			{index === 0 && (
				<View style={[styles.tl, { top: insets.top + 54 }]}>
					<SoundToggle />
				</View>
			)}

			{video && index === 0 && (
				<View style={[styles.videoMark, strip ? null : styles.videoMarkLow]}>
					<View style={styles.playDot}>
						<Text style={styles.playGlyph}>▶</Text>
					</View>
					<Text style={styles.videoMarkLabel}>
						{video.durationSec
							? `VIDEO TOUR · ${fmtDuration(video.durationSec)}`
							: "VIDEO TOUR"}
					</Text>
				</View>
			)}

			{strip}
		</View>
	);
}

const styles = StyleSheet.create({
	topWash: { position: "absolute", top: 0, left: 0, right: 0, height: 90 },
	footWash: { position: "absolute", bottom: 0, left: 0, right: 0, height: 150 },
	nav: {
		position: "absolute",
		left: 12,
		right: 12,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	gbtn: {
		width: 36,
		height: 36,
		borderRadius: radii.pill,
		backgroundColor: explore.glass,
		alignItems: "center",
		justifyContent: "center",
	},
	gbtnGlyph: { fontSize: 16, fontWeight: "600", color: explore.ink },
	tr: {
		position: "absolute",
		right: 12,
		flexDirection: "row",
		gap: 6,
		alignItems: "center",
	},
	tl: { position: "absolute", left: 12 },
	glassChip: {
		height: 28,
		paddingHorizontal: 11,
		borderRadius: radii.pill,
		backgroundColor: explore.scrim,
		justifyContent: "center",
	},
	glassBtn: {
		width: 28,
		height: 28,
		borderRadius: radii.pill,
		backgroundColor: explore.scrim,
		alignItems: "center",
		justifyContent: "center",
	},
	glassGlyph: { color: explore.onMedia, fontSize: 13 },
	counter: {
		color: explore.onMedia,
		fontSize: 11,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
		fontFamily: fonts.ui,
	},
	videoMark: {
		position: "absolute",
		left: 18,
		bottom: 58,
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
	},
	videoMarkLow: { bottom: 16 },
	playDot: {
		width: 19,
		height: 19,
		borderRadius: radii.pill,
		backgroundColor: "rgba(255,255,255,0.24)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.4)",
		alignItems: "center",
		justifyContent: "center",
	},
	playGlyph: { color: explore.onMedia, fontSize: 8 },
	videoMarkLabel: {
		color: explore.onMedia,
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 1.2,
		fontFamily: fonts.ui,
	},
	jumpWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
	jumpRow: { paddingHorizontal: 12, paddingBottom: 14, gap: 6 },
	chip: {
		height: 30,
		paddingHorizontal: 11,
		borderRadius: radii.pill,
		backgroundColor: explore.jumpChip,
		borderWidth: 1,
		borderColor: explore.jumpChipBorder,
		justifyContent: "center",
	},
	chipActive: {
		backgroundColor: explore.onMedia,
		borderColor: explore.onMedia,
	},
	chipLabel: {
		color: explore.onMedia,
		fontSize: 11,
		fontWeight: "600",
		fontFamily: fonts.ui,
	},
	chipLabelActive: { color: explore.ink },
	chipCount: { color: explore.onMediaDim, fontWeight: "400" },
	chipCountActive: { color: explore.muted, fontWeight: "400" },
});
