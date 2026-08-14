/**
 * The listing card's 2026-08-13 layout geometry, as plain data.
 *
 * Split out of `ListingFace`'s `StyleSheet.create` so
 * `listing-layout.test.ts` can assert the acceptance criteria without
 * importing the component — the mobile vitest suite is deliberately
 * react-native-free (see `redline-type.test.ts`), and `StyleSheet` / `View`
 * would break that.
 *
 * The redesign changes the card's height model: the card FILLS the feed's
 * available height (flex:1), the media area takes every remaining point
 * (`flex: 1, minHeight: 0`), and the text block renders at its natural
 * height under it — target ≤ 190pt. `ListingFace`'s StyleSheet references
 * these values through `geo`, so the component and this arithmetic cannot
 * drift.
 *
 * `TEXT_BLOCK_TARGET` is the redesign's budget for the block:
 * padding 16 top / 18 horizontal / 18 bottom, a price+specs baseline row
 * (31pt), the address (8pt + 12pt), the tags (13pt + 21pt pill), the hairline
 * divider (12pt + 1pt), and a 46pt CTA (8pt + 46), then 18pt of bottom
 * padding:
 *
 *   16 + 31 + 8 + 12 + 13 + 21 + 12 + 1 + 8 + 46 + 18 = 186 ≤ 190  ✓
 *
 * That floor leaves 4pt of headroom before the ≤190 acceptance starts
 * failing — the exact number a future "just add one more row" edit spends
 * without tripping anything until it is too late. It was 17pt before the
 * 2026-08-14 pass; the divider is what spent most of it.
 */
export const TEXT_BLOCK_TARGET = 190;

/**
 * The tag row on an iPhone SE (375pt): content width is 375 − 2×12 card
 * gutter − 2×18 block padding = 315pt. The three pills are at 10.5pt/600
 * with 9pt horizontal padding each; the widest realistic trio measures
 * ~304pt, so 315 fits them with ~11pt of slack. The row MUST NOT truncate —
 * when three do not fit, the third pill is dropped whole (see ListingFace).
 */
export const SE_TAG_ROW_WIDTH = 315;

/** Tag pill vertical padding (×2) + 10.5pt label. */
export const TAG_PILL_HEIGHT = 21;

/** How many tag pills render at most. */
export const MAX_TAGS = 3;

/**
 * The text block's own geometry — padding and row margins. `ListingFace`
 * spreads `geo.block` / `geo.address` / `geo.tags` / `geo.divider` /
 * `geo.ctaSlot` into its StyleSheet so the component and this arithmetic stay
 * in lockstep. The CTA is a fixed 46pt.
 *
 * 2026-08-14 owner pass: the price wanted more air under it (6 → 8), and the
 * chip row wanted a hairline rule between it and the explore link. The rule
 * carries the separation the CTA gap used to carry alone, so `ctaSlot` drops
 * 14 → 8 — without that the block lands at 192pt and blows the ≤190 budget.
 * `tags.marginTop` stays at 13, inside the owner's 12-14 target.
 */
export const textBlock = {
	block: {
		paddingTop: 16,
		paddingHorizontal: 18,
		paddingBottom: 18,
	},
	address: { marginTop: 8 },
	tags: { marginTop: 13 },
	divider: { marginTop: 12 },
	ctaSlot: { marginTop: 8 },
} as const;

/**
 * The hairline under the chip row. 1pt rather than
 * `StyleSheet.hairlineWidth` because this module is deliberately
 * react-native-free (see the header) and the height is part of the block's
 * arithmetic above.
 */
export const DIVIDER_HEIGHT = 1;

/**
 * The media box's inset inside the white card (owner, 2026-08-14: the video
 * and the text below it read as two separate cards).
 *
 * The media is NOT full-bleed: `redline.card` paper shows above it and down
 * both sides, so the video reads as an image card EMBEDDED in the listing
 * card rather than a photo with a caption bolted underneath.
 *
 * `marginHorizontal` MUST equal `textBlock.block.paddingHorizontal` — the
 * whole point is that the video's left and right edges line up with the price,
 * the address and the tags. `listing-layout.test.ts` asserts the equality so
 * the two cannot drift.
 *
 * There is no `marginBottom`: the text block's own 16pt `paddingTop` is the
 * gap under the video, and adding a margin here would double it.
 */
export const media = {
	marginTop: 14,
	marginHorizontal: textBlock.block.paddingHorizontal,
	/** Nested inside the card's 28pt radius; 20 keeps the corners concentric. */
	borderRadius: 20,
} as const;
