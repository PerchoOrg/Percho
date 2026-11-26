import { type TourSegment, buildTourGroups } from "@percho/shared/tour-buckets";
/**
 * TourHero — the community explore page's hero, built like the listing page's
 * `MediaCarousel` (owner, 2026-09-04: the community page's first section
 * should follow the listing pattern, so users can select parts to view).
 *
 * The listing hero pages through a video and photos, with a room strip at its
 * foot that jumps between them. A community has ONE film — the assembled tour
 * the feed card plays — so the strip's parts are the film's own: one chip per
 * CATEGORY the tour visits ("Schools 2", "Shopping 3"), in film order, with
 * the count of places in it. The lit chip follows playback; tapping one seeks
 * the film to where that category's first place starts. Grouping and labels
 * are `lib/community/tour-buckets.ts` — the listing's `rooms.ts` for a film.
 *
 * Categories, not place names, and no rank numbers on the chips: owner
 * 2026-09-05, "no need to show numbers" and "dont say the poi name, just group
 * them by tag or category, it is too long to show all of them". The count IS a
 * number and it stays — it measures the neighbourhood, where an ordinal only
 * counted the chips.
 *
 * The strip hides itself when the film's structure is unknown (a legacy AI
 * video, or no tour at all) — no empty chrome.
 *
 * Chrome: a back disc on the left and, on the right, the feed card's own row —
 * sound, save, share as dark-glass discs with the same glyphs, in the same
 * order (phase401, owner: 「explore 界面里的分享和声音按键要和feed里保持一致」).
 * Before, this was the listing hero's white discs with a "↑" for share and an
 * emoji speaker under the back button. A top cap and a foot wash. The page's paper body palette
 * stays out of here — this is media, and `explore.*` is what the listing hero
 * already draws over media.
 */
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
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
import { letGo, takeOver } from "../../lib/media/one-player";
import { useSoundStore } from "../../state/sound";
import { GUTTER } from "../../theme/feed-page";
import { explore, fonts, radii, redline } from "../../theme/tokens";
import {
	CORNER_DISC_STYLE,
	CORNER_INSET,
	CardCorner,
} from "../cards/CardCorner";

export interface TourHeroProps {
	width: number;
	height: number;
	/** The community's film; the cover photo stands in when there is none. */
	videoUrl?: string;
	/** Absent for a community with no cover photo — `initial` stands in. */
	heroUrl?: string;
	/** First letter of the community's name, the hero of last resort — the
	 *  same fallback the map pins use for a community without a picture
	 *  (owner, 2026-09-09: "just show first character"). */
	initial: string;
	segments: readonly TourSegment[];
	saved: boolean;
	onBack: () => void;
	onToggleSave: () => void;
	/** Absent for a page with no public link to share. Every page has one since phase335. */
	onShare?: () => void;
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
	suspended,
}: {
	url: string;
	width: number;
	height: number;
	segments: readonly TourSegment[];
	/** Called on every tick; the parent's setState ignores repeats. */
	onActiveChange: (index: number) => void;
	seekRef: MutableRefObject<((index: number) => void) | null>;
	/** Another page is over this one: the film and its sound wait. */
	suspended: boolean;
}) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const player = useVideoPlayer(url, (p) => {
		p.loop = true;
		p.muted = !soundOn;
		p.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_S;
		takeOver(p, "explore film");
		p.play();
	});
	const hold = useRef<{ index: number; until: number } | null>(null);

	useEffect(() => {
		player.muted = !soundOn;
	}, [player, soundOn]);

	// A place's deck opens OVER this page (phase404.5) and its first card
	// plays at once; the film under it kept playing too (owner, 2026-11-26:
	// 「点进去后音乐overlap了 旧的音乐要停止」). No rewind: back resumes it.
	useEffect(() => {
		if (suspended) {
			player.pause();
		} else {
			takeOver(player, "explore film");
			player.play();
		}
	}, [suspended, player]);

	// Let `one-player` forget it when `useVideoPlayer` releases it.
	useEffect(() => () => letGo(player), [player]);

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
		initial,
		segments,
		saved,
		onBack,
		onToggleSave,
		onShare,
	} = props;
	const insets = useSafeAreaInsets();
	const soundOn = useSoundStore((s) => s.soundOn);
	const toggleSound = useSoundStore((s) => s.toggle);
	const [activeIndex, setActiveIndex] = useState(0);
	const seekRef = useRef<((index: number) => void) | null>(null);
	const pageFocused = useIsFocused();

	const { groups, keyByIndex } = buildTourGroups(segments);
	/** The lit chip: the group the place now on screen belongs to. */
	const activeKey = keyByIndex[activeIndex] ?? null;

	const strip =
		videoUrl && groups.length > 0 ? (
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.jumpWrap}
				contentContainerStyle={styles.jumpRow}
			>
				{groups.map((g) => {
					const active = g.key === activeKey;
					return (
						<Pressable
							key={g.key}
							accessibilityRole="button"
							accessibilityLabel={`Play the tour from ${g.label}`}
							onPress={() => seekRef.current?.(g.firstSegmentIndex)}
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
			{videoUrl ? (
				<TourVideo
					url={videoUrl}
					width={width}
					height={height}
					segments={segments}
					onActiveChange={setActiveIndex}
					seekRef={seekRef}
					suspended={!pageFocused}
				/>
			) : heroUrl ? (
				<Image
					source={{ uri: heroUrl }}
					style={{ width, height }}
					resizeMode="cover"
				/>
			) : (
				<View style={[styles.initialWrap, { width, height }]}>
					<Text style={styles.initialGlyph}>{initial}</Text>
				</View>
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

			<View style={[styles.nav, { top: insets.top + CORNER_INSET }]}>
				<Pressable
					onPress={onBack}
					hitSlop={10}
					style={({ pressed }) => [
						CORNER_DISC_STYLE,
						pressed && styles.pressed,
					]}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Text style={styles.backGlyph}>←</Text>
				</Pressable>
				{/* The feed card's row. Sound is the global setting, so muting
				    here mutes the feed too, as before; only a film has one. */}
				<CardCorner
					inline
					{...(videoUrl
						? { sound: { on: soundOn, onPress: toggleSound } }
						: {})}
					save={{ saved, onPress: onToggleSave }}
					{...(onShare ? { share: { onPress: onShare } } : {})}
				/>
			</View>

			{strip}
		</View>
	);
}

const styles = StyleSheet.create({
	topWash: { position: "absolute", top: 0, left: 0, right: 0, height: 90 },
	footWash: { position: "absolute", bottom: 0, left: 0, right: 0, height: 150 },
	/**
	 * Where the row sits on the feed card, on screen: the card is `GUTTER` in
	 * from the screen's edge and the row `CORNER_INSET` in from the card's, so
	 * tapping Explore leaves sound, save and share where they were across the
	 * screen. Vertically the film runs up under the status bar, so the inset
	 * is taken from where the picture becomes visible (owner: 「位置也要一致」).
	 */
	nav: {
		position: "absolute",
		left: GUTTER + CORNER_INSET,
		right: GUTTER + CORNER_INSET,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	backGlyph: { fontSize: 17, fontWeight: "600", color: redline.onPhoto },
	pressed: { opacity: 0.7 },
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
		fontSize: 12,
		fontWeight: "600",
		fontFamily: fonts.ui,
	},
	chipLabelActive: { color: explore.ink },
	chipCount: { color: explore.onMediaDim, fontWeight: "400" },
	chipCountActive: { color: explore.muted, fontWeight: "400" },
	// The no-media hero: the initial, large and quiet, on the overlay ground.
	// Legible as a deliberate mark rather than a failed image load.
	initialWrap: { alignItems: "center", justifyContent: "center" },
	initialGlyph: {
		fontSize: 96,
		fontWeight: "700",
		fontFamily: fonts.ui,
		color: explore.onMediaDim,
	},
});
