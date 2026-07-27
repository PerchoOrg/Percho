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
 * ORIENTATION (owner, on device 2026-07-27): "listing card 要能同时支持竖屏和
 * 横屏视频或者照片 对于横屏视频宽度要占满 listing card 上下可以不用占满". This
 * shipped with a flat `contentFit="cover"`, which FILLS by cropping — on a 16:9
 * source in a ~9:16 card that discards about two thirds of the width, and for a
 * home video the subject is usually in the discarded part. Every video in
 * production today is landscape, because the photos they are built from are.
 *
 * So the fit is now decided by `lib/media/fit.ts` from the player's REAL
 * dimensions: portrait fills, landscape gets full width with dark letterbox
 * bands. Real dimensions rather than the DB's `aspect_ratio`, because that column
 * claimed '9:16' for videos Cloudflare reports as 1080x1920 AND for ones that are
 * actually wide — the file is the only trustworthy source.
 */
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { type MediaSize, mediaFit } from "../lib/media/fit";
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
	 * The card's own aspect (width / height). Required so the fit adapts to the
	 * device instead of assuming 9:16 — `feed.tsx` sizes the card from the window.
	 */
	cardAspect: number;
}

export function CardVideo({
	url,
	poster,
	isTop,
	onNearEnd,
	cardAspect,
}: CardVideoProps) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const nearEndFired = useRef(false);
	const mutedRetried = useRef(false);
	const onNearEndRef = useRef(onNearEnd);
	onNearEndRef.current = onNearEnd;
	/** Real pixel size, once the player knows it. Undefined → fill (safe default). */
	const [size, setSize] = useState<MediaSize | undefined>(undefined);

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

	/**
	 * Real track dimensions, read once they exist.
	 *
	 * `sourceLoad` carries them on expo-video; `videoTrack` is also polled on
	 * `statusChange` because a cached/looped source can reach `readyToPlay`
	 * without re-firing `sourceLoad`, and a card that never learns its size would
	 * silently keep the `cover` fallback — i.e. the exact cropping bug this fixes,
	 * back again and invisible.
	 */
	useEffect(() => {
		const apply = (
			track: { size?: { width: number; height: number } } | null,
		) => {
			const s = track?.size;
			if (!s || !s.width || !s.height) return;
			setSize((prev) =>
				prev && prev.width === s.width && prev.height === s.height
					? prev
					: { width: s.width, height: s.height },
			);
		};
		const onLoad = player.addListener("sourceLoad", ({ videoSource }) => {
			apply(
				(videoSource as unknown as { videoTracks?: { size?: MediaSize }[] })
					?.videoTracks?.[0] ?? null,
			);
		});
		const onStatus = player.addListener("statusChange", ({ status }) => {
			if (status !== "readyToPlay") return;
			apply(
				(player as unknown as { videoTrack?: { size?: MediaSize } })
					.videoTrack ?? null,
			);
		});
		return () => {
			onLoad.remove();
			onStatus.remove();
		};
	}, [player]);

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

	const fit = mediaFit(size, cardAspect);

	return (
		<View style={styles.frame} pointerEvents="none">
			{/*
			 * Poster. Cropped to fill even when the video is letterboxed: it sits
			 * BEHIND the bands as a soft backdrop, and a letterboxed poster behind a
			 * letterboxed video would show two mismatched frames.
			 */}
			{!!poster && (
				<Image
					source={{ uri: poster }}
					style={StyleSheet.absoluteFill}
					resizeMode="cover"
					blurRadius={fit.letterboxed ? 12 : 0}
				/>
			)}
			{fit.letterboxed && <View style={styles.letterbox} />}
			<VideoView
				player={player}
				style={
					fit.letterboxed
						? [styles.contained, { aspectRatio: fit.boxAspectRatio }]
						: StyleSheet.absoluteFill
				}
				contentFit={fit.contentFit}
				nativeControls={false}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	// `center` so a letterboxed video sits mid-card with equal bands, rather than
	// pinned to the top with all the empty space below it.
	frame: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
	},
	/**
	 * The band behind a letterboxed video. Dark, because §0.3 makes the card face
	 * ALWAYS dark — a light band would read as a rendering fault, and every
	 * on-card token was AA-checked against a dark backdrop.
	 */
	letterbox: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: colors.cardPlainTo,
		opacity: 0.82,
	},
	/** Full card WIDTH, height from the source's aspect (the owner's rule). */
	contained: { width: "100%" },
});
