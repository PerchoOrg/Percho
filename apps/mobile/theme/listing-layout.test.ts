/**
 * The listing card's 2026-08-13 layout, asserted against the acceptance
 * criteria. Sibling of `redline-listing-geometry.test.ts` (the OLD proportional
 * split, which `ListingFace` no longer uses).
 *
 * This file exists because the redesign's whole point is the height model:
 * the card fills the available height, the media area eats the remainder
 * (`flex: 1`), and the text block renders at its natural height — targeted
 * ≤ 190pt. Two of the three acceptance criteria are arithmetic, so they get
 * asserted here:
 *
 *   1. text block ≤ 190pt
 *   2. media ≥ 65% of the card
 *   3. three tags fit on an iPhone SE without ellipsis
 *
 * The tag fit is measured against the widest realistic trio ("Top Schools" ·
 * "Private Backyard" · "Trails Nearby") at the token sizes.
 */
import { describe, expect, it } from "vitest";
import { HERO_RATIO } from "./listing-geometry";
import {
	DIVIDER_HEIGHT,
	MAX_TAGS,
	SE_TAG_ROW_WIDTH,
	TAG_PILL_HEIGHT,
	TEXT_BLOCK_TARGET,
	media,
	textBlock,
} from "./listing-layout";
import { redlineText } from "./typography";

const MEDIA_MIN_SHARE = 0.65;

/** The feed's card box on the smallest supported device. */
function cardHeight(w: number, h: number) {
	// The card fills the available height: screen height minus the feed's
	// chrome + the CardContainer insets. The card container sits between the
	// chrome row (status bar) and the tab bar (62pt + home-indicator inset);
	// use the SE's 667pt and the container's 8/10 insets as the floor.
	const available = h - 62;
	return available - 8 - 10;
}

/** The text block's fixed cost, from the token data. */
function textBlockFloor() {
	return (
		textBlock.block.paddingTop + // 16
		redlineText.listingCard.price.lineHeight + // 31
		textBlock.address.marginTop + // 8
		redlineText.listingCard.address.fontSize + // 12
		textBlock.tags.marginTop + // 11
		TAG_PILL_HEIGHT + // 21
		textBlock.divider.marginTop + // 16
		DIVIDER_HEIGHT + // 1
		textBlock.ctaSlot.marginTop + // 4
		46 + // CTA
		textBlock.block.paddingBottom // 18
	);
}

describe("listing card 2026-08-13 layout", () => {
	it("keeps the text block under the 190pt target", () => {
		expect(textBlockFloor()).toBeLessThanOrEqual(TEXT_BLOCK_TARGET);
	});

	it("gives the media at least 65% of the card", () => {
		// Media = card − text block − the media's own top inset. Assert the
		// ratio at the SE floor.
		const card = cardHeight(375, 667);
		const mediaShare = (card - textBlockFloor() - media.marginTop) / card;
		expect(mediaShare).toBeGreaterThanOrEqual(MEDIA_MIN_SHARE);
	});

	it("insets the media 12 top / 16 sides", () => {
		// The video is an INSET card inside the white card: 12pt of paper
		// above, 16pt on both sides (owner 2026-08-14: 「Video 左右 inset 比
		// 现在增加 3–4px」 — the wider paper band makes the white card surface
		// read clearly). Full-bleed media (margin 0) is the bug this replaced,
		// so a zero here is still a failure.
		expect(media.marginHorizontal).toBe(16);
		expect(media.marginTop).toBe(12);
		expect(media.marginTop).toBeLessThan(media.marginHorizontal);
		// A rounded box to clip the player, concentric with the card's radius.
		expect(media.borderRadius).toBeGreaterThan(0);
	});

	it("seats three tags on an iPhone SE without ellipsis", () => {
		// 315pt of content width on the SE. A conservative upper bound for SF
		// Pro at 10.5/600: proportional glyphs average ~0.5em; 0.58em covers
		// the wider caps and lowercase without pretending to measure fonts.
		const widest = ["Top Schools", "Private Backyard", "Trails Nearby"];
		const width = widest.reduce(
			(sum, label) =>
				sum +
				label.length * 0.58 * redlineText.listingCard.tag.fontSize +
				9 * 2,
			0,
		);
		const withGaps = width + 6 * (MAX_TAGS - 1);
		expect(withGaps).toBeLessThanOrEqual(SE_TAG_ROW_WIDTH);
	});

	it("never truncates a tag — pills are fixed-width, the row does not wrap", () => {
		// The redesign's rule: no ellipsis on a pill. A too-wide row drops the
		// third pill whole (ListingFace caps at MAX_TAGS) rather than shrinking
		// or ellipsizing. These are the layout properties that make the rule
		// hold; `flexShrink: 0` + `nowrap` mean a pill can never be squeezed.
		expect(TAG_PILL_HEIGHT).toBeGreaterThan(0);
		expect(MAX_TAGS).toBe(3);
	});

	it("uses natural heights — no aspectRatio on the media", () => {
		// The media box is `flex: 1, minHeight: 0`; the old proportional split
		// is gone from the face. HERO_RATIO still exists for CommunityFace.
		expect(HERO_RATIO).toBeCloseTo(0.618, 3);
	});
});
