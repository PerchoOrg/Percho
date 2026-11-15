/**
 * CityFilm — the city page's hero: the city's film, whole.
 *
 * Not `TourHero`. A community film is footage with nothing drawn on it, so its
 * hero cover-crops it to a short block and lays a chip strip, a sound toggle
 * and two washes over what is left. A city film carries its own captions — a
 * figure or a place name over the shot it belongs to (`callouts.py`) — and a
 * crop or a control in the wrong place would cover them. So this hero is the
 * film's own shape, uncropped, and its chrome keeps to the strip the film's
 * captions leave free: the top 8% of the frame, the same strip the feed card's
 * pill and corner control use.
 *
 * The page puts it BELOW the status bar for the same reason: under the notch,
 * that strip would be the notch.
 */
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSoundStore } from "../../state/sound";
import { explore, radii } from "../../theme/tokens";
import { CardCorner } from "../cards/CardCorner";

/** The film canvas, `TOUR_CANVAS_W / TOUR_CANVAS_H` in the render worker. */
export const CITY_FILM_ASPECT = 1080 / 1576;

interface CityFilmProps {
	width: number;
	videoUrl?: string;
	/** The film's first frame; stands in while it loads, or when there is none. */
	posterUrl?: string;
	saved: boolean;
	onBack: () => void;
	onToggleSave: () => void;
}

function Film({
	url,
	width,
	height,
}: { url: string; width: number; height: number }) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const player = useVideoPlayer(url, (p) => {
		p.loop = true;
		p.muted = !soundOn;
		p.play();
	});

	useEffect(() => {
		player.muted = !soundOn;
	}, [player, soundOn]);

	return (
		<VideoView
			player={player}
			style={{ width, height }}
			contentFit="cover"
			nativeControls={false}
		/>
	);
}

export function CityFilm({
	width,
	videoUrl,
	posterUrl,
	saved,
	onBack,
	onToggleSave,
}: CityFilmProps) {
	const height = Math.round(width / CITY_FILM_ASPECT);
	const soundOn = useSoundStore((s) => s.soundOn);
	const toggleSound = useSoundStore((s) => s.toggle);

	return (
		<View style={{ width, height, backgroundColor: explore.overlayBg }}>
			{!!posterUrl && (
				<Image
					source={{ uri: posterUrl }}
					style={[StyleSheet.absoluteFill, { width, height }]}
					resizeMode="cover"
				/>
			)}
			{!!videoUrl && <Film url={videoUrl} width={width} height={height} />}

			<Pressable
				onPress={onBack}
				hitSlop={10}
				style={styles.back}
				accessibilityRole="button"
				accessibilityLabel="Back"
			>
				<Text style={styles.backGlyph}>←</Text>
			</Pressable>

			<CardCorner
				{...(videoUrl ? { sound: { on: soundOn, onPress: toggleSound } } : {})}
				save={{ saved, onPress: onToggleSave }}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	/** The corner control's twin: same 12pt inset, same 26pt height. */
	back: {
		position: "absolute",
		top: 12,
		left: 12,
		width: 26,
		height: 26,
		borderRadius: radii.pill,
		backgroundColor: "rgba(255,255,255,0.92)",
		alignItems: "center",
		justifyContent: "center",
	},
	backGlyph: { fontSize: 14, fontWeight: "600", color: explore.ink },
});
