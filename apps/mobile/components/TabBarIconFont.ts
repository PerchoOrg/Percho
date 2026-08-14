/**
 * The TabBar icon set, as a FONT — Phosphor regular (outline) weight.
 *
 * Why a font and not SVG: `react-native-svg` red-screens in Expo Go on this
 * project (DEVLOG 2026-07-30 04:55), so the same constraint that drove the
 * redline's icon font applies to the tab bar. The owner's TabBar spec
 * (2026-08-14) requires one icon library, outline style, 22px at ~1.75 stroke
 * — that is Phosphor's regular weight, and an icon font is how the already
 * proven pattern ships it with zero native-module risk.
 *
 * The TabBar sits OUTSIDE the redline (its tokens are theme/tokens `colors`,
 * warm paper + amber accent, not the redline green), so it gets its own font
 * rather than borrowing redline glyphs.
 *
 * `assets/fonts/TabBarIcons.ttf` is a 4-glyph subset of Phosphor regular,
 * built by `scripts/build-tabbar-icon-font.py` (SVG -> minimal TTF via
 * fontTools, ~1.1 KB). Codepoints match the FILL weight's, so they line up
 * with `assets/icons/phosphor-selection.json`.
 *
 * Art widths were measured off the built font with fontTools (bounds pen /
 * unitsPerEm). Every glyph has a 1em advance and zero left side bearing, so
 * the drawing is flush left — the centring shift is `(1 - artWidth) / 2` em,
 * the same fix documented in `redline/icon-font.ts`.
 */
export type TabBarIconName = "feed" | "search" | "saved" | "you";

/** The family name registered with `expo-font`. */
export const TAB_BAR_FONT = "TabBarIcons";

export const TAB_BAR_GLYPH: Record<TabBarIconName, string> = {
	feed: "\ue2c6", // house-simple
	search: "\ue30c", // magnifying-glass
	saved: "\ue0ea", // bookmark-simple
	you: "\ue4c2", // user — plain Phosphor outline person, NOT user-circle
};

/**
 * Width of each glyph's drawing, as a fraction of the em box (measured).
 *
 * The TabBar font is a subset of the OFFICIAL Phosphor regular TTF (see
 * `scripts/build-tabbar-icon-font.py`) — not the earlier hand-built SVG→TTF
 * conversion, whose winding broke on CoreText and rendered every icon as a
 * solid blob (owner: "三个一模一样").
 */
export const TAB_BAR_ART_WIDTH: Record<TabBarIconName, number> = {
	feed: 0.875,
	search: 0.9062,
	saved: 0.7812,
	you: 0.9062,
};

/**
 * Font size to request per point of nominal icon size.
 *
 * The regular-weight art fills ~0.78–0.91em of the em box, mean ≈0.87em. A
 * glyph set at `fontSize === size` renders ~13% smaller than the box. 1.13
 * brings the average to ~0.98em — matching the old `View` icons' optical
 * weight without the widest glyph (search/you, 0.906em) overflowing its row.
 */
export const TAB_BAR_OPTICAL_SCALE = 1.13;
