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
 *     every card swap so the next top card can fire again,
 *   - writes 0..1 playback progress into the caller's `progress` shared value,
 *     for a caller that wants to draw a progress bar (see `CommunityFace`).
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
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import {
	type SharedValue,
	runOnJS,
	useAnimatedReaction,
} from "react-native-reanimated";
import { type MediaSize, mediaFit } from "../lib/media/fit";
import { useSoundStore } from "../state/sound";
import { colors } from "../theme/tokens";

const NEAR_END_RATIO = 0.82;
const TIME_UPDATE_INTERVAL_S = 0.25;
/**
 * How close (in seconds) a `timeUpdate` has to land to the seek we asked for
 * before the bar goes back to following playback. One tick interval plus a
 * little: a seek that has landed reports within a tick of the target, and
 * anything further away is still the OLD position on its way out.
 */
const SEEK_SETTLE_S = TIME_UPDATE_INTERVAL_S + 0.15;
/** Give up waiting for a seek to land, so a refused one cannot freeze the bar. */
const SEEK_TIMEOUT_MS = 2000;

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
	/**
	 * The card's REAL `width / height`. When supplied, the fit is DERIVED from
	 * the video's measured track size instead of taken from `fit` — see
	 * `lib/media/fit.ts` for the two rules it satisfies at once.
	 *
	 * Owner, 2026-08-02: 「视频宽度不够 没有占满card 有黑色空隙」. The community
	 * cover is 1080×1920 (0.5625) in a 2:3 card (0.667), i.e. NARROWER than the
	 * frame, so the standing `contain` rule pillarboxed it. A source narrower
	 * than the frame must fill; only a source WIDER than the frame may band.
	 *
	 * Absent → the `fit` prop is used verbatim, so `ListingFace`'s 1:1 block and
	 * `AreaFace` behave exactly as before.
	 */
	frameAspect?: number;
	/**
	 * The fit to use until (or unless) the video's track size is measured.
	 * Only consulted when `frameAspect` is supplied.
	 *
	 * Pass `"cover"` when the caller KNOWS its source is portrait. The owner
	 * reported the community card's black side-gaps twice — the second time
	 * AFTER the measured fix shipped (「视频黑色空隙 还在!」) — and the reason a
	 * measured fix can fail silently is that `availableVideoTracks` on an iOS HLS
	 * source only populates when the manifest exposes them. No error, no log, the
	 * card just sits on the `contain` fallback forever. A known-portrait surface
	 * must not be waiting on a measurement to look right.
	 */
	unknownFit?: "contain" | "cover";
	/**
	 * Playback position as 0..1, written on every `timeUpdate` tick.
	 *
	 * A shared value rather than a callback ON PURPOSE: `timeUpdateEventInterval`
	 * is 0.25s, so a `(ratio: number) => void` prop would re-render the top card
	 * four times a second for a 2px bar. Writing a shared value touches no React
	 * state at all — the same reason `tapSlot` is one on the card faces.
	 *
	 * The bar is NOT drawn here. On a full-bleed card this component sits under
	 * the face's bottom scrim (which reaches 0.92 black), so a bar painted inside
	 * this frame would be dimmed by it. The caller owns the layer.
	 */
	progress?: SharedValue<number>;
	/**
	 * Set by the caller while the buyer is dragging a scrubber.
	 *
	 * While true this component stops writing `progress` — the bar has to follow
	 * the FINGER, and a `timeUpdate` tick from the still-playing video would
	 * yank it back to wherever playback actually is, four times a second.
	 */
	scrubbing?: SharedValue<boolean>;
	/**
	 * A seek request as 0..1 of the duration; `-1` means none.
	 *
	 * The caller writes a fraction, this component performs the seek and writes
	 * `-1` back — the reset is what makes the channel re-armable, and doing it
	 * here rather than in the caller means one owner for the whole handshake.
	 *
	 * A shared value rather than an imperative handle because the player is
	 * private to this component and the scrubber lives on the card face; the
	 * alternative is lifting `useVideoPlayer` out, which would put the player's
	 * lifecycle in a component that does not render it.
	 */
	seekTo?: SharedValue<number>;
}

export function CardVideo({
	url,
	poster,
	isTop,
	onNearEnd,
	fit = "contain",
	frameAspect,
	unknownFit = "contain",
	progress,
	scrubbing,
	seekTo,
}: CardVideoProps) {
	const soundOn = useSoundStore((s) => s.soundOn);
	const nearEndFired = useRef(false);
	const mutedRetried = useRef(false);
	/**
	 * The seek we asked for and are still waiting to see land: the target time
	 * in seconds, and the moment we stop waiting for it. `null` when playback
	 * owns the bar. See `applySeek`.
	 */
	const pendingSeek = useRef<{ time: number; until: number } | null>(null);
	const onNearEndRef = useRef(onNearEnd);
	onNearEndRef.current = onNearEnd;
	/**
	 * The video's real track size, once the player reports one.
	 *
	 * `null` until then, and `mediaFit` treats null as `contain` — never `cover`,
	 * or a landscape video would flash a zoomed crop for a frame.
	 */
	const [size, setSize] = useState<MediaSize | null>(null);

	const player = useVideoPlayer(url, (p) => {
		p.loop = true;
		p.muted = true;
		p.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_S;
	});

	/**
	 * Jump to a fraction of the duration.
	 *
	 * Clamped short of the very end: seeking to exactly `duration` on a looping
	 * player lands on the wrap boundary, which restarts the film — the opposite
	 * of what dragging the bar to its right edge is asking for.
	 */
	const applySeek = useCallback(
		(ratio: number) => {
			const dur = player.duration;
			if (!dur || dur <= 0) return;
			const clamped = Math.max(0, Math.min(ratio, 0.999));
			const target = clamped * dur;
			player.currentTime = target;
			/*
			 * Hold the bar where the finger left it until playback gets there.
			 *
			 * Setting `currentTime` on an HLS player is a REQUEST, not a jump: the
			 * next `timeUpdate` ticks still report the position the film was at
			 * when the finger landed. With nothing holding the bar, releasing it
			 * clears `scrubbing` and the very next tick (≤0.25s later) yanks the
			 * fill back to where the buyer just dragged it AWAY from — the owner's
			 * 2026-08-23 report, where a tap on the bar named the place but left
			 * the progress sitting exactly where it was.
			 */
			pendingSeek.current = {
				time: target,
				until: Date.now() + SEEK_TIMEOUT_MS,
			};
			if (progress) progress.value = clamped;
		},
		[player, progress],
	);

	// Play-gate + reset. Reset the 82% latch on every top-change (= card swap).
	// biome-ignore lint/correctness/useExhaustiveDependencies: soundOn read once here on purpose — the effect below tracks it without restarting playback
	useEffect(() => {
		nearEndFired.current = false;
		mutedRetried.current = false;
		// The play-gate rewinds to 0 below; the bar has to rewind with it, or a
		// card swapped back to the top shows the previous card's fill for a tick.
		// That rewind is a seek of its own, so a request left over from the
		// previous card must not be left holding the bar against it.
		pendingSeek.current = null;
		if (progress) progress.value = 0;
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
			if (!isTop) return;
			const dur = player.duration;
			if (!dur || dur <= 0) return;
			const ratio = currentTime / dur;
			// The finger owns the bar while it is down. Still fires `onNearEnd`
			// below: playback has genuinely reached 82% whether or not anyone is
			// dragging, and the CTA's nudge is about the film, not the bar.
			if (scrubbing?.value) return;
			const pending = pendingSeek.current;
			if (pending) {
				if (
					Math.abs(currentTime - pending.time) <= SEEK_SETTLE_S ||
					Date.now() > pending.until
				) {
					pendingSeek.current = null;
				} else {
					// Still the pre-seek position. Keep the bar where it was put.
					if (progress) progress.value = Math.min(pending.time / dur, 1);
					return;
				}
			}
			// Raw, not eased. Ticks land every 0.25s, which on a 90s tour is a
			// 0.28%-of-width step — invisible. `withTiming` between ticks would
			// buy nothing and would animate the loop's rewind BACKWARDS over a
			// quarter second, which is a visible artefact where none exists now.
			if (progress) progress.value = Math.min(ratio, 1);
			if (nearEndFired.current) return;
			if (ratio >= NEAR_END_RATIO && ratio < 1) {
				nearEndFired.current = true;
				onNearEndRef.current?.();
			}
		});
		return () => sub.remove();
	}, [player, isTop, progress, scrubbing]);

	/**
	 * Perform a seek the caller asked for, then disarm the channel.
	 *
	 * `useAnimatedReaction` rather than an effect: the request is written from a
	 * gesture worklet on the UI thread, and a shared value write does not
	 * re-render React. This is the documented hop back.
	 */
	useAnimatedReaction(
		() => seekTo?.value ?? -1,
		(requested) => {
			if (requested < 0) return;
			if (seekTo) seekTo.value = -1;
			runOnJS(applySeek)(requested);
		},
		// `applySeek` belongs in the deps: it closes over the player, and a face
		// reused for the next card gets a NEW player. Without it this reaction
		// keeps the first card's `applySeek` and every later scrub seeks a player
		// nothing is showing.
		[seekTo, applySeek],
	);

	/**
	 * Learn the real track size, so `mediaFit` can decide fill-vs-letterbox.
	 *
	 * Two listeners, not one, and that is deliberate. `sourceLoad` carries the
	 * size directly but does NOT re-fire for a cached or looping source, so a card
	 * remounted onto a URL the player already holds would never learn its size and
	 * would silently keep the `contain` fallback forever — the exact failure mode
	 * this component's header records (an earlier attempt read a field that did not
	 * exist, so no card ever learned its size). `statusChange → readyToPlay` reads
	 * `player.videoTrack` as the backstop.
	 *
	 * Reset on source change, or a new portrait cover briefly inherits the
	 * previous landscape one's fit — visible as a jump on swipe. Done as the
	 * FIRST statement of this effect, keyed on `player`: `useVideoPlayer(url)`
	 * returns a new player when the url changes, so `player` already IS the
	 * source identity and listing `url` as well is a redundant dep (Biome says so
	 * and it is right — suppressing a correct rule is how the next person
	 * inherits a lie).
	 */
	useEffect(() => {
		if (frameAspect == null) return; // caller opted out; `fit` is used verbatim
		setSize(null);
		const commit = (s?: { width: number; height: number } | null) => {
			if (!s || s.width <= 0 || s.height <= 0) return;
			setSize((prev) =>
				prev && prev.width === s.width && prev.height === s.height
					? prev
					: { width: s.width, height: s.height },
			);
		};
		/**
		 * HLS delivers one `VideoTrack` per rendition (240p…1080p for our CF
		 * Stream sources) and they all share the source's aspect. The largest is
		 * taken so the numbers in a log read as the real render size rather than
		 * as a 240p thumbnail.
		 */
		const onLoad = player.addListener("sourceLoad", (payload) => {
			const tracks = payload?.availableVideoTracks ?? [];
			const best = tracks.reduce<{ width: number; height: number } | null>(
				(acc, t) =>
					t?.size && (!acc || t.size.width > acc.width) ? t.size : acc,
				null,
			);
			commit(best);
		});
		const onTrack = player.addListener("videoTrackChange", ({ videoTrack }) => {
			commit(videoTrack?.size ?? null);
		});
		const onStatus = player.addListener("statusChange", ({ status }) => {
			if (status !== "readyToPlay") return;
			commit(player.videoTrack?.size ?? null);
		});
		// A source already loaded before this effect ran emits nothing new.
		commit(player.videoTrack?.size ?? null);
		return () => {
			onLoad.remove();
			onTrack.remove();
			onStatus.remove();
		};
	}, [player, frameAspect]);

	/**
	 * The fit actually applied.
	 *
	 * `frameAspect` supplied → derived from the measured size (fill a source that
	 * is narrower than the card, letterbox one that is wider). Not supplied →
	 * the caller's own `fit`, unchanged.
	 */
	const appliedFit =
		frameAspect == null ? fit : mediaFit(size, frameAspect, unknownFit);

	return (
		<View style={styles.frame} pointerEvents="none">
			{/*
			 * Backdrop for whatever the video does not cover: a blurred, dimmed copy
			 * of the poster, so a letterbox area still belongs to this card.
			 *
			 * SKIPPED entirely under `cover`, where the video fills the frame and
			 * this layer can only ever be overdraw. Two reasons that matters rather
			 * than being a micro-optimisation: it is the layer the owner has been
			 * seeing as the "black band" whenever the fit resolved to `contain`
			 * (reported four times), so not painting it means a future fit
			 * regression shows as a visible gap instead of quietly looking like a
			 * design choice; and it saves a full-card blurred image decode per card.
			 */}
			{appliedFit !== "cover" && (
				<>
					{!!poster && (
						<Image
							source={{ uri: poster }}
							style={StyleSheet.absoluteFill}
							resizeMode="cover"
							blurRadius={16}
						/>
					)}
					<View style={styles.scrim} />
				</>
			)}
			<VideoView
				player={player}
				style={StyleSheet.absoluteFill}
				// The owner's rule, for every aspect ratio. Never `cover` —
				// EXCEPT when the caller knows the source aspect already matches
				// its box (the 1:1 inline block, see `fit` above).
				contentFit={appliedFit}
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
