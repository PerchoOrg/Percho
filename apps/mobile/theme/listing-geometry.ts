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

/**
 * "Structure: - Hero image: 54% of card height - White content panel: 46%"
 *
 * **Raised to 61.8% on 2026-08-01** — owner asked for 「视频占卡片比例改成0.618」
 * (golden ratio), after an initial 0.648 attempt. The panel takes the remaining
 * 38.2%. This is a deliberate, later override of the redline's 54%: the hero now
 * plays a caption-free tour video and the owner wants more of the card on it.
 *
 * 0.618 is what makes the two-line story possible again (owner: 「可以把底下的
 * 两行描述加回来吗」). It does NOT fit on every device, and the panel handles that
 * by letting the STORY give up a line rather than pushing the CTA off the card —
 * see `PANEL_SCALE` for the measured table and `ListingFace`'s story comment for
 * the flex mechanism.
 */
export const HERO_RATIO = 0.618;

/**
 * How much the panel's own type/spacing shrinks to fit 38.2% instead of 46%.
 *
 * 0.382 / 0.46 ≈ 0.83 would be the "true" proportion, but 0.765 is kept because
 * it is what buys the second story line back. Every metric below is
 * `round(original × 0.765)`, floored at 44 for the CTA (§0.5 touch target).
 *
 * **Verified against real device sizes, not chosen by eye.** The card is
 * `min((width − 32) × 1.5, height × 0.74)`, so the panel ranges 188–228pt.
 * Fixed rows (padding + price + address + locality + chips + CTA) need 172pt;
 * the story adds 11pt of margin plus 15pt per line:
 *
 * | device | panel | 1-line floor 187 | 2-line want 202 |
 * |---|---|---|---|
 * | SE / 8 (375×667) | 188 | ✓ | ✗ → 1 line |
 * | 13 mini (375×812) | 197 | ✓ | ✗ → 1 line |
 * | 14 / 13 (390×844) | 205 | ✓ | ✓ **2 lines** |
 * | 16 Pro (402×874) | 212 | ✓ | ✓ **2 lines** |
 * | 14 Pro Max (430×932) | 228 | ✓ | ✓ **2 lines** |
 *
 * So the story is `numberOfLines={2}` + `flexShrink: 1`: it takes two lines
 * where they fit and silently drops to one on the two smallest screens. The CTA
 * never moves, which is the property that matters — `chips` uses
 * `marginTop: auto`, so any panel overflow pushes the CTA off the bottom edge
 * (the bug this file's header says was fixed twice).
 *
 * Raising this scale is not free: at 0.80 the 1-line floor becomes 192 and the
 * iPhone SE clips the CTA outright. 0.765 is the ceiling for a 0.618 hero.
 */
export const PANEL_SCALE = 0.765;

/**
 * "Chips ... Height 27px", icon sized to sit inside it.
 *
 * Raised 10 → 12 on 2026-08-01 (owner: 「icon再大一点点」) once the art became
 * Phosphor Fill glyphs: solid shapes read smaller than the old stroke drawings
 * at the same point size, so 10 looked undersized next to the label.
 *
 * 12 is chosen against the WIDTH budget, not by eye. The row is three chips,
 * nowrap, and its widest realistic trio ("Top Schools" · "Private Backyard" ·
 * "Trails Nearby") measures ~197pt of label at 9.5pt. Adding per-chip
 * icon + 4 gap + 2×7 padding and 2×5 row gaps:
 *
 *   icon 10 → 291pt      icon 12 → 297pt      icon 13 → 300pt
 *
 * The tightest device is the iPhone SE: 375 − 2×16 gutter − 2×18 panel padding
 * = 307pt of content width. So 12 keeps ~10pt of slack and 13 keeps only ~7 —
 * and the chip is `flexShrink: 1`, so overflow would silently shrink a chip
 * rather than error. 12 is the last size with real margin.
 *
 * Height is not a constraint: the glyph box is 12 inside a 21pt chip.
 */
export const CHIP_ICON = 12;

/** The redline shows three chips; a fourth would wrap and break the row. */
export const MAX_CHIPS = 3;

/**
 * How many `marginTop: 'auto'` slots the content panel has.
 *
 * The panel is a fixed PROPORTION of the card (38.2%), not a fit-to-content box,
 * so on most devices it is a few points taller than its rows need. Yoga (like CSS
 * flexbox) divides that free space equally between every auto margin in the
 * column, so the slot count decides the panel's rhythm.
 *
 * It used to be 1 — `chips` was the only auto margin — so the story→chips gap
 * collected 100% of the slack and measured ~37pt against 8pt everywhere else.
 * The owner called it on 2026-08-01: 「描述和几个特点之间的空白明显比其他空白大 你参照
 * 第二个照片里的样式和排版」. On the reference board the three section breaks
 * (panel-top→price, story→chips, chips→CTA) are all roughly equal at ~32pt while
 * the identity rows below the price are tight, so the fix is three equal slots:
 *
 *   1. `price.marginTop`   — reads as panel padding under the photo
 *   2. `chips.marginTop`   — the story→chips section break (on top of an 8pt floor)
 *   3. `ctaSlot.marginTop` — the chips→CTA section break (on top of an 8pt floor)
 *
 * Under pressure every auto resolves to 0, the two floors hold, and the story's
 * `flexShrink` yields the second line — so the CTA still cannot be pushed off the
 * card and the fit floor asserted in the test is unchanged.
 */
export const SLACK_SLOTS = 3;

/**
 * The MINIMUM story→chips and chips→CTA gap, in pt.
 *
 * 4, not 8, and the arithmetic is why: before this change the column carried a
 * fixed 8pt above the CTA and nothing below the story, so the fixed cost of the
 * two section breaks was 8. Splitting the gap in two and floor-ing both at 8
 * would have raised that to 16 — `redline-listing-geometry.test.ts` caught it
 * immediately (194 needed against 188.5 available on a 375×667 SE, and the
 * second story line lost on the iPhone 14 too). 4 + 4 keeps the panel's fixed
 * cost exactly where it was, so no device loses a line to this change.
 *
 * 4 is a floor, not the rendered gap: every device with slack gets
 * `4 + slack/SLACK_SLOTS` (14pt on a Pro Max, 18pt total). The floor only binds
 * on the smallest screens, which is where a tight rhythm is correct anyway.
 */
export const SECTION_GAP_FLOOR = 4;

export const listingGeometry = {
	/**
	 * "Content panel padding: 18px left/right / 18px top / 20px bottom", scaled
	 * by `PANEL_SCALE` for the 2026-08-01 taller hero. Horizontal padding is NOT
	 * scaled — the card's width did not change, and narrowing the side gutters
	 * would let the price and address run closer to the edge than any other card.
	 */
	panel: {
		flex: 1 - HERO_RATIO,
		paddingHorizontal: 18,
		paddingTop: 14,
		paddingBottom: 15,
	},
	/** "Address: 14px semibold, margin-top 8px" → 6 at PANEL_SCALE. */
	address: { marginTop: 6 },
	/** "Location: 12px muted, margin-top 4px" → 3. */
	locality: { marginTop: 3 },
	/**
	 * "Story: 13px, line-height 1.45, margin-top 15px, #57534D" → margin 8.
	 *
	 * **Restored on the card 2026-08-01** (owner: 「可以把底下的两行描述加回来吗」)
	 * once the hero settled at 0.618. Rendered `numberOfLines={2}` with
	 * `flexShrink: 1`, so it takes two lines on a 390pt-wide phone and up and
	 * yields to one on SE / 13 mini rather than pushing the CTA off the card.
	 *
	 * The margin is 8 rather than the scaled 11, and `redlineText.storyCompact`
	 * tightens the leading to 13/14: at 11 + 13/15 the second line did not fit
	 * ANY device below a Pro Max, which the fit test caught. Every point here was
	 * spent buying the owner's second line.
	 *
	 * `marginBottom: 8` is the FLOOR of the story→chips gap. It used to be
	 * `ctaSlot.marginTop` while `chips` held the column's only `marginTop:'auto'`
	 * — which made that one gap collect 100% of the panel's free space (~37pt on
	 * a Pro Max against 8pt everywhere else, the 2026-08-01 complaint
	 * 「描述和几个特点之间的空白明显比其他空白大」). Now it is a floor and the slack is
	 * split three ways; see `SLACK_SLOTS`.
	 */
	story: { marginTop: 8, marginBottom: SECTION_GAP_FLOOR, color: "#57534D" },
	/** "Chips: ... gap 6px" → 5. `marginBottom` is the chips→CTA floor. */
	chips: { gap: 5, marginBottom: SECTION_GAP_FLOOR },
	/** "Chips: - Height 27px - Background #F1F1EC - radius 999px" → 21. */
	chip: { height: 21 },
	/**
	 * "CTA: ... margin-top 14px" → its 8pt floor now lives on `chips.marginBottom`
	 * so this margin can be `auto` — one of the three slack recipients.
	 */
	ctaSlot: { marginTop: "auto" },

	// ── Hero overlays. The listing hero carries EXACTLY ONE ──────────────
	// The redline drew three. Both of the others are gone, on the owner's calls:
	//
	//   · the bottom-left "⊕ 18 Photos" counter — removed 2026-08-01 for
	//     immersion; the hero plays the tour video and chrome printed over moving
	//     footage advertises a number about the listing PAGE, not the home;
	//   · the top-right heart — removed 2026-08-01 (owner: 「去掉右上角的爱心标志」).
	//     Saving is not lost as a product idea, it just has no affordance on the
	//     card face; nothing in the feed passed a handler to it either, so the
	//     button had always been inert here.
	//
	// `photoCountSlot` / `heartSlot` are deliberately ABSENT, not zeroed —
	// `redline-listing-geometry.test.ts` asserts the exact slot key set, so a slot
	// reappearing here is a test failure rather than a silent regression.
	/** LISTING pill — "15px from top and left". */
	pillSlot: { top: 15, left: 15 },
} as const;
