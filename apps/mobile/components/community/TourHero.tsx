/**
 * TourHero — the community explore page's hero, built like the listing page's
 * `MediaCarousel` (owner, 2026-09-04: the community page's first section
 * should follow the listing pattern, so users can select parts to view).
 *
 * The listing hero pages through a video and photos, with a room strip at its
 * foot that jumps between them. A community has ONE film — the assembled tour
 * the feed card plays — so the strip's parts are the film's own: one chip per
 * PLACE the tour visits, in film order, the same rows as the card's dashed
 * bar. The lit chip follows playback; tapping one seeks the film to where that
 * place's clips start. The strip hides itself when the film's structure is
 * unknown (a legacy AI video, or no tour at all) — no empty chrome.
 *
 * Chrome is the listing hero's: ← / ↑ / ♡ glass discs, the global sound
 * toggle, a top cap and a foot wash. The page's cream/amber body palette
 * stays out of here — this is media, and `explore.*` is what the listing hero
 * already draws over media.
 */
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSoundStore } from "../../state/sound";
import { explore, fonts, radii } from "../../theme/tokens";
import { SoundToggle } from "../SoundToggle";

/** One place the tour's film visits — same rows as the card's dashed bar. */
export interface TourSegment {
	name: string;
	/** 0..1 — where in the film this place's clips END. */
	endFraction: number;
}

export interface TourHeroProps {
	width: number;
	height: number;
	/** The community's film; the cover photo stands in when there is none. */
	videoUrl?: string;
	heroUrl: string;
	segments: readonly TourSegment[];
	saved: boolean;
	onBack: () => void;
	onToggleSave: () => void;
	onShare: () => void;
}

/** Playback ticks every 0.25s — the same cadence the feed card's bar uses. */
const TIME_UPDATE_INTERVAL_S = 0.25;

/**
 * After a chip tap, how long the tapped chip stays lit regardless of what
 * `timeUpdate` reports. A seek is a request, not a jump: for a tick or two
 * the player still reports the pre-seek position, which would flick the lit
 * chip back to where the buyer just left (CardVideo has the long version).
 */
const SEEK_HOLD_MS = 1500;

/** Which place a 0..1 position falls in. */
function segmentAt(ratio: number, segments: readonly TourSegment[]): number {
	for (let i = 0; i < segments.length; i++) {
		if (ratio <= (segments[i]?.endFraction ?? 1)) return i;
	}
	return segments.length - 1;
}

function TourVideo({
	url,
	width,
	height,
	segments,
	onActiveChange,
	seekRef,
}: {
	url: string;
	width: number;
	height: number;
	segments: readonly TourSegment[];
	/** Called on every tick; the parent's setState ignores repeats. */
	onActiveChange: (index: number) => void;
	seekRef: MutableRefObject<((index: number) => void) | null>;
}) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const player = useVideoPlayer(url, (p) => {
		p.loop = true;
		p.muted = !soundOn;
		p.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_S;
		p.play();
	});
	const hold = useRef<{ index: number; until: number } | null>(null);

	useEffect(() => {
		player.muted = !soundOn;
	}, [player, soundOn]);

	// The strip's seek. `seekBy`, not `player.currentTime = …`: on an HLS
	// source the setter seeks with zero tolerance and a slow seek is abandoned
	// silently (DEVLOG 2026-08-23). Nearest keyframe is fine for a chip.
	useEffect(() => {
		seekRef.current = (index) => {
			const dur = player.duration;
			if (!dur || dur <= 0) return;
			const start = index === 0 ? 0 : (segments[index - 1]?.endFraction ?? 0);
			player.seekBy(Math.min(start, 0.999) * dur - player.currentTime);
			hold.current = { index, until: Date.now() + SEEK_HOLD_MS };
			onActiveChange(index);
		};
		return () => {
			seekRef.current = null;
		};
	}, [player, segments, seekRef, onActiveChange]);

	useEffect(() => {
		if (segments.length === 0) return;
		const sub = player.addListener("timeUpdate", ({ currentTime }) => {
			const dur = player.duration;
			if (!dur || dur <= 0) return;
			const next = segmentAt(currentTime / dur, segments);
			const h = hold.current;
			if (h) {
				if (Date.now() < h.until && next !== h.index) return;
				hold.current = null;
			}
			onActiveChange(next);
		});
		return () => sub.remove();
	}, [player, segments, onActiveChange]);

	return (
		<VideoView
			player={player}
			style={{ width, height }}
			contentFit="cover"
			nativeControls={false}
		/>
	);
}

export function TourHero(props: TourHeroProps) {
	const {
		width,
		height,
		videoUrl,
		heroUrl,
		segments,
		saved,
		onBack,
		onToggleSave,
		onShare,
	} = props;
	const insets = useSafeAreaInsets();
	const [activeIndex, setActiveIndex] = useState(0);
	const seekRef = useRef<((index: number) => void) | null>(null);

	const strip =
		videoUrl && segments.length > 0 ? (
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.jumpWrap}
				contentContainerStyle={styles.jumpRow}
			>
				{segments.map((seg, i) => {
					const active = i === activeIndex;
					return (
						<Pressable
							// A film may revisit a place, so the name alone can repeat.
							key={`${i}-${seg.name}`}
							accessibilityRole="button"
							accessibilityLabel={`Play the tour from ${seg.name}`}
							onPress={() => seekRef.current?.(i)}
							style={[styles.chip, active && styles.chipActive]}
						>
							<Text
								style={[styles.chipLabel, active && styles.chipLabelActive]}
							>
								<Text style={active ? styles.chipRankActive : styles.chipRank}>
									{`${i + 1}  `}
								</Text>
								{seg.name}
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>
		) : null;

	return (
		<View style={{ width, height, backgroundColor: explore.overlayBg }}>
			{videoUrl ? (
				<TourVideo
					url={videoUrl}
					width={width}
					height={height}
					segments={segments}
					onActiveChange={setActiveIndex}
					seekRef={seekRef}
				/>
			) : (
				<Image
					source={{ uri: heroUrl }}
					style={{ width, height }}
					resizeMode="cover"
				/>
			)}

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
				<Pressable
					onPress={onBack}
					hitSlop={10}
					style={styles.gbtn}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Text style={styles.gbtnGlyph}>←</Text>
				</Pressable>
				<View style={styles.navRight}>
					<Pressable
						onPress={onShare}
						hitSlop={10}
						style={styles.gbtn}
						accessibilityRole="button"
						accessibilityLabel="Share"
					>
						<Text style={styles.gbtnGlyph}>↑</Text>
					</Pressable>
					<Pressable
						onPress={onToggleSave}
						hitSlop={10}
						style={styles.gbtn}
						accessibilityRole="button"
						accessibilityLabel={saved ? "Saved" : "Save"}
					>
						<Text style={styles.gbtnGlyph}>{saved ? "♥" : "♡"}</Text>
					</Pressable>
				</View>
			</View>

			{/* The global mute toggle — the film's audio follows it, so the buyer
			    needs a way to flip it here, same as the listing hero. */}
			{!!videoUrl && (
				<View style={[styles.tl, { top: insets.top + 54 }]}>
					<SoundToggle />
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
	navRight: { flexDirection: "row", gap: 8 },
	gbtn: {
		width: 36,
		height: 36,
		borderRadius: radii.pill,
		backgroundColor: explore.glass,
		alignItems: "center",
		justifyContent: "center",
	},
	gbtnGlyph: { fontSize: 16, fontWeight: "600", color: explore.ink },
	tl: { position: "absolute", left: 12 },
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
	chipRank: { color: explore.onMediaDim, fontWeight: "400" },
	chipRankActive: { color: explore.muted, fontWeight: "400" },
});
