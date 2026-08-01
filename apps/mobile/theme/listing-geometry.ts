/**
 * The listing card's redline GEOMETRY, as plain data.
 *
 * Split out of `ListingFace`'s `StyleSheet.create` so it can be asserted by
 * `redline-listing-geometry.test.ts` without importing the component — the
 * mobile vitest suite is deliberately react-native-free (see the note in
 * `redline-type.test.ts`), and `StyleSheet` / `View` would break that.
 *
 * These numbers come from the owner's `Untitled.txt` redline, quoted at each
 * field. They live here rather than inline because they DRIFTED TWICE: when the
 * spec file aged out of cache I re-derived them from
 * `~/percho-prototypes/swipe-cards-redline/index.html`, which is an earlier
 * reproduction of the board rather than the spec, and whose chip metrics had been
 * squeezed to fit three sample labels into a 270px div. Hero 54→52, chip gap 6→4,
 * chip padding 7→5, chip font 9.5→8 and story margin-top 15→14 all went the wrong
 * way on that basis. The prototype HTML is not the spec.
 */

/** "Structure: - Hero image: 54% of card height - White content panel: 46%" */
export const HERO_RATIO = 0.54;

/** "Chips ... Height 27px", icon sized to sit inside it. */
export const CHIP_ICON = 10;

/** The redline shows three chips; a fourth would wrap and break the row. */
export const MAX_CHIPS = 3;

export const listingGeometry = {
	/** "Content panel padding: 18px left/right / 18px top / 20px bottom" */
	panel: {
		flex: 1 - HERO_RATIO,
		paddingHorizontal: 18,
		paddingTop: 18,
		paddingBottom: 20,
	},
	/** "Address: 14px semibold, margin-top 8px" */
	address: { marginTop: 8 },
	/** "Location: 12px muted, margin-top 4px" */
	locality: { marginTop: 4 },
	/** "Story: 13px, line-height 1.45, margin-top 15px, #57534D" */
	story: { marginTop: 15, color: "#57534D" },
	/** "Chips: ... gap 6px" */
	chips: { gap: 6 },
	/** "Chips: - Height 27px - Background #F1F1EC - radius 999px" */
	chip: { height: 27 },
	/** "CTA: ... margin-top 14px" */
	ctaSlot: { marginTop: 14 },

	// ── Hero overlays. The redline gives the listing hero EXACTLY three ──
	/** LISTING pill — "15px from top and left". */
	pillSlot: { top: 15, left: 15 },
	/** Heart — "38px circle", mirroring the pill's inset. */
	heartSlot: { top: 15, right: 15 },
	/** "Bottom-left image pill: [small camera icon] 18 Photos" */
	photoCountSlot: { bottom: 14, left: 15 },
} as const;
