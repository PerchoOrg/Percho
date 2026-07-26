/**
 * CardVideo — expo-video wrapper enforcing the §0.7 video rules.
 *
 *   - mounts muted + looped, preload metadata-only (no autoplay off-screen),
 *   - only the top card plays; on becoming top it resets to currentTime=0 then
 *     plays, everything else pauses + mutes,
 *   - audio follows the global soundOn store,
 *   - play() failure → mute-and-retry,
 *   - fires `onNearEnd` once when playback reaches 82–99%; the latch resets on
 *     every card swap so the next top card can fire again.
 *
 * A no-video card is a first-class state elsewhere (task-1 renders a static
 * hero); this component assumes a real `url`.
 */
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSoundStore } from "../state/sound";

const NEAR_END_RATIO = 0.82;
const POLL_MS = 250;

interface CardVideoProps {
	url: string;
	poster?: string;
	isTop: boolean;
	onNearEnd?: () => void;
}

export function CardVideo({ url, poster, isTop, onNearEnd }: CardVideoProps) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const nearEndFired = useRef(false);

	const player = useVideoPlayer(url, (p) => {
		p.loop = true;
		p.muted = true;
	});

	// Play-gate + reset. Reset the 82% latch on every top-change (= card swap).
	// soundOn intentionally excluded — handled by the effect below so a
	// toggle doesn't restart playback from 0.
	// biome-ignore lint/correctness/useExhaustiveDependencies: soundOn intentionally excluded (see above)
	useEffect(() => {
		nearEndFired.current = false;
		if (isTop) {
			player.currentTime = 0;
			player.muted = !soundOn;
			try {
				player.play();
			} catch {
				// Autoplay rejected — fall back to muted and retry (§0.7).
				player.muted = true;
				player.play();
			}
		} else {
			player.pause();
			player.muted = true;
		}
		// soundOn intentionally excluded — handled by the effect below so a
		// toggle doesn't restart playback from 0.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isTop, player]);

	// Live audio follow without disturbing playback position.
	useEffect(() => {
		if (isTop) player.muted = !soundOn;
	}, [soundOn, isTop, player]);

	// 82% breathing-CTA trigger (poll, once-latched per §0.7 / owner-approved #7).
	useEffect(() => {
		if (!isTop || !onNearEnd) return;
		const id = setInterval(() => {
			const dur = player.duration;
			if (!dur || dur <= 0) return;
			const ratio = player.currentTime / dur;
			if (ratio >= NEAR_END_RATIO && ratio < 1 && !nearEndFired.current) {
				nearEndFired.current = true;
				onNearEnd();
			}
		}, POLL_MS);
		return () => clearInterval(id);
	}, [isTop, onNearEnd, player]);

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			{!!poster && (
				<Image source={{ uri: poster }} style={StyleSheet.absoluteFill} />
			)}
			<VideoView
				player={player}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				nativeControls={false}
			/>
		</View>
	);
}
