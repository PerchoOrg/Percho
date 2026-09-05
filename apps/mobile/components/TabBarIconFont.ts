/**
 * The TabBar icon set, as two FONTS — Phosphor regular (outline) and fill.
 *
 * Why a font and not SVG: `react-native-svg` red-screens in Expo Go on this
 * project (DEVLOG 2026-07-30 04:55), so the same constraint that drove the
 * redline's icon font applies to the tab bar.
 *
 * 2026-09-05 (owner): the old set read as generic bank-app chrome. New glyphs
 * — house-line / compass / heart / hand-waving — and the ACTIVE tab is
 * duotone: the fill glyph at low opacity under the outline glyph. Both weights
 * carry the same four codepoints and, as measured below, the same bounds, so
 * the two layers register exactly and one table addresses both fonts.
 *
 * The TabBar sits OUTSIDE the redline (its tokens are theme/tokens `colors`,
 * warm paper + amber accent, not the redline green), so it gets its own fonts
 * rather than borrowing redline glyphs.
 *
 * `assets/fonts/TabBarIcons.ttf` / `TabBarIconsFill.ttf` are 4-glyph subsets of
 * the official Phosphor TTFs, built by
 * `scripts/icon-fonts/build-tabbar-icon-font.py` (fontTools subset, ~2.5 KB each).
 */
export type TabBarIconName = "feed" | "search" | "saved" | "you";

/** The families registered with `expo-font`. */
export const TAB_BAR_FONT = "TabBarIcons";
export const TAB_BAR_FONT_FILL = "TabBarIconsFill";

export const TAB_BAR_GLYPH: Record<TabBarIconName, string> = {
	feed: "", // house-line
	search: "", // compass
	saved: "", // heart
	you: "", // hand-waving
};

/**
 * NO horizontal shift. Every glyph is already centred in its em box — measured
 * with fontTools on the built subsets: all four have `cx` = 0.500 exactly.
 *
 * The previous version shifted each glyph right by `(1 - artWidth) / 2` em,
 * believing the drawings were flush left. `TAB_BAR_ART_WIDTH` actually held
 * each glyph's xMax, not its width, so the "correction" pushed every icon off
 * centre — bookmark by 0.11 em ≈ 2.7 px, which is the drift the owner spotted
 * (2026-09-05). The table and the transform are both gone; do not reintroduce
 * them without re-measuring.
 */

/**
 * Vertical centre of each glyph's drawing, in em, measured off the built font.
 *
 * `TabBar` renders the glyph in a line box of exactly 1 em (`lineHeight ===
 * fontSize`), and the font's hhea (ascent 960, descent −64 of a 1024 upm) puts
 * that box's centre at 0.4375 em above the baseline — see `TAB_BAR_BOX_CENTER_Y`.
 * A glyph whose own centre differs sits high or low by the difference: heart is
 * 0.031 em low (≈0.75 px at 24 pt), house-line 0.015 em high. Small, but this
 * is a row of four icons where any one sitting off the line is what the eye
 * catches.
 */
export const TAB_BAR_GLYPH_CENTER_Y: Record<TabBarIconName, number> = {
	feed: 0.453,
	search: 0.438,
	saved: 0.406,
	you: 0.422,
};

/** Centre of the 1 em line box, above the baseline: `ascent / (ascent + |descent|)`. */
export const TAB_BAR_BOX_CENTER_Y = 0.4375;

/**
 * Per-glyph visual scale, applied on top of `TAB_BAR_OPTICAL_SCALE`.
 *
 * Optical size tracks `sqrt(w * h)` of the drawing better than either
 * dimension alone: compass 0.812, heart 0.810, hand-waving 0.828, house-line
 * 0.856. Only house-line is meaningfully off the group (+4%), so only
 * house-line is corrected. The others are within 2% of each other and a
 * "correction" there would be noise.
 */
export const TAB_BAR_GLYPH_SCALE: Record<TabBarIconName, number> = {
	feed: 0.96,
	search: 1,
	saved: 1,
	you: 1,
};

/**
 * Font size to request per point of nominal icon size.
 *
 * The art fills ~0.81–0.86 em of the em box (mean ≈0.83), so a glyph set at
 * `fontSize === size` renders ~17% smaller than its box. 1.13 brings the mean
 * to ~0.94 em — visually the requested size, with the widest glyph still
 * inside its row.
 */
export const TAB_BAR_OPTICAL_SCALE = 1.13;
