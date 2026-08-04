/**
 * TourStop (§2.3) — one stop of the guided tour.
 *
 * Layout is the spec's, top to bottom: "STOP N OF M" + ✕, a segmented progress
 * bar, a 220pt media area with the hotspot pin, the WHY block in serif 17.5, the
 * action rows, then Prev / Next.
 *
 * The WHY block is the reason the tour exists, so it is unconditional here: a
 * stop that reached this component already passed `isValidStop`, which requires
 * non-empty evidence with a positive count. There is no "no evidence" branch to
 * render, by design — see `lib/listing/tour.ts`.
 *
 * §2.3 #5: the horizontal swipe is an ACCELERATOR, not the only way through.
 * Prev/Next are always mounted. (Task-1 learned this the hard way on the
 * challenge card: overloading one gesture with two meanings read as a
 * malfunction round after round.)
 *
 * The accelerator reuses the §0.5 gesture contract — `decideSwipe`, the same
 * 35%-of-width / 800pt/s / ±30°-sector judgement the feed uses — so a swipe that
 * advances a card and a swipe that advances a stop feel identical in the hand.
 * It is scoped with `activeOffsetX` and `failOffsetY` so a vertical drag stays
 * the ScrollView's: this page scrolls, and stealing that would break the WHY
 * block on a small screen.
 */
import { useCallback, useMemo, useRef } from "react";
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { decideSwipe } from "../../lib/gesture/decide-swipe";
import type { ActionKind } from "../../lib/listing/hotspot";
import { emojiForRoom } from "../../lib/listing/hotspot";
import type { Stop } from "../../lib/listing/tour";
import { isLastStop, stopLabel } from "../../lib/listing/tour";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const MEDIA_HEIGHT = 220;

/**
 * Horizontal travel before the pan takes over from the scroll view, and the
 * vertical travel that hands it back. Deliberately asymmetric: a buyer reading
 * the WHY block scrolls far more often than they swipe, so vertical wins ties.
 */
const PAN_ACTIVATE_X = 14;
const PAN_FAIL_Y = 12;

interface TourStopProps {
	stop: Stop;
	index: number;
	/**
	 * Every stop's id, in order. Passed instead of a bare count so the progress
	 * segments have STABLE keys — `key={index}` is the exact class of bug that
	 * cost task-1 several rounds on device (React reuses or omits a subtree and it
	 * presents as a flashing or stuck element).
	 */
	stopIds: readonly string[];
	onPrev: () => void;
	onNext: () => void;
	/** ✕ — §2.3 #1: leaves to free explore, recording `tour_abandoned`. */
	onExit: () => void;
	onAction: (kind: ActionKind) => void;
}

const ACTION_EMOJI: Record<ActionKind, string> = {
	why: "💡",
	compare: "⚖️",
	renovate: "🔨",
	save: "♡",
	ask_ai: "✨",
};

export function TourStop({
	stop,
	index,
	stopIds,
	onPrev,
	onNext,
	onExit,
	onAction,
}: TourStopProps) {
	const total = stopIds.length;
	const last = isLastStop(index, total);
	const { hotspot } = stop;
	const { width } = useWindowDimensions();

	/**
	 * Ref trampolines for the two callbacks the gesture calls.
	 *
	 * A caller passes inline arrows here (`onNext={() => …}`), so their identity
	 * changes every render. Putting them in the gesture's dependency list would
	 * rebuild a live `Gesture.Pan` mid-touch — which DROPS the in-flight touch, so
	 * `onEnd` never fires and the interaction sticks. Task-1 lost rounds to
	 * exactly this on the feed; the rule is in `lib/gesture/memo-identity.test.ts`.
	 * The refs are written on every render and the gesture depends only on `width`.
	 */
	const nextRef = useRef(onNext);
	const prevRef = useRef(onPrev);
	nextRef.current = onNext;
	prevRef.current = onPrev;

	// `useCallback` with an empty dep list, matching `use-swipe-card.ts`'s
	// `settle`: these two are STABLE for the component's whole life, so naming
	// them in the memo below satisfies the exhaustive-deps rule without ever
	// actually invalidating the gesture.
	const goNext = useCallback(() => nextRef.current(), []);
	const goPrev = useCallback(() => prevRef.current(), []);

	const pan = useMemo(
		() =>
			Gesture.Pan()
				// Horizontal intent only; a vertical drag stays the ScrollView's.
				.activeOffsetX([-PAN_ACTIVATE_X, PAN_ACTIVATE_X])
				.failOffsetY([-PAN_FAIL_Y, PAN_FAIL_Y])
				.onEnd((e) => {
					"worklet";
					// The §0.5 contract, unchanged: same threshold, velocity and
					// sector as a feed card, measured against the screen width
					// because this stop fills it.
					const decision = decideSwipe({
						translationX: e.translationX,
						translationY: e.translationY,
						velocityX: e.velocityX,
						cardWidth: width,
					});
					// Left = forward, matching the reading direction of "Next stop →".
					if (decision === "left") runOnJS(goNext)();
					else if (decision === "right") runOnJS(goPrev)();
				}),
		[width, goNext, goPrev],
	);

	return (
		<GestureDetector gesture={pan}>
			<View style={styles.screen}>
				<View style={styles.head}>
					<Text style={styles.stopLabel}>{stopLabel(index, total)}</Text>
					<Pressable onPress={onExit} hitSlop={12}>
						<Text style={styles.close}>✕</Text>
					</Pressable>
				</View>

				{/* Segmented progress: completed segments in amber, the rest hairline.
			    Keyed off the STOP ID, not the index — task-1 lost rounds to
			    index/duplicate keys and the rule here is absolute. */}
				<View style={styles.progress}>
					{stopIds.map((id, i) => (
						<View
							key={id}
							style={[styles.segment, i <= index && styles.segmentDone]}
						/>
					))}
				</View>

				<ScrollView contentContainerStyle={styles.body}>
					<View style={styles.media}>
						<Image source={{ uri: hotspot.mediaUrl }} style={styles.mediaImg} />
						{/* The pin sits at the tagger's subject centre (§2.3 #2). */}
						<View
							style={[
								styles.pin,
								{
									left: `${hotspot.pin.x * 100}%`,
									top: `${hotspot.pin.y * 100}%`,
								},
							]}
						>
							<Text style={styles.pinGlyph}>{emojiForRoom(hotspot.room)}</Text>
						</View>
					</View>

					<Text style={styles.whyEyebrow}>WHY WE'RE SHOWING YOU THIS</Text>
					<Text style={styles.why}>{stop.why}</Text>
					<Text style={styles.evidence}>
						{`Based on ${stop.evidence
							.map((e) => `${e.count} ${e.label}`)
							.join(" · ")}`}
					</Text>

					{hotspot.actions.map((action) => (
						<Pressable
							key={action.kind}
							onPress={() => !action.disabled && onAction(action.kind)}
							style={({ pressed }) => [
								styles.action,
								pressed && !action.disabled && styles.pressed,
								action.disabled && styles.disabled,
							]}
						>
							<Text style={styles.actionEmoji}>
								{ACTION_EMOJI[action.kind]}
							</Text>
							<View style={styles.actionText}>
								<Text style={styles.actionLabel}>
									{action.label}
									{action.disabled ? " · coming soon" : ""}
								</Text>
								<Text style={styles.actionSub}>{action.sub}</Text>
							</View>
							{!action.disabled && <Text style={styles.chevron}>›</Text>}
						</Pressable>
					))}
				</ScrollView>

				<View style={styles.foot}>
					<Pressable
						onPress={onPrev}
						disabled={index === 0}
						style={({ pressed }) => [
							styles.btn,
							pressed && styles.pressed,
							index === 0 && styles.disabled,
						]}
					>
						<Text style={styles.btnLabel}>← Prev</Text>
					</Pressable>
					<Pressable
						onPress={onNext}
						style={({ pressed }) => [
							styles.btn,
							styles.btnPrimary,
							pressed && styles.pressed,
						]}
					>
						<Text style={styles.btnPrimaryLabel}>
							{last ? "Finish tour →" : "Next stop →"}
						</Text>
					</Pressable>
				</View>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	head: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingTop: 8,
	},
	stopLabel: { ...textStyles.caption, color: colors.ink2 },
	close: { ...textStyles.headline, color: colors.ink },
	progress: {
		flexDirection: "row",
		gap: 4,
		paddingHorizontal: 20,
		paddingTop: 10,
	},
	segment: {
		flex: 1,
		height: 3,
		borderRadius: radii.pill,
		backgroundColor: colors.border,
	},
	segmentDone: { backgroundColor: colors.accent },
	body: { padding: 20, gap: 6, paddingBottom: 24 },
	media: {
		height: MEDIA_HEIGHT,
		borderRadius: radii.tile,
		overflow: "hidden",
		backgroundColor: colors.surface2,
	},
	mediaImg: { width: "100%", height: MEDIA_HEIGHT },
	pin: {
		position: "absolute",
		width: 30,
		height: 30,
		marginLeft: -15,
		marginTop: -15,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.glass,
	},
	pinGlyph: { fontSize: 15 },
	whyEyebrow: { ...textStyles.caption, color: colors.accent, marginTop: 16 },
	/** §2.3 #3: serif 17.5. */
	why: { ...textStyles.serifBody, color: colors.ink },
	evidence: { ...textStyles.footnote, color: colors.ink2, marginTop: 4 },
	action: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 52,
		paddingVertical: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	actionEmoji: { fontSize: 17 },
	actionText: { flex: 1, gap: 2 },
	actionLabel: { ...textStyles.headline, color: colors.ink },
	actionSub: { ...textStyles.footnote, color: colors.ink2 },
	chevron: { ...textStyles.headline, color: colors.ink3 },
	pressed: { opacity: 0.7 },
	disabled: { opacity: 0.4 },
	foot: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 20,
		paddingBottom: 20,
		paddingTop: 8,
	},
	btn: {
		minHeight: 48,
		justifyContent: "center",
		paddingHorizontal: 18,
		borderRadius: radii.btn,
		backgroundColor: colors.surface2,
	},
	btnPrimary: { flex: 1, alignItems: "center", backgroundColor: colors.cta },
	btnLabel: { ...textStyles.headline, color: colors.ink },
	btnPrimaryLabel: { ...textStyles.headline, color: colors.bg },
});
