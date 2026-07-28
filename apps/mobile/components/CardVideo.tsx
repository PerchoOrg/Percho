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
 *
 * ── FIT: always `contain`, never `cover` ────────────────────────────────────
 *
 * Owner's rule, stated twice (2026-07-27): "横屏视频只横向占满不要纵向拉伸 不要
 * zoom in" — a landscape video fills the card's WIDTH, is not stretched
 * vertically, and is never zoomed.
 *
 * `contain` is exactly that rule, for every aspect ratio, with no measurement:
 * the video is scaled to fit INSIDE the card, so a landscape source ends up
 * full-width with bands above and below, and a portrait source fills. Nothing is
 * ever cropped or magnified.
 *
 * Two earlier attempts got this wrong and both are worth remembering:
 *   1. `contentFit="cover"` — fills by CROPPING. On a 16:9 source in a ~9:16
 *      card it discards ~2/3 of the width and magnifies what is left, which is
 *      the "占满整个card 像素很差" the owner reported: not a resolution problem,
 *      an upscaling one.
 *   2. Measuring the track and switching fit per orientation. The measurement
 *      read `videoSource.videoTracks`, which does not exist — the payload field
 *      is `availableVideoTracks` — so the size was NEVER learned and every card
 *      silently kept the `cover` fallback. A conditional whose condition never
 *      fires is worse than no conditional: it looks handled and is not.
 *
 * So there is no dimension detection here at all. `contain` needs none.
 */
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSoundStore } from "../state/sound";
import { colors } from "../theme/tokens";

const NEAR_END_RATIO = 0.82;
const TIME_UPDATE_INTERVAL_S = 0.25;

interface CardVideoProps {
	url: string;
	poster?: string;
	isTop: boolean;
	onNearEnd?: () => void;
	/**
	 * 2026-07-28 card redesign: the video lives in a 1:1 inline block and the
	 * source is rendered 1080x1080, so the media already fills its box exactly.
	 * `cover` is correct there — there is nothing to crop (aspect matches) and
	 * `contain` would hairline-letterbox on fractional layout widths.
	 *
	 * Everywhere else keeps `contain` (the owner's standing rule below).
	 */
	fit?: "contain" | "cover";
}

export function CardVideo({
	url,
	poster,
	isTop,
	onNearEnd,
	fit = "contain",
}: CardVideoProps) {
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
		<View style={styles.frame} pointerEvents="none">
			{/*
			 * Backdrop for whatever the video does not cover. A blurred, dimmed copy
			 * of the poster rather than a flat band, so the letterbox area still
			 * belongs to this card. Invisible when the video fills the frame.
			 */}
			{!!poster && (
				<Image
					source={{ uri: poster }}
					style={StyleSheet.absoluteFill}
					resizeMode="cover"
					blurRadius={16}
				/>
			)}
			<View style={styles.scrim} />
			<VideoView
				player={player}
				style={StyleSheet.absoluteFill}
				// The owner's rule, for every aspect ratio. Never `cover` —
				// EXCEPT when the caller knows the source aspect already matches
				// its box (the 1:1 inline block, see `fit` above).
				contentFit={fit}
				nativeControls={false}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	frame: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		// Behind the blurred poster, so a video with no poster still sits on the
		// dark card family (§0.3) rather than on white.
		backgroundColor: colors.cardPlainTo,
	},
	/** Dims the blurred backdrop so it reads as a frame, not a second image. */
	scrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: colors.cardPlainTo,
		opacity: 0.55,
	},
});
