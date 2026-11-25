/**
 * The TabBar icon set, as two FONTS — Phosphor bold (outline) and fill.
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
 * 2026-11-25 (owner, off `/demos/tab-icons-v1`: "f6 s2 y6 bold"): the glyphs
 * are play-circle / magnifying-glass / heart / sliders-horizontal, and the
 * outline layer is Phosphor BOLD. The September set was chosen for "cute";
 * the app is a business tool for agents and buyers, and the waving hand in
 * particular did not say "account and settings". Every number below was
 * re-measured on the new subsets.
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
	feed: "", // play-circle
	search: "", // magnifying-glass
	saved: "", // heart
	you: "", // sliders-horizontal
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
 * 0.031 em low (≈0.75 px at 24 pt); the other three sit on the centre. Small,
 * but this is a row of four icons where any one sitting off the line is what
 * the eye catches. Bold and fill agree on every centre.
 */
export const TAB_BAR_GLYPH_CENTER_Y: Record<TabBarIconName, number> = {
	feed: 0.438,
	search: 0.438,
	saved: 0.406,
	you: 0.438,
};

/** Centre of the 1 em line box, above the baseline: `ascent / (ascent + |descent|)`. */
export const TAB_BAR_BOX_CENTER_Y = 0.4375;

/**
 * Per-glyph visual scale, applied on top of `TAB_BAR_OPTICAL_SCALE`.
 *
 * Optical size tracks `sqrt(w * h)` of the drawing better than either
 * dimension alone. On the bold subsets: play-circle 0.844, magnifying-glass
 * 0.845, heart 0.841 — within 1% of each other, so none is corrected.
 * sliders-horizontal is 0.716 (0.781 wide, 0.656 tall): it is two lines, not
 * a filled outline, and is left at its drawn size rather than shrinking the
 * other three to meet it.
 */
export const TAB_BAR_GLYPH_SCALE: Record<TabBarIconName, number> = {
	feed: 1,
	search: 1,
	saved: 1,
	you: 1,
};

/**
 * Font size to request per point of nominal icon size.
 *
 * The outlined glyphs fill ~0.84 em of the em box, so a glyph set at
 * `fontSize === size` renders ~16% smaller than its box. 1.13 brings them to
 * ~0.95 em — visually the requested size, with the widest glyph (heart,
 * 0.906 em → 24.6 pt) still inside its 48 pt pill.
 */
export const TAB_BAR_OPTICAL_SCALE = 1.13;
