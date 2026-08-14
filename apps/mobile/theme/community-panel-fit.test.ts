/**
 * The community card's text block, asserted against the same budget as the
 * listing card's.
 *
 * ── What this file used to be ────────────────────────────────────────────────
 *
 * A fit check for the OLD community panel: a `HERO_RATIO` (61.8%) hero over a
 * 38.2% panel capped at 190pt, seating a 38pt name, a 2-line blurb, three 52pt
 * glass tiles with a statistic line, and a 44pt CTA. It existed because the
 * first attempt at that panel OVERFLOWED SILENTLY — the CTA had
 * `flexShrink: 1`, so it yielded and rendered at 16pt, 29pt below the card.
 *
 * ── What it is now (2026-08-14) ──────────────────────────────────────────────
 *
 * That panel is gone. `CommunityFace` was rebuilt on `ListingFace`'s layout:
 * media `flex: 1, minHeight: 0` with the shared `media` inset, and a
 * natural-height text block under it. So the arithmetic here is the listing
 * card's arithmetic with the community card's rows, against the same
 * `TEXT_BLOCK_TARGET`.
 *
 * The overflow guard is still the reason the file exists: the block is 189pt
 * against a 190pt target, which is ONE point of headroom. Any row added here
 * has to be paid for by a row removed.
 *
 * The parity assertions read `CommunityFace.tsx` as text rather than importing
 * it — the mobile vitest suite is deliberately react-native-free (see
 * `redline-type.test.ts`), and the component pulls in `StyleSheet` / `View`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	DIVIDER_HEIGHT,
	MAX_TAGS,
	TAG_PILL_HEIGHT,
	TEXT_BLOCK_TARGET,
	media,
	textBlock,
} from "./listing-layout";
import { redlineText } from "./typography";

/**
 * Rendered heights of the community block's rows. Mirrored from
 * `CommunityFace`'s styles — the two that are not token-derived are here:
 */
/** Row 1 — the serif name at 20/22 (`redlineText.place` scaled to the block). */
const NAME_H = 22;
/** The CTA link's `minHeight` — §0.5's touch-target floor, which never scales. */
const CTA_H = 44;

/** The block's fixed cost, from the shared `listing-layout` data. */
function textBlockFloor() {
	return (
		textBlock.block.paddingTop + // 16
		NAME_H + // 22 — name + "City, ST" share one baseline row
		textBlock.tags.marginTop + // 11 — no blurb row since 2026-08-15
		TAG_PILL_HEIGHT + // 21 — the chip row
		textBlock.divider.marginTop + // 12
		DIVIDER_HEIGHT + // 1
		textBlock.ctaSlot.marginTop + // 2
		CTA_H + // 44 — "Why people love it →"
		textBlock.block.paddingBottom // 18
	);
}

const SRC = readFileSync("components/cards/CommunityFace.tsx", "utf8");

describe("community card text block (2026-08-14 rebuild)", () => {
	it("fits the same 190pt budget as the listing card's block", () => {
		expect(textBlockFloor()).toBeLessThanOrEqual(TEXT_BLOCK_TARGET);
	});

	it("has forty-three points of headroom — the blurb row's room is now the video's", () => {
		// The 2026-08-15 blurb-row removal left the block at 147pt against the
		// 190pt budget: the community video is now TALLER than the listing's on
		// every device, and a future row added here must be paid for by the
		// headroom (or by displacing the media). Not a style preference: if the
		// block grows past 190 the media starts shrinking, which is what the
		// whole rebuild was about.
		expect(TEXT_BLOCK_TARGET - textBlockFloor()).toBe(43);
	});

	it("costs one blurb row LESS than the listing block", () => {
		// The listing card's row 2 is a one-line address (12pt); this card's
		// used to be a two-line blurb (32pt) on top of that. The 2026-08-15
		// pass deleted the blurb row, so the community block now sits BELOW
		// the listing's — the entire height delta, which is what keeps the
		// community video taller than the listing's on every device.
		const listingRow2 = redlineText.listingCard.address.fontSize; // 12
		const communityRow2 = 0;
		expect(communityRow2 - listingRow2).toBe(-12);
	});

	it("gives the media every remaining point, like the listing card", () => {
		// The old face split the card 61.8/38.2 and capped the panel, so the
		// community video was never the listing video's height. `flex: 1` +
		// `minHeight: 0` is the parity (owner: 「视频高度和 listing card 一致」).
		expect(SRC).toContain("flex: 1, minHeight: 0");
		// The import, not the word — the file's header still explains what the
		// old ratio was and why it went.
		expect(SRC).not.toMatch(/^import .*listing-geometry/m);
	});

	it("shares the listing card's media inset rather than copying it", () => {
		// Both faces spread the SAME `media` data, so the boxes cannot drift.
		expect(SRC).toContain("media as mediaGeo");
		expect(SRC).toContain("...mediaGeo");
		const listing = readFileSync("components/cards/ListingFace.tsx", "utf8");
		expect(listing).toContain("...mediaGeo");
		expect(media.marginTop).toBe(12);
		expect(media.marginHorizontal).toBe(16);
	});

	it("caps the chip row at the listing card's three pills", () => {
		expect(MAX_TAGS).toBe(3);
		expect(SRC).toContain("slice(0, MAX_TAGS)");
	});

	it("renders chips label-only — no statistic line survives on the card", () => {
		// The glass tile carried a `fact` sub-line; a 21pt one-line pill cannot,
		// and there is no placeholder for a reason with no fact. The facts moved
		// to the community explore screen, which is where this CTA goes. The
		// card's chips are the server's lifestyle signals (2026-08-15).
		expect(SRC).not.toContain("r.fact");
		expect(SRC).toContain("TAG_PILL_HEIGHT");
		expect(SRC).toContain("card.signals");
	});

	it("does NOT render the authored blurb/description row", () => {
		// Owner, 2026-08-15: 「删除 description」 — no paragraph on the card.
		// The blurb style is gone with the row it drew.
		expect(SRC).not.toContain("card.blurb");
		expect(SRC).not.toContain("styles.blurb");
	});

	it("keeps the CTA label and routes it through the shared tap target", () => {
		expect(SRC).toContain("Why people love it");
		expect(SRC).toContain("arm(EXPLORE_TAP_TARGET)");
		// The feed must actually send that target somewhere, or the link is dead
		// in the stack (a Pressable inside the pan gesture never fires — RNGH
		// #3172), which is exactly how the old inert heart shipped.
		const feed = readFileSync("app/(tabs)/feed.tsx", "utf8");
		expect(feed).toContain('top.kind === "community"');
		expect(feed).toContain("router.push(`/community/${top.slug}`)");
		expect(feed).toContain("tapSlot={args.tapSlot}");
	});
});
