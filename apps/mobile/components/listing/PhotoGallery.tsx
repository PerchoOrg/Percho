/**
 * PhotoGallery — Explore's full-photo browser with per-photo captions.
 *
 * The other half of the 2026-08-01 immersion change: the tour video lost its
 * burned-in caption band and the swipe card lost its photo-count pill, so the
 * words and the count both land HERE, behind "Explore Home →", where the buyer
 * opted in to reading. Owner: 「点击explore可以浏览所有照片 包括视频里没有的
 * 这时候再配上字幕详细解读」.
 *
 * ── Why a horizontal pager and not a grid ───────────────────────────────────
 *
 * A grid shows more photos per screen but has nowhere to put a sentence. The ask
 * is explicitly 详细解读 — a caption the buyer reads — which needs one photo at a
 * time and room underneath it. This is the same one-thing-per-screen posture the
 * feed uses.
 *
 * ── Gesture: native `pagingEnabled`, never a JS drag ────────────────────────
 *
 * `ScrollView horizontal pagingEnabled` hands the gesture to the platform, so
 * momentum, rubber-band at the ends, and mid-flick interruption are the real
 * thing. A hand-rolled `PanResponder` + `Animated.spring` reads as "an animation
 * of a swipe" — that exact substitution was shipped and rejected on the web
 * carousel ("太突兀") before being replaced with native scrolling. Do not
 * reintroduce a pan handler on this scroller.
 *
 * Two consequences of that choice, both deliberate:
 *
 *   · **`onScroll` is throttled to 16ms and only sets a local index.** During a
 *     flick the only state that changes is `index`, which is read by the counter
 *     and the caption band — siblings of the scroller, not children — so React
 *     never invalidates the images mid-gesture. Binding image mounting to a
 *     per-frame state is what makes native scrolling stutter.
 *   · **Every `Image` is mounted, but only a window is given a high-priority
 *     decode.** RN's `Image` handles its own decode off the JS thread; the
 *     `priority` hint keeps a 40-photo listing from queueing 40 full-size
 *     decodes on open.
 */
import { useCallback, useRef, useState } from "react";
import {
	Image,
	type LayoutChangeEvent,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	type GallerySlide,
	captionedCount,
	slideCounter,
} from "../../lib/listing/gallery";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/**
 * How many slides either side of the current one get an eager decode. ±2 rather
 * than ±1 because a hard flick can carry two slides before the finger lifts, and
 * landing on an undecoded photo shows the placeholder for a beat.
 */
const DECODE_WINDOW = 2;

interface PhotoGalleryProps {
	slides: readonly GallerySlide[];
	/** Closes the gallery. The gallery is an overlay, so this is not a route pop. */
	onClose: () => void;
	/**
	 * Fires once per slide the buyer actually reaches, with the slide's id.
	 * Optional: the caller owns telemetry, and a gallery that works without an
	 * analytics wire is easier to reuse.
	 */
	onView?: (slideId: string, index: number) => void;
}

export function PhotoGallery({ slides, onClose, onView }: PhotoGalleryProps) {
	const insets = useSafeAreaInsets();
	const [index, setIndex] = useState(0);
	/**
	 * Measured, not assumed. `Dimensions.get("window")` is wrong inside an
	 * overlay that respects insets, and a page width that disagrees with the
	 * scroller's real width by even a point makes `pagingEnabled` drift on a long
	 * gallery.
	 */
	const [pageWidth, setPageWidth] = useState(0);
	const viewed = useRef<Set<string>>(new Set());

	const onLayout = useCallback((e: LayoutChangeEvent) => {
		setPageWidth(e.nativeEvent.layout.width);
	}, []);

	const onScroll = useCallback(
		(e: NativeSyntheticEvent<NativeScrollEvent>) => {
			if (pageWidth <= 0) return;
			const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
			const clamped = Math.max(0, Math.min(slides.length - 1, next));
			if (clamped === index) return;
			setIndex(clamped);
			const slide = slides[clamped];
			// Guarded by a Set so a back-and-forth flick over slide 3 reports one
			// view — a dwell/impression count needs that, and the caller cannot
			// dedupe what it never saw twice.
			if (slide && onView && !viewed.current.has(slide.id)) {
				viewed.current.add(slide.id);
				onView(slide.id, clamped);
			}
		},
		[index, pageWidth, slides, onView],
	);

	const current = slides[index];
	const withCaptions = captionedCount(slides);

	return (
		<View style={styles.screen}>
			{/* Row 1: close (left) + counter (right). Mirrors the listing hero's own
			    top row rather than inventing a second header geometry. */}
			<View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
				<Pressable
					onPress={onClose}
					hitSlop={12}
					accessibilityRole="button"
					accessibilityLabel="Close photos"
					style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
				>
					<Text style={styles.closeLabel}>✕</Text>
				</Pressable>
				<View style={styles.counterPill}>
					<Text style={styles.counterLabel}>
						{slideCounter(index, slides.length)}
					</Text>
				</View>
			</View>

			<ScrollView
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onLayout={onLayout}
				onScroll={onScroll}
				// 16ms ≈ one frame. Enough for the counter to track the finger,
				// and the handler only compares two integers.
				scrollEventThrottle={16}
				style={styles.pager}
			>
				{slides.map((slide, i) => (
					<View
						key={slide.id}
						style={[styles.page, pageWidth > 0 && { width: pageWidth }]}
					>
						{/*
						 * The PAGE always exists — `pagingEnabled` measures its stops from
						 * the children's widths, so skipping a page would collapse the
						 * scroll extent and send later slides to the wrong offset. Only the
						 * `Image` is windowed, which is where the cost is: a 40-photo
						 * listing would otherwise queue 40 full-size decodes on open.
						 */}
						{Math.abs(i - index) <= DECODE_WINDOW && (
							<Image
								source={{ uri: slide.url }}
								style={styles.photo}
								// `contain`, not `cover`: this is the archive view. Cropping a
								// floorplan or a wide exterior to fill the box is exactly what
								// the buyer came here to escape from the 1:1 card.
								resizeMode="contain"
								accessible
								accessibilityLabel={slide.caption ?? "Listing photo"}
							/>
						)}
					</View>
				))}
			</ScrollView>

			{/*
			 * The caption band. Rendered only when THIS photo has one — an untagged
			 * photo gets clean pixels rather than a band with a placeholder in it.
			 * This is the 详细解读 slot: `numberOfLines` is 4, not 1, because the
			 * whole point of moving the copy off the video is that it no longer has
			 * to fit a passing 1.7s clip.
			 */}
			{!!current?.caption && (
				<View style={[styles.band, { paddingBottom: insets.bottom + 20 }]}>
					{!!current.kicker && (
						<Text style={styles.kicker}>{current.kicker}</Text>
					)}
					<Text style={styles.caption} numberOfLines={4}>
						{current.caption}
					</Text>
				</View>
			)}

			{/*
			 * Said once, at the bottom, only when there is something to say: on a
			 * listing whose photos are untagged, `withCaptions` is 0 and promising
			 * "tap through for details" would be advertising absent data.
			 */}
			{withCaptions > 0 && !current?.caption && (
				<View style={[styles.band, { paddingBottom: insets.bottom + 20 }]}>
					<Text style={styles.hint}>
						{`Swipe — ${withCaptions} of these photos have notes.`}
					</Text>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	/**
	 * Near-black, not `colors.bg`. A photo archive is the one surface in this app
	 * that should NOT be warm paper: paper around a photograph tints it, and the
	 * buyer is here to judge the house's colour, not ours.
	 */
	screen: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: colors.photoVoid,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingBottom: 8,
		zIndex: 2,
	},
	closeBtn: {
		width: 36,
		height: 36,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.glass,
	},
	closeLabel: { ...textStyles.headline, color: colors.ink },
	pressed: { opacity: 0.75 },
	counterPill: {
		height: 30,
		justifyContent: "center",
		paddingHorizontal: 12,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	/** `tabular-nums` so "9 / 22" → "10 / 22" doesn't shift the pill's width. */
	counterLabel: {
		...textStyles.footnote,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	pager: { flex: 1 },
	page: { flex: 1, alignItems: "center", justifyContent: "center" },
	photo: { width: "100%", height: "100%" },
	band: {
		paddingHorizontal: 20,
		paddingTop: 14,
		paddingBottom: 28,
		gap: 6,
	},
	kicker: { ...textStyles.caption, color: colors.onCardDim },
	/**
	 * Serif, at reading size. §0.4 reserves the display face for copy "worth
	 * reading slowly", and a caption the buyer stopped a swipe to read is the
	 * definition of that — the same reasoning that puts the tour's WHY block in
	 * `serifBody`.
	 */
	caption: { ...textStyles.serifBody, color: colors.onCard },
	hint: { ...textStyles.footnote, color: colors.onCardDim },
});
