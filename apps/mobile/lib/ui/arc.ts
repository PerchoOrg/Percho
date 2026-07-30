/**
 * Arc geometry for the neighbourhood score ring.
 *
 * The ring is drawn with clipped, rotated bordered Views, NOT `react-native-svg`:
 * the svg package resolves in JS but Expo Go carries no RNSVG native view
 * managers, so `<Circle>` throws "View config getter callback for component
 * `RNSVGCircle` must be a function (received `undefined`)" at render time on
 * device. Using svg would mean a custom dev client and a native rebuild for a
 * decoration.
 *
 * Model: degrees clockwise from 12 o'clock. A View with only its top and right
 * borders coloured paints the span [θ-45, θ+135] when rotated by θ, because
 * border corners meet on the diagonals. Two half-width `overflow: hidden`
 * windows act as apertures — right = [0,180], left = [180,360] — and the union
 * of what shows through must be exactly [0, pct*360].
 *
 * This lives in `lib/` rather than beside the component so it is unit-testable:
 * the runner only collects `{lib,state,theme}`, and this is exactly the kind of
 * geometry that looks right on screen while being 45° or 180° out.
 */

/**
 * @param side which clipping window's arc is being rotated
 * @returns rotation in degrees for that window's arc View
 */
export function arcRotation(pct: number, side: "left" | "right"): number {
	// Past halfway the sub-50% rotation would slide the right window's arc off 0°
	// and open a gap at 12 o'clock — the arc would look detached from its start.
	// 45° is the rotation whose span is exactly [0,180]: the right half, solid.
	if (side === "right" && pct > 0.5) return 45;
	return pct * 360 - 135;
}
