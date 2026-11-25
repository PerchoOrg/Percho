/**
 * The launch layer: the mark draws itself on the warm paper, then fades into
 * the app once the feed's first card is ready (owner pick "B" off
 * `/demos/launch-animation-v1`, 2026-11-25 — about two and a half seconds,
 * no name under it).
 *
 * The roof draws, a pen traces the bird's outline in one line, the colour
 * comes in, the eye appears. The geometry is the app icon's
 * (`scripts/app-icon/icon.svg`), in the same 1024 box.
 *
 * It sits over the whole app from the first render, takes over from the blank
 * native launch screen (`lib/splash-gate.ts`), and removes itself. It leaves
 * when the drawing is done AND the app is ready, or at `LAUNCH_MAX_MS`,
 * whichever is first — see the gate for why nothing here may hang.
 *
 * `react-native-svg` is here for this file alone: tracing a path needs
 * `strokeDashoffset`, which Views cannot do.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	Easing,
	type EasingFunction,
	type EasingFunctionFactory,
	runOnJS,
	useAnimatedProps,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";
import { launchDone, launchReady } from "../lib/launch-ready";
import {
	LAUNCH_MAX_MS,
	LAUNCH_STILL_MS,
	LAUNCH_TIMELINE as T,
} from "../lib/launch-timeline";
import { hideNativeSplash } from "../lib/splash-gate";
import { colors } from "../theme/tokens";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Side of the mark's box, in points — what the static launch image used. */
const MARK_SIZE = 160;
/** The mark sits at 70% of its 1024 box, centred (as the old launch image did). */
const MARK_TRANSFORM = "translate(512 512) scale(0.7) translate(-512 -515)";
const BIRD_TRANSFORM = "translate(534 536) scale(1.3)";

const ROOF = "M150 830 L512 550 L874 830";
/** Both legs: 2 × hypot(362, 280). */
const ROOF_LENGTH = 915.3;
const BIRD =
	"M222 -206 L156 -232 C140 -268 98 -288 58 -280 C6 -270 -52 -232 -104 -168 L-286 -44 L-262 -8 L-96 -66 C-60 -18 4 0 62 -10 C128 -22 170 -82 170 -150 C170 -168 164 -182 156 -188 Z";
/** Measured by flattening the path above (200 steps a curve), in its own units. */
const BIRD_LENGTH = 1307.3;
const EYE_RADIUS = 13;

const ROOF_INK = colors.accent;
const BIRD_INK = "#EE9B2F";
const EYE_INK = "#083F33";

const DRAW = Easing.bezier(0.45, 0, 0.35, 1);

export function LaunchAnimation() {
	const [gone, setGone] = useState(false);
	const [drawn, setDrawn] = useState(false);
	const ready = useSyncExternalStore(launchReady.subscribe, launchReady.get);
	const still = useReducedMotion();

	/** 0 → 1 over each part of the drawing. */
	const roof = useSharedValue(0);
	const outline = useSharedValue(0);
	const fill = useSharedValue(0);
	const eye = useSharedValue(0);
	const layer = useSharedValue(1);

	useEffect(() => {
		if (still) {
			// Reduce Motion: the finished mark, briefly, and no drawing.
			roof.value = 1;
			fill.value = 1;
			eye.value = 1;
			const t = setTimeout(() => setDrawn(true), LAUNCH_STILL_MS);
			return () => clearTimeout(t);
		}
		const part = (
			p: { start: number; duration: number },
			easing: EasingFunction | EasingFunctionFactory = DRAW,
		) => withDelay(p.start, withTiming(1, { duration: p.duration, easing }));
		roof.value = part(T.roof);
		outline.value = part(T.outline);
		fill.value = part(T.fill, Easing.out(Easing.quad));
		eye.value = part(T.eye, Easing.out(Easing.back(2)));
		const t = setTimeout(() => setDrawn(true), T.end);
		return () => clearTimeout(t);
	}, [still, roof, outline, fill, eye]);

	// The ceiling: whatever else happens, this layer does not outlive it.
	useEffect(() => {
		const t = setTimeout(() => setGone(true), LAUNCH_MAX_MS + T.fadeOut);
		return () => clearTimeout(t);
	}, []);

	const leaving = drawn && ready;
	useEffect(() => {
		if (!leaving) return;
		// The feed starts its first film now, as it comes into view.
		launchDone.mark();
		layer.value = withTiming(0, { duration: T.fadeOut }, (finished) => {
			if (finished) runOnJS(setGone)(true);
		});
	}, [leaving, layer]);

	// `strokeOpacity` because a round cap paints a dot at the start of a line
	// that has not begun yet.
	const roofProps = useAnimatedProps(() => ({
		strokeDashoffset: ROOF_LENGTH * (1 - roof.value),
		strokeOpacity: roof.value > 0 ? 1 : 0,
	}));
	const outlineProps = useAnimatedProps(() => ({
		strokeDashoffset: BIRD_LENGTH * (1 - outline.value),
		strokeOpacity: outline.value > 0 ? 1 : 0,
	}));
	const fillProps = useAnimatedProps(() => ({ fillOpacity: fill.value }));
	const eyeProps = useAnimatedProps(() => ({ r: EYE_RADIUS * eye.value }));
	const layerStyle = useAnimatedStyle(() => ({ opacity: layer.value }));

	if (gone) return null;

	return (
		<Animated.View
			style={[styles.layer, layerStyle]}
			// Touches must not reach the app underneath until it is the app's turn.
			pointerEvents={leaving ? "none" : "auto"}
			onLayout={hideNativeSplash}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<Svg width={MARK_SIZE} height={MARK_SIZE} viewBox="0 0 1024 1024">
				<G transform={MARK_TRANSFORM}>
					<AnimatedPath
						d={ROOF}
						fill="none"
						stroke={ROOF_INK}
						strokeWidth={78}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray={[ROOF_LENGTH, ROOF_LENGTH]}
						animatedProps={roofProps}
					/>
					<G transform={BIRD_TRANSFORM}>
						<AnimatedPath
							d={BIRD}
							fill="none"
							stroke={BIRD_INK}
							strokeWidth={18}
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeDasharray={[BIRD_LENGTH, BIRD_LENGTH]}
							animatedProps={outlineProps}
						/>
						<AnimatedPath d={BIRD} fill={BIRD_INK} animatedProps={fillProps} />
						<AnimatedCircle
							cx={108}
							cy={-226}
							fill={EYE_INK}
							animatedProps={eyeProps}
						/>
					</G>
				</G>
			</Svg>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	layer: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.bg,
	},
});
