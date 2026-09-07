/**
 * Shared icon chrome for the redline card faces (2026-07-30, owner:
 * 「全按redline覆盖」).
 *
 * ── Where the icons come from ───────────────────────────────────────────────
 *
 * The icons were originally composed from bordered `View`s, because the redline
 * asked for Lucide-style line art and Lucide wants `react-native-svg` — which
 * red screens in Expo Go on this project (`RNSVGCircle must be a function`, see
 * DEVLOG 2026-07-30 04:55). That constraint has NOT gone away.
 *
 * On 2026-08-01 the owner reviewed six real icon libraries at true chip size and
 * picked **Phosphor Fill** ("这些图标不可爱" about the old line art). Phosphor
 * ships an icon FONT as well as SVGs, and a font needs no native module at all,
 * so the real artwork now ships via `expo-font` with none of the RNSVG risk.
 * See `./icon-font.ts` for the glyph table and the subsetting command.
 */
import { StyleSheet, Text, View } from "react-native";
import {
	ICON_ART_WIDTH,
	ICON_FONT,
	ICON_GLYPH,
	ICON_OPTICAL_SCALE,
	OUTLINE_ART_WIDTH,
	OUTLINE_FONT,
	OUTLINE_OPTICAL_SCALE,
	type RedlineIconName,
} from "./icon-font";

// Re-exported because every face already imports the icon type from this module;
// the artwork moved to `icon-font.ts`, the public surface did not.
export type { RedlineIconName };

// ─── Icons ──────────────────────────────────────────────────────────

interface RedlineIconProps {
	name: RedlineIconName;
	/** Art size in points. The redline uses 10 (chip) / 17 (tile) / 24 (choice). */
	size: number;
	color: string;
	/**
	 * `fill` (default) = Phosphor Fill — the main set every face uses.
	 * `outline` = Phosphor Regular, the fine line weight the trade-off card's
	 * 2026-08-14 redesign calls for. Same codepoints, different font file and
	 * centring numbers (see `icon-font.ts`).
	 */
	weight?: "fill" | "outline";
}

/**
 * A Phosphor glyph, drawn as text.
 *
 * `width`/`height` are pinned to `size` and the glyph is centred inside them, so
 * this drops into the same layout slot the old `View`-composed icons occupied —
 * a call site that reserved 10pt still gets exactly 10pt. `includeFontPadding`
 * (Android) and `textAlignVertical` are what stop the font's line box from
 * adding invisible space above the art and pushing chip labels off centre.
 *
 * ── Horizontal centring is NOT free (2026-08-14) ────────────────────────────
 *
 * Flex-centring the `<Text>` centres the glyph's EM BOX. In this font every
 * glyph has a 1em advance and a zero left side bearing, so the drawing is
 * flush left and all of the slack sits on the right — the art lands
 * `(1 - artWidth) / 2` em left of centre. `bookmark` is the extreme case at
 * 0.5625em wide: 4.4pt off centre inside the 38pt save disc, which is what
 * the owner saw. So the glyph is shifted right by half its slack.
 * `textAlign: "center"` covers the other half of the problem — a box narrower
 * than the 1.18em advance would otherwise leave the glyph left-aligned in it.
 * See `ICON_ART_WIDTH` for the measurements.
 *
 * Note there is no `name`-not-found branch: `RedlineIconName` is a closed union
 * and `ICON_GLYPH` is a complete `Record` of it, so an unmapped name is a
 * compile error rather than a run-time tofu box.
 */
export function RedlineIcon({
	name,
	size,
	color,
	weight = "fill",
}: RedlineIconProps) {
	const outline = weight === "outline";
	const fontSize =
		size * (outline ? OUTLINE_OPTICAL_SCALE : ICON_OPTICAL_SCALE);
	return (
		<View style={[styles.iconBox, { width: size, height: size }]}>
			<Text
				allowFontScaling={false}
				style={{
					fontFamily: outline ? OUTLINE_FONT : ICON_FONT,
					fontSize,
					lineHeight: fontSize,
					color,
					includeFontPadding: false,
					textAlignVertical: "center",
					textAlign: "center",
					transform: [
						{
							translateX:
								(fontSize *
									(1 - (outline ? OUTLINE_ART_WIDTH : ICON_ART_WIDTH)[name])) /
								2,
						},
					],
				}}
			>
				{ICON_GLYPH[name]}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	/** Reserves the nominal icon box and centres the glyph inside it. */
	iconBox: { alignItems: "center", justifyContent: "center" },
});
