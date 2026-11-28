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
 * page"), and gone from the explore page too (phase129): its four values were
 * `place-stats.ts` placeholders, and the module was deleted with it.
 *
 * ── 2026-08-23: that hairline is a scrubber ─────────────────────────────────
 *
 * The bar is now 3pt, inset on the card's own 24pt gutter, and cut into one
 * dash per place. It can be dragged or tapped. Three notes, one per day it
 * cost:
 *
 *   · A scrub and a swipe are the same horizontal drag.
 *     `blocksExternalGesture(deckGesture)` makes the deck wait for this
 *     gesture; without it, whichever activates first wins and the card the
 *     buyer was rewinding flies off the stack instead.
 *   · A TAP is a pan that never travels. It never activates, the deck takes
 *     the touch, and `onFinalize` never runs — so the seek is asked for in
 *     `onBegin` and the release comes off `onTouchesUp` (the raw pointer
 *     lift), with `onFinalize` only as a backstop.
 *   · The seek itself belongs to `CardVideo` (the `seekTo` channel), and it is
 *     deliberately TOLERANT rather than frame-accurate — see `applySeek`
 *     there for why a precise seek on HLS can simply never happen.
 *
 * ── 2026-09-05 (phase174): the corners become the listing card's ────────────
 *
 * Owner: "Community card top right has poi name, this is not aligned with top
 * left community label, and it pushes the sound and saved icons below, it is
 * not consistent with listing, can you redesign this?" Then, on the layout:
 * "move it down to the right side of the community name, make it a cute label
 * here instead top… we can show poi and distance on the top left, and keep the
 * sound and saved button on the top right", and finally "put community label on
 * top of the community name".
 *
 * What that resolves to, and why each part:
 *
 *   · The place label was never THIS FILE's. The render worker BURNED it into
 *     every tour (`_render_label_png`), scaled from a fixed 361pt reference
 *     card while the card plays with `fit="cover"` — so its size followed the
 *     video's crop rather than the card and it could not sit on the badge's
 *     line on any device. It is drawn here now, from `tourSegments`, which the
 *     card already had for the dashed bar. The five rendered films were
 *     re-assembled without it (scripts/admin/reassemble-community-tours.ts).
 *   · Top-LEFT is that place pill: the COMMUNITY badge's own shape and inset,
 *     carrying the place name and its distance. A community with no film shows
 *     NOTHING there — the corner is simply empty, which is what it was before
 *     any of this and what ~all 8,679 communities will render.
 *   · Top-RIGHT is `CardCorner` with BOTH controls at 12/12, the listing card's
 *     capsule verbatim. The bookmark comes back after 2026-08-20 removed it;
 *     the reason it was removed (the burned pill under it) is gone.
 *   · Since phase367.2 the pill and the capsule are DARK glass and the
 *     COMMUNITY tag is plain capitals: four things wore the same white pill
 *     (place, capsule, tag, Explore) and only Explore is the next thing to
 *     press. It is the one white object on the card now (owner, off
 *     `/demos/ui-accent-v1`: 「都做」).
 *   · COMMUNITY moves to an EYEBROW above the name. Beside the name it would
 *     have cost the two signal glyphs, and on a long name the name itself —
 *     "Apremont – Highcroft" ellipsized at the ~125pt the tag left it, which
 *     the 2026-08-22 no-truncation rule forbids. Above it, the tag competes for
 *     no width at all, so ONE rule serves every name length and the glyphs stay.
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
 *
 * ── 2026-11-21: no glyphs, no arrow ─────────────────────────────────────────
 *
 * Owner: "去掉community name旁边的小label 没啥用" — the signal glyphs beside
 * the name are gone, and with them the name-width measuring that kept them
 * snug to a wrapped name. `Explore` is the city card's white pill without the
 * arrow ("保留explore 不要箭头"). The notes above that describe the glyphs are
 * history.
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
import {
	DECK_TAP_TARGET,
	HIDE_TAP_TARGET,
	SHARE_TAP_TARGET,
	SOUND_TAP_TARGET,
	type TapSlot,
} from "../../lib/gesture/tap-slot";
import { type SavedKind, useSavedStore } from "../../state/saved";
import { useSoundStore } from "../../state/sound";
import { redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { CORNER_DISC, CORNER_GAP, CardCorner } from "./CardCorner";
import { EXPLORE_TAP_TARGET, SAVE_TAP_TARGET } from "./ListingFace";

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
 * Armed into `tapSlot` by a touch on the progress bar. Handled by nobody: it
 * exists so the deck's tap gesture does not read a bar tap as a bare card tap.
 */
const SCRUB_TAP_TARGET = "scrub";
/** How far a finger may drift on a part before the touch is a slide, in points. */
const CHAPTER_TAP_SLOP = 8;
/**
 * Sideways travel past which a touch on the rail is a swipe of the deck, not a
 * tap. Under the deck pan's own 10pt: the rail has to know the touch is not
 * its own BEFORE the deck takes it, or the cancel that follows reads as a tap.
 */
const RAIL_SWIPE_SLOP = 6;
/**
 * Armed into `tapSlot` by a touch on a city card's rail of parts. The rail
 * seeks the film itself; the feed's only part is to un-pause — a jump into a
 * paused film would look like nothing happened.
 */
export const CHAPTER_TAP_TARGET = "chapter";
/**
 * Where that rail runs, down the card's right edge: from under the top-right
 * controls to above the name row.
 */
const RAIL_TOP = 58;
const RAIL_BOTTOM = 92;
/**
 * The place pill's right edge: clear of the corner discs and 8pt of air.
 * A card with fewer controls than its kind allows keeps the same edge, so the
 * pill does not change width from one card to the next.
 */
const placeRight = (discs: number) =>
	12 + discs * CORNER_DISC + (discs - 1) * CORNER_GAP + 8;
const PLACE_RIGHT = placeRight(3);
/** With the feed's fourth disc, the thumbs-down (phase414). */
const PLACE_RIGHT_WITH_HIDE = placeRight(4);
/**
 * Longest place name that still shows its distance. The pill has ~205pt on a
 * 361pt card; past ~22 characters of 10.5pt label the name and the distance
 * do not both fit, and the name is the one a buyer needs (owner pick "C",
 * phase394: drop the distance before cutting the name).
 *
 * That is the three-disc pill. The feed's fourth disc takes 44pt of it — about
 * eight characters — which left room for the distance beside only one name in
 * five (phase414 dropped it past 14 characters; owner, 2026-11-28: 「左上角的
 * 地址为啥没有距离了？加上」). A feed card therefore sets the distance UNDER
 * the name, always: every place says how far it is, and the name keeps the
 * whole line. A name past ~24 characters still ends in an ellipsis there.
 */
const PLACE_NAME_WITH_DISTANCE = 22;
/**
 * How far a long name may shrink to stay on one line: 27pt → 16pt, which
 * keeps "Sugarloaf Country Club" whole beside its disc and a pill on the
 * narrowest phone. Past that it is cut.
 */
const NAME_MIN_SCALE = 0.6;

interface CommunityFaceProps {
	card: CommunityCardV3;
	isTop: boolean;
	/** The feed screen is not in front (see `CardVideoProps.suspended`). */
	suspended?: boolean;
	/**
	 * Opens the place's Explore page. The NAME is the link (phase404.9; owner,
	 * 2026-11-26: 「把卡片左下角的title做成链接button 功能替换explore」) and the
	 * `Explore` pill is gone. It ends in a small white disc with a chevron
	 * (phase404.10): a thin `›` in the name's own ink did not read as
	 * something to press (「卡片左下角的链接有点不明显」), and white is what the
	 * card's other button is made of.
	 */
	onExplore?: () => void;
	/**
	 * The way into the place's own deck — a city's neighbourhoods, a
	 * neighbourhood's homes — as the one pill at the bottom right, where
	 * `Explore` was (same message: 「把新的communities或者homes 放到右下方」).
	 * Absent for a card with nothing one level down: the corner is then empty.
	 */
	deck?: { label: string; accessibilityLabel: string; onPress: () => void };
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
	/**
	 * The eyebrow over the name, and what a save is filed as. A CITY with a
	 * film wears this face too (phase329, owner: "你再看看community card, 要保持
	 * 一致") — the place label, the progress bar and the bottom row are this
	 * face's, and a second face kept drifting from it.
	 */
	tag?: string;
	saveKind?: SavedKind;
	/**
	 * Lines under the name — a home's specs, then its address and FMLS number
	 * (`lib/feed/home-film-card.ts`). A community and a city have none.
	 */
	lines?: readonly string[];
	/**
	 * Opens the share sheet (phase335). Absent for a card with no page to send
	 * someone to; the corner then shows no share cell.
	 */
	onShare?: () => void;
	/**
	 * The corner's thumbs-down (phase414): this card is not for the buyer. Only
	 * the feed's decks pass it.
	 */
	onHide?: () => void;
	/** The film passed `CardVideo`'s 82% mark — the buyer watched it through. */
	onWatched?: () => void;
}

export function CommunityFace({
	card,
	isTop,
	suspended,
	onExplore,
	deck,
	tapSlot,
	deckGesture,
	tag = "COMMUNITY",
	saveKind = "community",
	lines,
	onShare,
	onHide,
	onWatched,
}: CommunityFaceProps) {
	const saved = useSavedStore((s) => s.isSaved(card.id));
	const toggleSaved = useSavedStore((s) => s.toggle);
	const soundOn = useSoundStore((s) => s.soundOn);
	const toggleSound = useSoundStore((s) => s.toggle);

	/** 0..1 playback position, written by `CardVideo` off the UI thread. */
	const progress = useSharedValue(0);
	const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
	/** The same position, for a city card's rail: it runs top to bottom. */
	const railFill = useAnimatedStyle(() => ({
		height: `${progress.value * 100}%`,
	}));
	const segments = card.tourSegments ?? [];
	/**
	 * A city film is told in PARTS — five at most — and its card names them
	 * down a rail on its right edge instead of cutting a bar into a dash per
	 * shot (owner 2026-11-16: "可视化视频进度 模块化内容 可以让人自主选择"; on the right
	 * since phase360, the band across the foot having gone stale: "审美疲劳 放在
	 * 右边怎么样"). Everything else
	 * is cut by place, as it always was. The place LABEL follows `segments`
	 * either way.
	 */
	const chapters = card.tourChapters ?? [];
	const byChapter = chapters.length > 0;
	const bars = byChapter ? chapters : segments;

	/* ── Scrubbing ────────────────────────────────────────────────────────── */

	/**
	 * Measured length of the bar, so a touch can become a fraction: its width,
	 * or the HEIGHT of a city card's rail, which is dragged up and down.
	 */
	const barWidth = useSharedValue(0);
	/** True while a finger is down on the bar; `CardVideo` stops writing then. */
	const scrubbing = useSharedValue(false);
	/** 0..1 seek request for `CardVideo`; -1 = none. It disarms the channel. */
	const seekTo = useSharedValue(-1);
	/** Which dash the finger is over, or -1. Drives the floating label. */
	const scrubIndex = useSharedValue(-1);
	/** Where a touch on a city card's rail began, and whether it can still be a tap. */
	const railTouch = useSharedValue({ x: 0, y: 0, live: false });
	const [scrubbedName, setScrubbedName] = useState<string | null>(null);

	/**
	 * The dash boundaries as a plain number array.
	 *
	 * A worklet may only close over values Reanimated can serialise, and this is
	 * read on the UI thread on every move. Numbers, not the segment objects.
	 */
	const bounds = useMemo(() => bars.map((bar) => bar.endFraction), [bars]);
	/** The PLACE boundaries, for the top-left pill — the same array as `bounds`
	 *  unless the bar is cut by chapter. */
	const placeBounds = useMemo(
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
			runOnJS(setScrubbedName)(index < 0 ? null : (bars[index]?.name ?? null));
		},
		[bars],
	);

	/**
	 * Which place the film is ON — the top-left pill's content (phase174).
	 *
	 * Derived from `progress` rather than tracked separately, so the pill, the
	 * bar's fill and the video are the same one number and cannot disagree. It
	 * follows a SCRUB too, because a scrub writes `progress`: dragging the bar
	 * renames the pill under your finger, which is the honest answer to "where
	 * am I now".
	 *
	 * The comparison is on the derived INDEX, not on `progress`: the mapper runs
	 * on the UI thread at display rate, and only crossing into a new place has
	 * anything new to say to React. A 90-second film crosses ~20 times.
	 */
	// Stored WITH the card it belongs to, for the reason `measured` above is:
	// a face is reused across cards at the same deck index, so a bare number
	// would name the PREVIOUS community's place on this one until the next
	// frame moved it. Falling back to 0 is not a guess — a card that has not
	// played yet is showing its first clip.
	const [playing, setPlaying] = useState<{ id: string; index: number } | null>(
		null,
	);
	const placeIndex = playing?.id === card.id ? playing.index : 0;
	useAnimatedReaction(
		() => {
			const ratio = progress.value;
			for (let i = 0; i < placeBounds.length; i++) {
				if (ratio <= (placeBounds[i] ?? 1)) return i;
			}
			return placeBounds.length - 1;
		},
		(index, previous) => {
			if (index === previous) return;
			runOnJS(setPlaying)({ id: card.id, index });
		},
		[placeBounds, card.id],
	);
	const place = segments[placeIndex];

	/**
	 * Which part the film is in — the lit word on the rail. Same derivation as
	 * the place above, and stored with its card for the same reason.
	 */
	const [chapterAt, setChapterAt] = useState<{
		id: string;
		index: number;
	} | null>(null);
	useAnimatedReaction(
		() => {
			if (!byChapter) return -1;
			const ratio = progress.value;
			for (let i = 0; i < bounds.length; i++) {
				if (ratio <= (bounds[i] ?? 1)) return i;
			}
			return bounds.length - 1;
		},
		(index, previous) => {
			if (index === previous || index < 0) return;
			runOnJS(setChapterAt)({ id: card.id, index });
		},
		[bounds, byChapter, card.id],
	);
	const chapterIndex = chapterAt?.id === card.id ? chapterAt.index : 0;
	/**
	 * Where each part starts in the film (0..1), as plain numbers for the
	 * gesture's worklets — a hair INSIDE the part: exactly on the boundary still
	 * reads as the part before it, and the word that lights would be the wrong
	 * one.
	 */
	const partStarts = useMemo(
		() =>
			chapters.map((_, i) =>
				i === 0 ? 0 : Math.min((chapters[i - 1]?.endFraction ?? 0) + 0.002, 1),
			),
		[chapters],
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
		/** `at` is the touch along the bar: x, or y on a city card's rail. */
		const locate = (at: number) => {
			"worklet";
			const length = barWidth.value;
			if (length <= 0) return 0;
			return Math.min(Math.max(at / length, 0), 1);
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
		/**
		 * A touch on the rail lands on the first frame of the part under the
		 * finger: the rail is offering "watch Schools", and Schools from the
		 * middle of a sentence is not that. The rail is a timeline — each word
		 * sits beside its own stretch of the film — so the part under the finger
		 * is the part playing at that point.
		 */
		const snap = (x: number) => {
			"worklet";
			progress.value = partStarts[dashAt(locate(x))] ?? 0;
		};
		/**
		 * Hand the bar back to playback and ask the film to go where the finger
		 * left it.
		 *
		 * `scrubbing` doubles as the "this touch is still mine" latch, so the
		 * three callbacks below can all call this and only the first one lands.
		 * They are three because a TAP does not reliably reach `onFinalize`: a
		 * pan that never travels far enough to activate is failed by the deck's
		 * gesture winning the touch, and the release we were waiting for goes to
		 * the winner. That left `scrubbing` stuck true (the bar frozen and the
		 * place label stuck on screen) and no seek requested at all — the owner's
		 * 2026-08-23 report, "if you drag it will move, if you click, it will
		 * not". `onTouchesUp` is the raw pointer lift and arrives whatever the
		 * gesture's own state machine decides.
		 */
		const commit = () => {
			"worklet";
			if (!scrubbing.value) return;
			seekTo.value = progress.value;
			scrubbing.value = false;
			scrubIndex.value = -1;
		};
		/*
		 * The RAIL runs up and down and the deck pages sideways, so the two do
		 * not have to contend — and since phase414 they must not: the rail is a
		 * 112pt column down the card's right side, which is where a swipe to the
		 * next card starts, and while its pan claimed every touch that landed on
		 * it and blocked the deck's, those swipes went nowhere (owner,
		 * 2026-11-28: 「在右侧经常影响滑动」).
		 *
		 * It claims only an up-and-down drag now, gives up the moment a touch
		 * travels sideways, and blocks nothing. A tap still starts the part under
		 * the finger, but when the touch ENDS: seeking on touch-down, as the bar
		 * below does, would move the film under every swipe that began here.
		 */
		if (byChapter) {
			/**
			 * The touch is over. Lifted — or let go of by the gesture system, which
			 * is how a still tap usually ends here: the deck's own tap wins it —
			 * without a drag and without going sideways, it was a tap, and the part
			 * under the finger starts. All three endings call this; the first lands.
			 */
			const finish = () => {
				"worklet";
				if (!scrubbing.value && railTouch.value.live) {
					scrubbing.value = true;
					snap(railTouch.value.y);
				}
				railTouch.value = { x: 0, y: 0, live: false };
				commit();
			};
			return Gesture.Pan()
				.enabled(isTop && !!card.videoUrl)
				.activeOffsetY([-CHAPTER_TAP_SLOP, CHAPTER_TAP_SLOP])
				.failOffsetX([-RAIL_SWIPE_SLOP, RAIL_SWIPE_SLOP])
				.onBegin((e) => {
					// A still tap here also reaches the deck as a card tap, which
					// would pause the film it just sought: arm the target that only
					// makes it play.
					if (tapSlot) tapSlot.value = { target: CHAPTER_TAP_TARGET };
					railTouch.value = { x: e.x, y: e.y, live: true };
				})
				.onTouchesMove((e) => {
					const touch = e.allTouches[0];
					const began = railTouch.value;
					if (
						touch &&
						began.live &&
						Math.abs(touch.x - began.x) > RAIL_SWIPE_SLOP
					) {
						railTouch.value = { x: began.x, y: began.y, live: false };
					}
				})
				.onStart((e) => {
					scrubbing.value = true;
					track(e.y);
				})
				.onUpdate((e) => {
					track(e.y);
				})
				.onTouchesUp(finish)
				.onTouchesCancelled(finish)
				.onFinalize(finish);
		}
		let gesture = Gesture.Pan()
			.enabled(isTop && !!card.videoUrl)
			// A scrub starts where the finger lands, so the bar jumps under it on
			// touch-down rather than waiting for movement.
			.minDistance(0)
			.onBegin((e) => {
				// The deck's tap gesture runs alongside this pan (only the deck's
				// PAN is blocked below), so a still tap on the bar would also
				// dispatch as a bare card tap and pause the film it just sought.
				// Arm a target the feed does not handle — or, on a city card's
				// rail, one that only makes it play.
				if (tapSlot) {
					tapSlot.value = { target: SCRUB_TAP_TARGET };
				}
				scrubbing.value = true;
				track(e.x);
				// Seek from touch-DOWN, not only from the release. This is the one
				// callback a tap is guaranteed to reach — it is what draws the fill
				// and names the place, both of which the owner sees on a tap that
				// moves nothing. A drag seeks again on release; two tolerant seeks
				// a few hundred ms apart cost nothing, and jumping the film to
				// where the finger pressed is what the bar is promising anyway.
				seekTo.value = progress.value;
			})
			.onUpdate((e) => {
				track(e.x);
			})
			// The pointer lift, ahead of any gesture-state decision.
			.onTouchesUp(commit)
			// A pointer that stops being tracked for any other reason.
			.onTouchesCancelled(commit)
			// And the backstop, for a gesture cancelled without a touch event:
			// `onFinalize`, not `onEnd`, so a cancel releases the bar too.
			.onFinalize(commit);
		if (deckGesture) gesture = gesture.blocksExternalGesture(deckGesture);
		return gesture;
	}, [
		bounds,
		byChapter,
		partStarts,
		isTop,
		card.videoUrl,
		deckGesture,
		tapSlot,
		barWidth,
		progress,
		scrubbing,
		seekTo,
		scrubIndex,
		railTouch,
	]);

	const onBarLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout;
		barWidth.value = byChapter ? height : width;
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
					suspended={suspended}
					progress={progress}
					scrubbing={scrubbing}
					seekTo={seekTo}
					onNearEnd={() => {
						setNearEnd(true);
						onWatched?.();
					}}
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

			{/* Top-LEFT: the place the film is on, in the COMMUNITY badge's old
			    slot and its exact shape (phase174). The render worker used to
			    burn this into the video; drawing it here is what lets it line up
			    with the card instead of with the video's crop.

			    Only when the film HAS structure. A community with no tour, or a
			    tour whose clip list could not be read, shows nothing — an empty
			    corner, not a placeholder. */}
			{place && !!place.name && (
				<View
					style={[
						styles.badgeSlot,
						!!onHide && { right: PLACE_RIGHT_WITH_HIDE },
					]}
				>
					{onHide && !!place.distance ? (
						// Four discs beside it: the distance under the name.
						<View style={[styles.placePill, styles.placePillStacked]}>
							<View style={styles.placePinStacked}>
								<PinIcon />
							</View>
							<View style={styles.placeLines}>
								<Text style={styles.placeName} numberOfLines={1}>
									{place.name}
								</Text>
								<Text style={styles.placeDistance} numberOfLines={1}>
									{place.distance}
								</Text>
							</View>
						</View>
					) : (
						<View style={styles.placePill}>
							<PinIcon />
							<Text style={styles.placeName} numberOfLines={1}>
								{place.name}
							</Text>
							{!!place.distance &&
								place.name.length <= PLACE_NAME_WITH_DISTANCE && (
									<>
										<View style={styles.placeRule} />
										<Text style={styles.placeDistance}>{place.distance}</Text>
									</>
								)}
						</View>
					)}
				</View>
			)}

			{/* Top-RIGHT: mute, save and share, three discs in one row
			    (phase394, owner pick "C" off `/demos/card-actions-v1`), and in
			    the feed a fourth, the thumbs-down (phase414). The heart is the
			    last of them since phase415. A community with no film passes no
			    `sound`. */}
			<CardCorner
				{...(card.videoUrl
					? {
							sound: {
								on: soundOn,
								onPress: toggleSound,
								...(tapSlot ? { onTouchStart: arm(SOUND_TAP_TARGET) } : {}),
							},
						}
					: {})}
				save={{
					saved,
					onPress: () => toggleSaved(card.id, saveKind),
					...(tapSlot ? { onTouchStart: arm(SAVE_TAP_TARGET) } : {}),
				}}
				{...(onShare
					? {
							share: {
								onPress: onShare,
								...(tapSlot ? { onTouchStart: arm(SHARE_TAP_TARGET) } : {}),
							},
						}
					: {})}
				{...(onHide
					? {
							hide: {
								onPress: onHide,
								...(tapSlot ? { onTouchStart: arm(HIDE_TAP_TARGET) } : {}),
							},
						}
					: {})}
			/>

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

			{/* Bottom info — ONE line: the community name and, on its right, the
			    pill into the place's own deck, on a shared centre line (owner
			    2026-08-22: "community and explore should be aligned" — said of
			    `Explore`, whose place the pill took in phase404.9; the name is
			    the link to the Explore page now). The signal glyphs that sat
			    beside the name are gone (owner 2026-11-21).

			    The name is the only thing that gives when space runs out —
			    `flexShrink: 0` on the link, `minWidth: 0` on the name. It gives
			    by WRAPPING to a second line (owner 2026-08-22: no truncation).

			    ABOVE that row sits the COMMUNITY tag (owner 2026-09-05: "put
			    community label on top of the community name"). It came down from
			    the top-left corner, which the place pill now owns. As an eyebrow
			    it takes no width from the row, so the name keeps all of it. */}
			<View style={styles.info}>
				<View style={styles.tagRow}>
					<Text style={styles.badgeLabel}>{tag}</Text>
				</View>
				<View style={styles.infoRow}>
					<View style={styles.infoLeft}>
						{/* ONE line, and a long name gives up size before letters
					    (phase404.12; owner, 2026-11-27, on "Sugarloaf Country /
					    Club": 「名字太长两行不好看 控制在一行」). It wrapped to two
					    lines from 2026-08-22, when a name that did not fit was cut
					    — "Hidden Lakes at Sug…" — and his rule since 2026-09-07 is
					    the one applied here: 「Don't cut the community name if it is
					    too long, use smaller size instead」. */}
						{onExplore ? (
							<Pressable
								onTouchStart={arm(EXPLORE_TAP_TARGET)}
								onPress={tapSlot ? undefined : onExplore}
								accessibilityRole="link"
								accessibilityLabel={`Explore ${card.name}`}
								hitSlop={12}
								style={({ pressed }) => [
									styles.nameLink,
									pressed && styles.ctaPressed,
								]}
							>
								<Text
									style={styles.name}
									numberOfLines={1}
									adjustsFontSizeToFit
									minimumFontScale={NAME_MIN_SCALE}
								>
									{card.name}
								</Text>
								{/* With no pill beside it, this is what breathes at 82%. */}
								<Animated.View style={[styles.nameDisc, !deck && breathing]}>
									<View style={styles.nameDiscArm} />
								</Animated.View>
							</Pressable>
						) : (
							<Text
								style={styles.name}
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={NAME_MIN_SCALE}
							>
								{card.name}
							</Text>
						)}
					</View>
					{!!deck && (
						<Animated.View style={[styles.ctaRow, breathing]}>
							<Pressable
								onTouchStart={arm(DECK_TAP_TARGET)}
								onPress={tapSlot ? undefined : deck.onPress}
								accessibilityRole="link"
								accessibilityLabel={deck.accessibilityLabel}
								hitSlop={12}
								style={({ pressed }) => [
									styles.ctaLink,
									styles.ctaPill,
									pressed && styles.ctaPressed,
								]}
							>
								<Text
									style={[styles.ctaLabel, styles.ctaPillLabel]}
									numberOfLines={1}
								>
									{deck.label} ›
								</Text>
							</Pressable>
						</Animated.View>
					)}
				</View>
				{lines?.map((line, i) => (
					<Text
						key={line}
						style={i === 0 ? styles.line : styles.lineQuiet}
						numberOfLines={1}
					>
						{line}
					</Text>
				))}
			</View>

			{/* Tour progress — one dash per PLACE when the film's structure came
			    down with it, one continuous bar when it did not, and draggable
			    either way. Only for a card that actually plays something. */}
			{/* A city film's parts: a rail down the card's right edge, and a
			    timeline read top to bottom. The line is the film's progress, a
			    dot marks where one part hands over to the next, and each part's
			    name sits level beside its own stretch (the owner's pick of
			    `/demos/city-card-right-rail-v1/`, 2026-11-20). The playing word
			    is lit; nothing moves inside a word. A touch on a word starts
			    that part; a drag along the rail scrubs — up and down, which the
			    deck's sideways swipe does not contend for.

			    The planner keeps every section to 15% of the film
			    (`MIN_SECTION_SHARE`), which is about 56pt of this rail: room for
			    a word's line and a gap either side. */}
			{!!card.videoUrl && byChapter && (
				<>
					<LinearGradient
						colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0.22)", "transparent"]}
						locations={[0, 0.2, 0.38]}
						start={{ x: 1, y: 0 }}
						end={{ x: 0, y: 0 }}
						style={styles.scrim}
						pointerEvents="none"
					/>
					<GestureDetector gesture={scrub}>
						<View style={styles.rail} onLayout={onBarLayout}>
							{chapters.map((c, i) => (
								<View
									key={`${c.name}-${c.endFraction}`}
									style={[
										styles.railCell,
										{
											flexGrow:
												c.endFraction - (chapters[i - 1]?.endFraction ?? 0),
										},
									]}
								>
									<Text
										style={[
											styles.railWord,
											i === chapterIndex && styles.railWordOn,
										]}
										numberOfLines={1}
									>
										{c.name}
									</Text>
								</View>
							))}
							<View style={styles.railTrack}>
								<Animated.View style={[styles.railFill, railFill]} />
							</View>
							{chapters.slice(0, -1).map((c) => (
								<RailDot
									key={`dot-${c.endFraction}`}
									progress={progress}
									at={c.endFraction}
								/>
							))}
						</View>
					</GestureDetector>
				</>
			)}
			{!!card.videoUrl && !byChapter && (
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
							{bars.length > 0 ? (
								bars.map((bar, i) => (
									<ProgressDash
										key={`${bar.name}-${bar.endFraction}`}
										progress={progress}
										start={i === 0 ? 0 : (bars[i - 1]?.endFraction ?? 0)}
										end={bar.endFraction}
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
 * A dot on the rail's progress line, where one part of a city film hands over
 * to the next. White once the film has passed it. Its own component for the
 * reason `ProgressDash` is: one `useAnimatedStyle` each.
 */
function RailDot({
	progress,
	at,
}: {
	progress: SharedValue<number>;
	at: number;
}) {
	const style = useAnimatedStyle(() => ({
		backgroundColor: progress.value >= at ? "#FFFFFF" : "#8E918E",
	}));
	return (
		<View
			style={[styles.railDotRing, { top: `${at * 100}%` }]}
			pointerEvents="none"
		>
			<Animated.View style={[styles.railDot, style]} />
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

/** Line weight of the outline art (the bookmark). */
const OUTLINE_STROKE = 1.75;
/**
 * The map pin in the place pill.
 *
 * The burned-in label drew Phosphor's `map-pin-fill` from `brand/icons`, and
 * the app CAN reach that font — `RedlineIcon` renders it. But its 14-glyph
 * subset (`redline/icon-font.ts`) carries no pin, so this is composed from two
 * `View`s at Lucide's geometry, the technique the arrow and the bookmark
 * already use: a ring for the head (x 4..20, y 2..18) and a rotated square for
 * the point that hangs below it. Filled, not outlined — at 11pt an outlined
 * pin's hole closes up into a dot.
 */
const PIN_SIZE = 11;
const PIN_HEAD = PIN_SIZE * 0.82;
/** The tail: a square rotated 45°, half-buried in the head. */
const PIN_TAIL = PIN_SIZE * 0.44;
/** White, on the place pill's dark glass. */
const PIN_INK = redline.onPhoto;

function PinIcon() {
	return (
		<View style={styles.pinBox}>
			<View style={styles.pinTail} />
			<View style={styles.pinHead} />
			<View style={styles.pinHole} />
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
	/**
	 * Top-left. It held the COMMUNITY badge until phase174 and now holds the
	 * PLACE the film is on — same corner, same inset, so nothing about the
	 * card's frame moved when the content did.
	 *
	 * `right` bounds it: place names run long ("Publix Super Market at The
	 * Village at Flynn Crossing" is 54 characters) and the pill has to stop
	 * before the top-right capsule rather than slide under it. 68 = the
	 * capsule's 12 inset + its ~74 width at two cells, halved to leave the pill
	 * the majority of the card and a real gap.
	 */
	badgeSlot: {
		position: "absolute",
		top: 12,
		left: 12,
		right: PLACE_RIGHT,
		zIndex: 2,
	},
	/**
	 * The place pill — the COMMUNITY badge's fill, radius and padding, because
	 * it is the same object in the same slot with different words in it.
	 *
	 * `alignSelf: flex-start` keeps it hugging its text inside the bounded slot;
	 * without it the pill would stretch to `right: 68` on every short name.
	 */
	placePill: {
		alignSelf: "flex-start",
		maxWidth: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		backgroundColor: redline.photoPill,
		borderRadius: redlineRadii.badge,
		paddingVertical: 7,
		paddingHorizontal: 10,
		overflow: "hidden",
	},
	/**
	 * The name. `flexShrink: 1` + `minWidth: 0` so a long one ellipsizes INSIDE
	 * the pill rather than pushing the distance out of it — unlike the community
	 * name below, this string changes every few seconds and the distance beside
	 * it is the half a buyer cannot infer.
	 */
	placeName: {
		...redlineText.listingCard.tag,
		color: redline.onPhoto,
		flexShrink: 1,
		minWidth: 0,
	},
	/** The two-line pill: the pin stays with the name, and the corners are a
	 *  rounded box's rather than a capsule's. */
	placePillStacked: {
		alignItems: "flex-start",
		paddingVertical: 6,
		borderRadius: 12,
	},
	placePinStacked: { paddingTop: 1 },
	placeLines: { flexShrink: 1, minWidth: 0, gap: 1 },
	/** Hairline between the place and its distance — the burned pill's rule. */
	placeRule: {
		width: 1,
		height: 12,
		backgroundColor: "rgba(255,255,255,0.35)",
	},
	/** The distance, one step quieter than the name it qualifies. */
	placeDistance: {
		...redlineText.listingCard.tag,
		fontWeight: "400",
		color: redline.onPhotoDim,
	},
	/** Plain capitals on the scrim — a label, so it wears no pill. */
	badgeLabel: {
		...redlineText.listingCard.badge,
		color: redline.onPhotoDim,
	},
	/**
	 * Bottom scrim — `overflow: hidden` on `face` clips it to the card's
	 * rounded corner. Same as the CITY card's.
	 */
	scrim: {
		...StyleSheet.absoluteFill,
		zIndex: 1,
	},
	/**
	 * The bottom block: the COMMUNITY eyebrow, then the name row. A COLUMN
	 * since phase174 — it was the name row itself until the tag moved in above
	 * it.
	 */
	info: {
		position: "absolute",
		left: 24,
		right: 24,
		bottom: 24,
		zIndex: 2,
	},
	/**
	 * The COMMUNITY tag, above the name (owner 2026-09-05). Plain capitals
	 * since phase367.2: up here it is a label on the card's own information,
	 * and the serif name directly under it is what the eye should land on
	 * first. It was a white pill, one size down from the badge it replaced.
	 */
	tagRow: {
		alignSelf: "flex-start",
		marginBottom: 6,
	},
	/**
	 * The rail of parts — down the card's right edge, between the top-right
	 * capsule and the name row. Its cells stack top to bottom, each as tall as
	 * its part's share of the film (`flexGrow`, inline). Wide enough for the
	 * longest word and the line; the whole of it takes the touch.
	 */
	rail: {
		position: "absolute",
		right: 0,
		top: RAIL_TOP,
		bottom: RAIL_BOTTOM,
		width: 112,
		zIndex: 3,
	},
	/** The film's progress: a 2pt line, 15pt in from the card's edge. */
	railTrack: {
		position: "absolute",
		right: 15,
		top: 0,
		bottom: 0,
		width: 2,
		borderRadius: 1,
		backgroundColor: "rgba(255,255,255,0.26)",
	},
	railFill: { width: 2, borderRadius: 1, backgroundColor: "#FFFFFF" },
	/** A part's cell: its word level with the middle of its stretch. */
	railCell: {
		flexBasis: 0,
		minHeight: 0,
		alignItems: "flex-end",
		justifyContent: "center",
		paddingRight: 28,
		paddingLeft: 8,
	},
	/**
	 * The dot's dark ring, centred on the line: 10pt across, so its centre is
	 * 5pt above `top` and on the line's own centre (15 + 1 from the edge).
	 */
	railDotRing: {
		position: "absolute",
		right: 11,
		marginTop: -5,
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: "rgba(18,20,18,0.45)",
		alignItems: "center",
		justifyContent: "center",
	},
	railDot: { width: 6, height: 6, borderRadius: 3 },
	/** On the photograph, not on a veil — hence the shadow. */
	railWord: {
		...redlineText.listingCard.address,
		fontWeight: "500",
		color: "rgba(255,255,255,0.66)",
		textShadowColor: "rgba(0,0,0,0.55)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
	},
	railWordOn: { color: "#FFFFFF", fontWeight: "700" },
	/** The name + Explore line — what `info` used to be. */
	infoRow: {
		flexDirection: "row",
		// `center`, not `flex-end`: this is what puts the name and the link on
		// one line rather than on a shared bottom edge (owner: "community and
		// explore should be aligned").
		alignItems: "center",
		gap: 12,
	},
	/** The name's column: it takes what `Explore` leaves and wraps inside it. */
	infoLeft: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
	},
	/**
	 * Community name — serif 27/600 white, the CITY name's family. Up from 24
	 * (owner 2026-08-22: "community name size can be bigger"); it is the card's
	 * headline and it no longer shares its line with a pill row.
	 */
	name: {
		// `redlineText.place`'s face without its line height: iOS sets
		// auto-shrunk text against a fixed one, and a shrunk name would sit low
		// beside its disc and the pill.
		fontFamily: redlineText.place.fontFamily,
		letterSpacing: redlineText.place.letterSpacing,
		fontSize: 27,
		fontWeight: "600",
		color: "#FFFFFF",
		flexShrink: 1,
		minWidth: 0,
	},
	/**
	 * The name as a link: the name, then its disc, on the name's one line.
	 */
	nameLink: {
		flexShrink: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	/** The pill's white, as a 26pt disc. */
	nameDisc: {
		width: 26,
		height: 26,
		borderRadius: 13,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.92)",
	},
	/** A chevron from two borders, pointing right; nudged to sit centred. */
	nameDiscArm: {
		width: 7,
		height: 7,
		marginRight: 2,
		borderTopWidth: 2,
		borderRightWidth: 2,
		borderColor: "#181B18",
		transform: [{ rotate: "45deg" }],
	},
	/** A home's lines under its price: the specs, then the quieter address. */
	line: {
		marginTop: 5,
		fontSize: 14,
		fontWeight: "500",
		color: "rgba(255,255,255,0.92)",
	},
	lineQuiet: {
		marginTop: 3,
		fontSize: 12,
		fontWeight: "400",
		color: "rgba(255,255,255,0.7)",
	},
	/**
	 * The pill at the right of the info row (Explore until phase404.9, the
	 * place's deck since), sized by its own content and
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
	/**
	 * The deck pill (Explore until phase404.9): a solid pill, the one white thing at the foot. City cards had it
	 * since phase352; community cards too since phase366 (owner 2026-11-21:
	 * "explore button和city card保持一致").
	 */
	ctaPill: {
		height: 34,
		minHeight: 34,
		paddingHorizontal: 14,
		borderRadius: 17,
		backgroundColor: "rgba(255,255,255,0.92)",
	},
	ctaPillLabel: { fontSize: 13.5, fontWeight: "600", color: "#181B18" },
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

	// ─── Pin art (see `PinIcon`) ──────────────────────────────────────────
	pinBox: { width: PIN_SIZE, height: PIN_SIZE },
	pinHead: {
		position: "absolute",
		left: (PIN_SIZE - PIN_HEAD) / 2,
		top: 0,
		width: PIN_HEAD,
		height: PIN_HEAD,
		borderRadius: PIN_HEAD / 2,
		backgroundColor: PIN_INK,
	},
	/** Rotated square under the head; the head is drawn over its top half. */
	pinTail: {
		position: "absolute",
		left: (PIN_SIZE - PIN_TAIL) / 2,
		top: PIN_SIZE - PIN_TAIL,
		width: PIN_TAIL,
		height: PIN_TAIL,
		backgroundColor: PIN_INK,
		transform: [{ rotate: "45deg" }],
	},
	/** The hole. Opaque ink, not transparent: the pill behind it is glass. */
	pinHole: {
		position: "absolute",
		left: (PIN_SIZE - PIN_HEAD * 0.36) / 2,
		top: (PIN_HEAD - PIN_HEAD * 0.36) / 2,
		width: PIN_HEAD * 0.36,
		height: PIN_HEAD * 0.36,
		borderRadius: (PIN_HEAD * 0.36) / 2,
		backgroundColor: redline.ink,
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
