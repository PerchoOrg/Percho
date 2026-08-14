/**
 * DM Serif Display — the Percho wordmark's face (owner, 2026-08-14:
 * 「Percho logo 改为 DM Serif Display」). Bundled at
 * `assets/fonts/DMSerifDisplay-Regular.ttf` (SIL OFL), loaded in
 * `app/_layout.tsx` alongside the icon font.
 *
 * Kept OUT of `theme/typography.ts`'s `serif` (New York → Georgia): the owner
 * says ONLY the wordmark uses this face — every other UI text stays the
 * system sans/serif. `useFonts` must be told about the family, which is why
 * this module exists as the single source for the registered name.
 */
export const DM_SERIF_FONT = "DMSerifDisplay";
