/**
 * ValueSlider — the drag control behind §2.4 #3's adjustable Monthly calculator.
 *
 * Hand-rolled rather than a dependency: `@react-native-community/slider` is a
 * native module, so it does not exist in Expo Go, which is the only place this
 * app is tested on device today. A View-drawn track plus a pan gesture has no
 * such constraint. (Same reasoning as task-0's self-built BottomSheet, and the
 * same reason task-1's score ring is drawn with Views — see DEVLOG 2026-07-30
 * "RNSVGCircle 不存在".)
 *
 * All arithmetic lives in `lib/listing/slider-scale.ts` and is unit-tested; this
 * file is layout, measurement, and the gesture.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { haptics } from "../../lib/haptics";
import type { SliderScale } from "../../lib/listing/slider-scale";
import {
	fractionForValue,
	valueForOffset,
} from "../../lib/listing/slider-scale";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const THUMB = 24;
const TRACK_H = 4;

interface ValueSliderProps {
	label: string;
	/** Formatted current value, e.g. "20% down" or "6.5%". */
	valueLabel: string;
	value: number;
	scale: SliderScale;
	onChange: (value: number) => void;
	/** Accessibility: what the value means, for VoiceOver. */
	a11yLabel: string;
}

export function ValueSlider({
	label,
	valueLabel,
	value,
	scale,
	onChange,
	a11yLabel,
}: ValueSliderProps) {
	const [trackWidth, setTrackWidth] = useState(0);

	/**
	 * Ref trampolines, then stable `useCallback` wrappers.
	 *
	 * `onChange` is an inline arrow at the call site, so its identity changes on
	 * every render — and this component re-renders on every drag frame, since the
	 * payment above it recomputes. Naming it in the gesture's dependency list
	 * would rebuild a LIVE `Gesture.Pan` mid-drag, which drops the in-flight
	 * touch: the thumb would stick after the first pixel. Task-1 lost rounds to
	 * exactly this; `lib/gesture/memo-identity.test.ts` encodes the rule.
	 */
	const changeRef = useRef(onChange);
	changeRef.current = onChange;
	const widthRef = useRef(trackWidth);
	widthRef.current = trackWidth;
	const scaleRef = useRef(scale);
	scaleRef.current = scale;
	/** Last emitted value, so the tick haptic fires once per step, not per frame. */
	const lastRef = useRef(value);
	lastRef.current = value;

	const emit = useCallback((offsetPx: number) => {
		const next = valueForOffset(offsetPx, widthRef.current, scaleRef.current);
		if (next === lastRef.current) return;
		lastRef.current = next;
		// selectionAsync — the same "you crossed a notch" cue §0.5 gives a swipe
		// threshold. Not `impact`: a drag can cross dozens of steps and a heavy
		// haptic per step is unusable.
		haptics.swipeThreshold();
		changeRef.current(next);
	}, []);

	const pan = useMemo(
		() =>
			Gesture.Pan()
				// Claim the touch immediately: this control is 24pt tall inside a
				// vertical ScrollView, and requiring travel before activation makes
				// the first few pixels of every drag scroll the page instead.
				.minDistance(0)
				.onBegin((e) => {
					"worklet";
					runOnJS(emit)(e.x);
				})
				.onUpdate((e) => {
					"worklet";
					runOnJS(emit)(e.x);
				}),
		[emit],
	);

	const onLayout = (e: LayoutChangeEvent) =>
		setTrackWidth(e.nativeEvent.layout.width);

	const fill = fractionForValue(value, scale);

	return (
		<View style={styles.wrap}>
			<View style={styles.head}>
				<Text style={styles.label}>{label}</Text>
				<Text style={styles.value}>{valueLabel}</Text>
			</View>
			<GestureDetector gesture={pan}>
				{/* The hit area is the full row height, not the 4pt track — a 4pt
				    target fails the 44pt minimum and is unusable in the hand. */}
				<View
					style={styles.hit}
					onLayout={onLayout}
					accessible
					accessibilityRole="adjustable"
					accessibilityLabel={a11yLabel}
					accessibilityValue={{ text: valueLabel }}
				>
					<View style={styles.track}>
						<View style={[styles.trackFill, { width: `${fill * 100}%` }]} />
					</View>
					{/* `left` in percent with a half-thumb pull-back, so the thumb's
					    CENTRE tracks the value at both ends instead of its edge. */}
					<View
						style={[
							styles.thumb,
							{ left: `${fill * 100}%`, marginLeft: -THUMB / 2 },
						]}
					/>
				</View>
			</GestureDetector>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: 6, paddingTop: 10 },
	head: { flexDirection: "row", justifyContent: "space-between" },
	label: { ...textStyles.footnote, color: colors.ink2 },
	value: { ...textStyles.headline, color: colors.ink },
	hit: { height: 44, justifyContent: "center" },
	track: {
		height: TRACK_H,
		borderRadius: radii.pill,
		backgroundColor: colors.border,
		overflow: "hidden",
	},
	trackFill: { height: TRACK_H, backgroundColor: colors.accent },
	thumb: {
		position: "absolute",
		width: THUMB,
		height: THUMB,
		borderRadius: radii.pill,
		backgroundColor: colors.surface,
		borderWidth: 2,
		borderColor: colors.accent,
	},
});
