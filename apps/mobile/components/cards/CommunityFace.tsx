import type { CardIconName } from "@percho/shared/icons";
/**
 * CommunityFace (§1.4) — the community (subdivision) front face.
 *
 * ── 2026-08-16 redesign: immersive full-bleed, same as the CITY card ─────────
 *
 * The owner's ask: the community card becomes an EXPERIENCE card like
 * `AreaFace` — media fills the ENTIRE card, text sits on a bottom scrim, and
 * the white text block under the media is gone. Deliberately NOT
 * `ListingFace`'s layout (media + white block below).
 *
 *   · COMMUNITY pill top-left (kept — the frosted badge, relabelled).
 *   · bookmark disc top-right — the CITY card's translucent white disc +
 *     dark bookmark (owner: 保留 bookmark).
 *   · bottom scrim — `LinearGradient` transparent → rgba(0,0,0,0.5),
 *     exactly the CITY card's scrim (locations [0.55, 1]).
 *   · bottom info, 3 layers (24pt gutters):
 *       a. name (serif 24/600 white — same class as the CITY name)
 *       b. chips — up to TWO lifestyle signal pills, white-on-scrim
 *       c. `Explore →` right-aligned (owner: CTA → "Explore →"; the old
 *          "Why people love it" text link is gone with the white block).
 *     No white bottom information container; no hairline; no place line —
 *     the subdivision's key info is the name + signals, on the photo.
 *
 *   NOTE (2026-08-22): (a)–(c) are no longer three layers. They are ONE line —
 *   see the 08-22 block below, which supersedes this one on the bottom info.
 *   Kept because the rest of the description (full-bleed media, the badge, the
 *   scrim) is still exactly what this file does.
 *
 * ── 2026-08-22 (later): one line, and glyphs instead of pills ───────────────
 *
 * Owner, on device: "community and explore should be aligned, community name
 * size can be bigger, lets add icons to the left of community name for now".
 *
 * The bottom info is now a single centred row — the name at 27pt, its signal
 * GLYPHS, and `Explore` on the right. The pill row is gone; the glyphs are what
 * is left of it, which is the "or just make them some icons to save space"
 * half of the same instruction. A signal with no honest glyph in the 14-glyph
 * subset font draws nothing rather than borrowing one.
 *
 * Revised the same day: the glyphs sit to the RIGHT of the name, and the name
 * wraps to two lines instead of ellipsizing. It is the card's headline and the
 * one string on it a buyer cannot infer from context — a wrapped name costs
 * height the card has, a truncated one costs the name.
 *
 * The cost, stated plainly: a pill could say "3 parks nearby" and a glyph
 * cannot say "3". The owner's own earlier note on this row was 「图标里要有干货
 * 数据 比如33个餐厅」, so the counts are a real loss — accepted "for now".
 *
 * ── 2026-08-22: the card serves the TOUR ─────────────────────────────────────
 *
 * `videosOnly` (2026-08-21) means every community card on the phone now plays
 * an assembled community tour, up to 90 seconds of it. Two consequences:
 *
 *   · A progress hairline along the card's bottom edge. Ninety seconds with no
 *     clock is a blind commitment on a surface whose whole job is deciding
 *     whether to stay; the bar is the cheapest possible answer and costs the
 *     photography nothing. It is drawn HERE rather than inside `CardVideo`
 *     because the scrim above reaches 0.92 black at exactly that edge.
 *   · The `Explore` link breathes once playback passes 82%. `CardVideo` has
 *     fired `onNearEnd` for this since it was written and NOTHING in the feed
 *     was listening — the only consumer in the repo was `dev-foundation`.
 *
 * The `StatBar` that used to sit in the bottom row is GONE from this card
 * (owner 2026-08-22: "remove from front page, but move it to the explore
 * page"). It now renders on `app/community/[slug]`'s hero. Its four values are
 * still `place-stats.ts` placeholders — see that module's header.
 *
 * ── Data, not sample copy ────────────────────────────────────────────────────
 *
 * Three sources for the chip row, in descending confidence, exactly one of
 * which renders:
 *
 *   1. `signals` — the server's per-community lifestyle signals ("Mature
 *      trees", "3 parks nearby"), computed in `apps/web/lib/feed/community-
 *      signals.ts`
 *   2. `reasons` — what residents said, verbatim
 *   3. `dims`    — Percho's category labels, for the 9.4% with no reason
 *   4. `pills`   — authored strings
 *
 * Mixing them would put two registers of claim in one row. A community with
 * none of the four renders NO chip row — fewer chips is the correct answer,
 * never a placeholder.
 *
 * The facts are not lost — `app/community/[slug]` renders every reason with
 * its evidence, and that screen is where the CTA goes.
 */
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	Gesture,
	GestureDetector,
	type GestureType,
} from "react-native-gesture-handler";
import Animated, {
	Easing,
	runOnJS,
	type SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import type { TapSlot } from "../../lib/gesture/tap-slot";
import { redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { EXPLORE_TAP_TARGET } from "./ListingFace";
import { RedlineIcon } from "./redline/RedlineChrome";

/**
 * How many glyphs sit left of the name. TWO, inherited from the pill row that
 * preceded them (owner 2026-08-17, was 3) and now also a width constraint: the
 * icons, the name and `Explore` share ONE line, and every icon is width the
 * name does not get.
 */
const MAX_COMMUNITY_ICONS = 2;

/** Glyph art size in the row left of the name. */
const SIGNAL_ICON_SIZE = 15;

/**
 * Tour progress. 3pt and inset, up from a 2pt hairline flush with the card's
 * edge — the owner could not find that one (2026-08-22: "ugly and not easy to
 * find"). Rounded ends and a gap between dashes need a bar thick enough for
 * the radius to read at all.
 */
const PROGRESS_H = 3;
/** Between dashes. Wide enough to separate, narrow enough to still read as
 *  one bar rather than as a row of pills. */
const DASH_GAP = 3;

/**
 * The 82% nudge on the `Explore` link — `CardSkeleton`'s breath, borrowed
 * because the app already means "alive, waiting for you" with it.
 *
 * FINITE, unlike the skeleton's `-1`. A skeleton pulses until its content
 * arrives and then stops existing; this link stays on screen for as long as
 * the buyer keeps watching, and a CTA that never stops moving reads as a nag.
 * Six half-cycles is three breaths, and an even count lands back on opacity 1.
 */
const BREATH_MS = 900;
const BREATH_DIM = 0.5;
const BREATH_CYCLES = 6;

/**
 * The glyphs shown to the LEFT of the community name (owner 2026-08-22: "lets
 * add icons to the left of community name for now").
 *
 * Same descending-confidence order the pill row used, minus the two sources
 * that cannot produce a glyph: `dims` and `pills` are bare strings, and the
 * card would have to invent the mapping. Those communities simply show no
 * icons — the name still reads.
 *
 * A signal whose phrase has no honest glyph in the 14-glyph subset font is
 * SKIPPED, not substituted (see `signalIcon` on the server), so this can return
 * fewer icons than there are signals, or none at all.
 *
 * Deduped: two signals mapping to the same glyph would read as a rendering bug
 * rather than as two claims — the reason tiles dedupe for the same reason.
 */
function signalIcons(card: CommunityCardV3): CardIconName[] {
	const out: CardIconName[] = [];
	const seen = new Set<CardIconName>();
	const push = (icon: CardIconName | undefined) => {
		if (!icon || seen.has(icon) || out.length >= MAX_COMMUNITY_ICONS) return;
		seen.add(icon);
		out.push(icon);
	};
	for (const s of card.signals ?? []) push(s.icon);
	if (out.length > 0) return out;
	for (const r of card.reasons ?? []) push(r.icon);
	return out;
}

interface CommunityFaceProps {
	card: CommunityCardV3;
	isTop: boolean;
	onExplore?: () => void;
	/**
	 * The stack's tap slots (see `lib/gesture/tap-slot.ts`), same contract as
	 * `ListingFace`: the CTA writes its id into `tapSlot` on touch start and
	 * the pan's `onEnd` decides whether the release was a tap. A `Pressable`
	 * inside the pan gesture area silently stops firing (RNGH #3172), which is
	 * why the link cannot just use `onPress` in the feed. Absent outside the
	 * stack (dev-foundation), where `onExplore` runs through `onPress` instead.
	 */
	tapSlot?: SharedValue<TapSlot>;
	/**
	 * The deck's pan, so the progress bar's own drag can block it. Without this
	 * the scrub and the swipe race for the same horizontal drag — see
	 * `CardRenderArgs.deckGesture`. Absent outside the stack, where there is no
	 * competing gesture and the scrub simply works.
	 */
	deckGesture?: GestureType;
}

export function CommunityFace({
	card,
	isTop,
	onExplore,
	tapSlot,
	deckGesture,
}: CommunityFaceProps) {
	const icons = signalIcons(card);

	/** 0..1 playback position, written by `CardVideo` off the UI thread. */
	const progress = useSharedValue(0);
	const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
	const segments = card.tourSegments ?? [];

	/* ── Scrubbing ────────────────────────────────────────────────────────── */

	/** Measured width of the bar, so a touch x can become a fraction. */
	const barWidth = useSharedValue(0);
	/** True while a finger is down on the bar; `CardVideo` stops writing then. */
	const scrubbing = useSharedValue(false);
	/** 0..1 seek request for `CardVideo`; -1 = none. It disarms the channel. */
	const seekTo = useSharedValue(-1);
	/** Which dash the finger is over, or -1. Drives the floating label. */
	const scrubIndex = useSharedValue(-1);
	const [scrubbedName, setScrubbedName] = useState<string | null>(null);

	/**
	 * The dash boundaries as a plain number array.
	 *
	 * A worklet may only close over values Reanimated can serialise, and this is
	 * read on the UI thread on every move. Numbers, not the segment objects.
	 */
	const bounds = useMemo(
		() => segments.map((seg) => seg.endFraction),
		[segments],
	);

	/**
	 * Name the finger's dash, on the JS thread, only when it CHANGES.
	 *
	 * Not `runOnJS` per move: a drag fires at display rate and this would be a
	 * cross-thread hop and a React render per frame. Crossing into a new place
	 * is the only moment the label has anything new to say.
	 */
	useAnimatedReaction(
		() => scrubIndex.value,
		(index, previous) => {
			if (index === previous) return;
			runOnJS(setScrubbedName)(
				index < 0 ? null : (segments[index]?.name ?? null),
			);
		},
		[segments],
	);

	/**
	 * Drag the bar to move through the film.
	 *
	 * `blocksExternalGesture(deckGesture)` is load-bearing: a scrub is a
	 * horizontal drag and so is a swipe. Without the relation, whichever
	 * activates first wins — and losing that race means the card the buyer was
	 * trying to rewind flies off the deck instead.
	 *
	 * `useMemo` with narrow deps for the reason `useSwipeCard` documents:
	 * replacing a live `Gesture.Pan` mid-drag drops the in-flight touch, so
	 * `onFinalize` never runs and `scrubbing` would be left stuck true — which
	 * would freeze the bar for the rest of the card's life.
	 */
	const scrub = useMemo(() => {
		const locate = (x: number) => {
			"worklet";
			const width = barWidth.value;
			if (width <= 0) return 0;
			return Math.min(Math.max(x / width, 0), 1);
		};
		const dashAt = (ratio: number) => {
			"worklet";
			for (let i = 0; i < bounds.length; i++) {
				if (ratio <= (bounds[i] ?? 1)) return i;
			}
			return bounds.length - 1;
		};
		const track = (x: number) => {
			"worklet";
			const ratio = locate(x);
			progress.value = ratio;
			scrubIndex.value = dashAt(ratio);
		};
		let gesture = Gesture.Pan()
			.enabled(isTop && !!card.videoUrl)
			// A scrub starts where the finger lands, so the bar jumps under it on
			// touch-down rather than waiting for movement.
			.minDistance(0)
			.onBegin((e) => {
				scrubbing.value = true;
				track(e.x);
			})
			.onUpdate((e) => track(e.x))
			// `onFinalize`, not `onEnd`: a cancelled gesture must also release the
			// bar and commit, or `scrubbing` stays true and playback never
			// reconnects to the bar again.
			.onFinalize(() => {
				seekTo.value = progress.value;
				scrubbing.value = false;
				scrubIndex.value = -1;
			});
		if (deckGesture) gesture = gesture.blocksExternalGesture(deckGesture);
		return gesture;
	}, [
		bounds,
		isTop,
		card.videoUrl,
		deckGesture,
		barWidth,
		progress,
		scrubbing,
		seekTo,
		scrubIndex,
	]);

	const onBarLayout = (e: LayoutChangeEvent) => {
		barWidth.value = e.nativeEvent.layout.width;
	};

	/** True once this card's tour has passed `CardVideo`'s 82% mark. */
	const [nearEnd, setNearEnd] = useState(false);
	const breath = useSharedValue(1);

	/*
	 * The nudge belongs to one viewing, not to the card. A face that leaves the
	 * top and comes back must be able to invite again — and assigning `breath`
	 * cancels a repeat still in flight, so a mid-breath swipe does not leave the
	 * next card's link stuck at half opacity.
	 */
	useEffect(() => {
		if (isTop) return;
		setNearEnd(false);
		breath.value = 1;
	}, [isTop, breath]);

	useEffect(() => {
		if (!nearEnd) return;
		breath.value = withRepeat(
			withTiming(BREATH_DIM, {
				duration: BREATH_MS,
				easing: Easing.inOut(Easing.quad),
			}),
			BREATH_CYCLES,
			true,
		);
	}, [nearEnd, breath]);

	const breathing = useAnimatedStyle(() => ({ opacity: breath.value }));

	/** See `ListingFace.arm` — no gate here; the tap decision happens at release. */
	const arm = (target: string) => () => {
		if (!tapSlot) return;
		tapSlot.value = { target };
	};

	return (
		<View style={styles.face}>
			{/* Media — fills the ENTIRE card (owner 2026-08-16: full-image style) */}
			{card.videoUrl ? (
				<CardVideo
					url={card.videoUrl}
					poster={card.heroUrl}
					isTop={isTop}
					progress={progress}
					scrubbing={scrubbing}
					seekTo={seekTo}
					onNearEnd={() => setNearEnd(true)}
					/*
					 * `cover`, unconditionally. NOT the measured `frameAspect` path:
					 * that makes the fit a RUNTIME decision, and `mediaFit` returns
					 * `contain` for any source wider than the frame — which uncovers
					 * `CardVideo`'s blurred-poster backdrop, i.e. the "black gap" the
					 * owner reported four times. A landscape source is cropped here,
					 * deliberately; the fix if it ever matters is re-rendering that
					 * row, not re-deriving the fit.
					 */
					fit="cover"
				/>
			) : (
				/*
				 * Same rule for the photo path. Only 1 of 8,679 communities has a
				 * video, so ~every community card renders through HERE.
				 */
				<CardPhoto url={card.heroUrl} fit="cover" />
			)}

			{/* COMMUNITY pill — the frosted badge, kept (owner: 保留 label). */}
			<View style={styles.badgeSlot}>
				<View style={styles.badge}>
					<Text style={styles.badgeLabel}>COMMUNITY</Text>
				</View>
			</View>

			{/* No bookmark here. The tour video draws its place name and distance
			    in the top-right corner (see `_render_label_png` in the render
			    worker), and a 40px disc at top:12/right:12 sat on top of it —
			    owner 2026-08-20: "remove the save button on the top right for
			    cards - this is where the location and distance will display".
			    The other card kinds keep theirs; only this one plays a video
			    with a label in that corner. */}

			{/* Bottom scrim — transparent until ~55% down, then darkening to a
			    deep 0.92 at the bottom (owner 2026-08-19: 底部渐变 + 信息文字条,
			    same as the listing card). */}
			<LinearGradient
				colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.92)"]}
				locations={[0.55, 0.78, 1]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.scrim}
				pointerEvents="none"
			/>

			{/* Bottom info — ONE line: signal glyphs, the community name, and
			    `Explore` on the right, all on a shared centre line (owner
			    2026-08-22: "community and explore should be aligned... lets add
			    icons to the left of community name"). The pill row is gone; the
			    glyphs are what is left of it.

			    The name is the only thing that gives when space runs out —
			    `flexShrink: 0` on both the glyphs and the link, `minWidth: 0` on
			    the name. A truncated community name is still readable; a
			    truncated CTA is not, and half a glyph is nothing at all. */}
			<View style={styles.info}>
				<View style={styles.infoLeft}>
					{/* Two lines, not one. A name that did not fit used to ellipsize
					    — "Hidden Lakes at Sug…" — which is the one thing on this
					    card a buyer cannot afford to be guessing at (owner
					    2026-08-22: "if community name is long, it can be truncated,
					    fix that"). Wrapping spends card height, which this card has;
					    truncation spent the name, which it does not. */}
					<Text style={styles.name} numberOfLines={2}>
						{card.name}
					</Text>
					{icons.length > 0 && (
						<View style={styles.icons}>
							{icons.map((name) => (
								<RedlineIcon
									key={name}
									name={name}
									size={SIGNAL_ICON_SIZE}
									color="rgba(255,255,255,0.85)"
								/>
							))}
						</View>
					)}
				</View>
				{!!onExplore && (
					<Animated.View style={[styles.ctaRow, breathing]}>
						<Pressable
							onTouchStart={arm(EXPLORE_TAP_TARGET)}
							onPress={tapSlot ? undefined : onExplore}
							accessibilityRole="link"
							accessibilityLabel={`Explore ${card.name}`}
							hitSlop={12}
							style={({ pressed }) => [
								styles.ctaLink,
								pressed && styles.ctaPressed,
							]}
						>
							<Text style={styles.ctaLabel} numberOfLines={1}>
								Explore
							</Text>
							<ArrowRightIcon />
						</Pressable>
					</Animated.View>
				)}
			</View>

			{/* Tour progress — one dash per PLACE when the film's structure came
			    down with it, one continuous bar when it did not, and draggable
			    either way. Only for a card that actually plays something. */}
			{!!card.videoUrl && (
				<GestureDetector gesture={scrub}>
					{/* The TOUCH target, not the art: a 3pt bar cannot be hit. The
					    padding gives it a ~28pt band while the bar stays 3pt, which
					    is why this view is transparent and the row inside is what
					    you see. */}
					<View style={styles.progressHit}>
						{/* The place under the finger (owner 2026-08-22: "should show
						    something when hover"). There is no hover on a phone, so
						    it appears on TOUCH and follows the drag — a label that
						    could only be summoned by a mouse would never be seen. */}
						{scrubbedName !== null && scrubbedName !== "" && (
							<View style={styles.scrubLabel}>
								<Text style={styles.scrubLabelText} numberOfLines={1}>
									{scrubbedName}
								</Text>
							</View>
						)}
						<View style={styles.progressRow} onLayout={onBarLayout}>
							{segments.length > 0 ? (
								segments.map((seg, i) => (
									<ProgressDash
										key={`${seg.name}-${seg.endFraction}`}
										progress={progress}
										start={i === 0 ? 0 : (segments[i - 1]?.endFraction ?? 0)}
										end={seg.endFraction}
									/>
								))
							) : (
								<View style={styles.dashTrack}>
									<Animated.View style={[styles.dashFill, fill]} />
								</View>
							)}
						</View>
					</View>
				</GestureDetector>
			)}
		</View>
	);
}

/**
 * One dash of the tour's progress bar — one PLACE in the film.
 *
 * A component rather than a loop body because each dash needs its OWN
 * `useAnimatedStyle`, and hooks cannot be called in a map.
 *
 * The dash is flexed by its SHARE of the film, so a place the tour lingers on
 * gets a wider dash than one it passes through. Reading `progress` (0..1 of the
 * whole film) against this dash's own span turns the shared value into a local
 * 0..1 with no extra state and no second listener.
 */
function ProgressDash({
	progress,
	start,
	end,
}: {
	progress: SharedValue<number>;
	start: number;
	end: number;
}) {
	const span = Math.max(end - start, 1e-6);
	const style = useAnimatedStyle(() => {
		const local = (progress.value - start) / span;
		return { width: `${Math.min(Math.max(local, 0), 1) * 100}%` };
	});
	return (
		<View style={[styles.dashTrack, { flexGrow: span }]}>
			<Animated.View style={[styles.dashFill, style]} />
		</View>
	);
}

/**
 * The arrow after the CTA label — `ListingFace`'s art, at the same size and
 * colour, so the two cards' links are the same link.
 *
 * Copied rather than imported: `ListingFace` does not export it and this pass
 * may not edit that file. It cannot come from the icon font (the Phosphor
 * subset ships FILL weights only, which is what made the old arrow a thick
 * wedge) and `react-native-svg` red-screens in Expo Go on this project (DEVLOG
 * 2026-07-30 04:55), so it is composed from bordered `View`s on Lucide's own
 * 24-grid geometry: shaft (5,12)→(19,12), head corners (12,5)-(19,12)-(12,19),
 * i.e. a 45°-rotated square wearing only its top and right borders.
 */
const OUTLINE_STROKE = 1.75;
const ARROW_SIZE = 16;
const ARROW_K = ARROW_SIZE / 24;
/** Side of the rotated square whose top+right borders draw the arrowhead. */
const ARROW_HEAD = 7 * ARROW_K * Math.SQRT2;

function ArrowRightIcon() {
	return (
		<View style={styles.arrowBox}>
			<View style={styles.arrowShaft} />
			<View style={styles.arrowHead} />
		</View>
	);
}

/** The listing card's bookmark, recoloured dark like the CITY card's (saved
 * state fills the body). */
const BOOKMARK_SIZE = 16;
const BOOKMARK_K = BOOKMARK_SIZE / 24;
const BM_LEFT = 5 * BOOKMARK_K;
const BM_WIDTH = 14 * BOOKMARK_K;
const BM_TOP = 3 * BOOKMARK_K;
const BM_BOTTOM = 21 * BOOKMARK_K;
const BM_NOTCH = 16 * BOOKMARK_K;
const BM_RUN = BM_WIDTH / 2;
const BM_RISE = BM_BOTTOM - BM_NOTCH;
const BM_DIAG = Math.hypot(BM_RUN, BM_RISE);
const BM_ANGLE = (Math.atan2(BM_RISE, BM_RUN) * 180) / Math.PI;
/** Same dark ink as the COMMUNITY pill label. */
const BOOKMARK_INK = "#181B18";

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: redline.card, overflow: "hidden" },
	badgeSlot: { position: "absolute", top: 12, left: 12, zIndex: 2 },
	/** Frosted COMMUNITY badge — the listing card's badge, relabelled. */
	badge: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(255,255,255,0.92)",
		borderRadius: redlineRadii.badge,
		paddingVertical: 7,
		paddingHorizontal: 10,
		overflow: "hidden",
	},
	/** Neutral ink, not green — green is reserved for interactive state. */
	badgeLabel: { ...redlineText.listingCard.badge, color: "#181B18" },
	/**
	 * Bottom scrim — `overflow: hidden` on `face` clips it to the card's
	 * rounded corner. Same as the CITY card's.
	 */
	scrim: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1,
	},
	info: {
		position: "absolute",
		left: 24,
		right: 24,
		bottom: 24,
		zIndex: 2,
		flexDirection: "row",
		// `center`, not `flex-end`: this is what puts the name and the link on
		// one line rather than on a shared bottom edge (owner: "community and
		// explore should be aligned").
		alignItems: "center",
		gap: 12,
	},
	/** Name + glyphs. `minWidth: 0` is what lets the name WRAP instead of
	 *  pushing `Explore` off the card — a text child will not shrink below its
	 *  content without it. */
	infoLeft: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
	},
	/**
	 * The glyph run, RIGHT of the name (owner 2026-08-22: "icons should be on
	 * the right side of the community name"). Never squeezed — see the row's
	 * doc; the name is what gives. Centred against the name block, so on a
	 * wrapped two-line name they sit level with its middle.
	 */
	icons: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		flexShrink: 0,
	},
	/**
	 * Community name — serif 27/600 white, the CITY name's family. Up from 24
	 * (owner 2026-08-22: "community name size can be bigger"); it is the card's
	 * headline and it no longer shares its line with a pill row.
	 */
	name: {
		...redlineText.place,
		fontSize: 27,
		lineHeight: 30,
		fontWeight: "600",
		color: "#FFFFFF",
		flexShrink: 1,
		minWidth: 0,
	},
	/**
	 * Explore → — the right zone of the info row, sized by its own content and
	 * never squeezed. `flexShrink: 0` because the left column is the one that
	 * gives: a truncated community name is readable, a truncated CTA is not.
	 */
	ctaRow: {
		flexDirection: "row",
		alignItems: "center",
		flexShrink: 0,
	},
	ctaLink: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 6,
		minHeight: 32, // §0.5 touch floor
		paddingHorizontal: 2,
	},
	ctaPressed: { opacity: 0.7 },
	ctaLabel: {
		...redlineText.listingCard.cta,
		fontSize: 15,
		fontWeight: "500",
		color: "rgba(255,255,255,0.92)",
	},

	/**
	 * The bar's TOUCH band. Transparent and ~28pt tall around a 3pt bar: a 3pt
	 * target is roughly a tenth of the 44pt Apple asks for, and the bar is now
	 * draggable, so the hit area has to be real even though the art is a
	 * hairline. `justifyContent: flex-end` keeps the bar itself pinned to the
	 * bottom of the band, where it was before the band existed.
	 */
	progressHit: {
		position: "absolute",
		left: 24,
		right: 24,
		bottom: 0,
		paddingBottom: 12,
		paddingTop: 13,
		justifyContent: "flex-end",
		zIndex: 3,
	},
	/**
	 * The progress row — INSET from the card's edges, not flush with them
	 * (owner 2026-08-22: the flush 2pt hairline was "ugly and not easy to
	 * find"). Sitting on the same 24pt gutter as the name reads as part of the
	 * card's information rather than as a scrollbar stuck to its frame, and it
	 * no longer has its ends clipped by the corner radius.
	 */
	progressRow: {
		height: PROGRESS_H,
		flexDirection: "row",
		alignItems: "center",
		gap: DASH_GAP,
	},
	/**
	 * The dragged-to place, floating above the bar. Left-anchored rather than
	 * tracking the finger: a label that slides under the thumb is a label the
	 * thumb covers, and it would collide with the card's edges at both ends.
	 */
	scrubLabel: {
		position: "absolute",
		left: 0,
		bottom: 22,
		maxWidth: "100%",
		paddingHorizontal: 9,
		paddingVertical: 5,
		borderRadius: 8,
		// The COMMUNITY badge's fill. `_render_label_png` in the render worker
		// works through why a card's chrome over photography is opaque white
		// rather than translucent: at 92% it reads the same over a blown-out sky
		// and over dark pines, so nothing flickers as the footage cuts.
		backgroundColor: "rgba(255,255,255,0.92)",
	},
	scrubLabelText: {
		...redlineText.listingCard.tag,
		color: "#181B18",
	},
	/**
	 * One dash. `flexGrow` is set per-dash from its share of the film;
	 * `flexBasis: 0` so that share is the ONLY thing deciding its width, and
	 * `overflow: hidden` so the fill inside is clipped to the rounded end.
	 */
	dashTrack: {
		flexGrow: 1,
		flexBasis: 0,
		height: PROGRESS_H,
		borderRadius: PROGRESS_H / 2,
		backgroundColor: "rgba(255,255,255,0.28)",
		overflow: "hidden",
	},
	dashFill: {
		height: PROGRESS_H,
		borderRadius: PROGRESS_H / 2,
		backgroundColor: "#FFFFFF",
	},

	// ─── Arrow art (see the block above) ──────────────────────────────────
	arrowBox: { width: ARROW_SIZE, height: ARROW_SIZE },
	arrowShaft: {
		position: "absolute",
		left: 5 * ARROW_K,
		width: 14 * ARROW_K,
		top: (ARROW_SIZE - OUTLINE_STROKE) / 2,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: "#FFFFFF",
	},
	arrowHead: {
		position: "absolute",
		left: (ARROW_SIZE - ARROW_HEAD) / 2,
		top: (ARROW_SIZE - ARROW_HEAD) / 2,
		width: ARROW_HEAD,
		height: ARROW_HEAD,
		borderTopWidth: OUTLINE_STROKE,
		borderRightWidth: OUTLINE_STROKE,
		borderColor: "#FFFFFF",
		borderTopRightRadius: OUTLINE_STROKE,
		transform: [{ rotate: "45deg" }],
	},
	bookmarkBox: { width: BOOKMARK_SIZE, height: BOOKMARK_SIZE },
	bookmarkFill: {
		position: "absolute",
		left: BM_LEFT + OUTLINE_STROKE,
		top: BM_TOP + OUTLINE_STROKE,
		width: BM_WIDTH - OUTLINE_STROKE * 2,
		height: BM_NOTCH - BM_TOP - OUTLINE_STROKE,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkTop: {
		position: "absolute",
		left: BM_LEFT,
		top: BM_TOP,
		width: BM_WIDTH,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkSide: {
		position: "absolute",
		top: BM_TOP,
		width: OUTLINE_STROKE,
		height: BM_BOTTOM - BM_TOP,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkSideLeft: { left: BM_LEFT },
	bookmarkSideRight: { left: BM_LEFT + BM_WIDTH - OUTLINE_STROKE },
	bookmarkDiag: {
		position: "absolute",
		top: (BM_BOTTOM + BM_NOTCH) / 2 - OUTLINE_STROKE / 2,
		width: BM_DIAG,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkDiagLeft: {
		left: BM_LEFT + BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${-BM_ANGLE}deg` }],
	},
	bookmarkDiagRight: {
		left: BM_LEFT + BM_WIDTH - BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${BM_ANGLE}deg` }],
	},
});
