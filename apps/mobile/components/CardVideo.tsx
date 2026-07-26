/**
 * CardVideo — expo-video wrapper enforcing the §0.7 video rules.
 *
 *   - mounts muted + looped with a poster behind it,
 *   - only the top card plays; on becoming top it resets to currentTime=0 then
 *     plays, everything else pauses + mutes,
 *   - audio follows the global soundOn store,
 *   - playback error → mute-and-retry once (§0.7's "play() reject" rule; on
 *     native, `play()` returns void and failures surface via `statusChange`),
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
const TIME_UPDATE_INTERVAL_S = 0.25;

interface CardVideoProps {
	url: string;
	poster?: string;
	isTop: boolean;
	onNearEnd?: () => void;
}

export function CardVideo({ url, poster, isTop, onNearEnd }: CardVideoProps) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const nearEndFired = useRef(false);
	const mutedRetried = useRef(false);
	const onNearEndRef = useRef(onNearEnd);
	onNearEndRef.current = onNearEnd;

	const player = useVideoPlayer(url, (p) => {
		p.loop = true;
		p.muted = true;
		p.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_S;
	});

	// Play-gate + reset. Reset the 82% latch on every top-change (= card swap).
	// biome-ignore lint/correctness/useExhaustiveDependencies: soundOn read once here on purpose — the effect below tracks it without restarting playback
	useEffect(() => {
		nearEndFired.current = false;
		mutedRetried.current = false;
		if (isTop) {
			player.currentTime = 0;
			player.muted = !soundOn;
			player.play();
		} else {
			player.pause();
			player.muted = true;
		}
	}, [isTop, player]);

	// Live audio follow without disturbing playback position.
	useEffect(() => {
		if (isTop) player.muted = !soundOn;
	}, [soundOn, isTop, player]);

	// §0.7 mute-and-retry: an unmuted play can be refused (audio session, silent
	// switch). Fall back to muted once, then give up so we don't spin.
	useEffect(() => {
		const sub = player.addListener("statusChange", ({ status, error }) => {
			if (status !== "error" || !error) return;
			if (!isTop || mutedRetried.current) return;
			mutedRetried.current = true;
			player.muted = true;
			player.play();
		});
		return () => sub.remove();
	}, [player, isTop]);

	// 82% breathing-CTA trigger, once-latched per card (§0.7 / owner-approved #7).
	useEffect(() => {
		const sub = player.addListener("timeUpdate", ({ currentTime }) => {
			if (!isTop || nearEndFired.current) return;
			const dur = player.duration;
			if (!dur || dur <= 0) return;
			const ratio = currentTime / dur;
			if (ratio >= NEAR_END_RATIO && ratio < 1) {
				nearEndFired.current = true;
				onNearEndRef.current?.();
			}
		});
		return () => sub.remove();
	}, [player, isTop]);

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
