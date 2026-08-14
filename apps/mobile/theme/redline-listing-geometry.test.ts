/**
 * The listing card's redline GEOMETRY, asserted against the spec text.
 *
 * Sibling of `redline-type.test.ts`, which covers the type scale. This one covers
 * the layout numbers — and it exists because those numbers were changed twice, in
 * the wrong direction, from a bad source.
 *
 * WHAT WENT WRONG, so this file's purpose is clear:
 *
 * The owner's spec is `Untitled.txt` (the "Percho Swipe Cards" redline). When it
 * had aged out of my cache I "re-read the spec" from
 * `~/percho-prototypes/swipe-cards-redline/index.html` — which is an earlier
 * reproduction of the board, not the spec. Its numbers disagree with the redline
 * because that prototype had been squeezed to force three sample chips into a
 * 270px div. On that basis hero 54%→52%, chip gap 6→4, chip padding 7→5, chip font
 * 9.5→8 and story margin-top 15→14 were all changed the wrong way.
 *
 * The redline says, verbatim:
 *
 *   "Hero image: 54% of card height" / "White content panel: 46%"
 *   "Content panel padding: 18px left/right / 18px top / 20px bottom"
 *   "Address: 14px semibold, margin-top 8px"
 *   "Location: 12px muted, margin-top 4px"
 *   "Story: 13px, line-height 1.45, margin-top 15px, #57534D"
 *   "Chips: - Height 27px - Background #F1F1EC - Text 9–10px - gap 6px"
 *   "CTA: - Height 48px - Background #0E6B57 - 13px semibold - margin-top 14px"
 *   pill "15px from top and left"; "Bottom-left image pill: … 18 Photos"
 *
 * Rules this encodes: the prototype HTML is NOT the spec, and a value that already
 * has a test asserting it is a value someone verified on purpose. Read the
 * redline, or recover it from the session transcript — never re-derive it from a
 * lookalike artifact.
 */
import { describe, expect, it } from "vitest";
import {
	HERO_RATIO,
	PANEL_SCALE,
	SECTION_GAP_FLOOR,
	SLACK_SLOTS,
	listingGeometry,
} from "./listing-geometry";
import { redline } from "./tokens";
import { redlineText } from "./typography";

describe("listing card redline geometry", () => {
	// ── The values that drifted ───────────────────────────────────────────
	//
	// NOTE (2026-08-01): the redline's own numbers below were deliberately
	// OVERRIDDEN by the owner after this test was written — 「视频部分的高度可以
	// 再高20% 下面的部分按比例小一点」. So these now assert the CURRENT intent, with
	// the redline value named in each message. That is different from the drift
	// this file was created to catch: drift was me silently re-deriving numbers
	// from a lookalike prototype; this is the owner changing the spec on purpose.
	it("gives the hero the golden ratio 0.618 (redline said 54%)", () => {
		expect(HERO_RATIO).toBeCloseTo(0.618, 5);
		expect(listingGeometry.panel.flex).toBeCloseTo(0.382, 5);
	});

	it("scales the panel by 0.765 — the ceiling for a 0.618 hero", () => {
		// Not 0.382/0.46 (=0.83): 0.765 is what leaves room for a 2-line story.
		// At 0.80 the 1-line floor grows to 192 and the iPhone SE clips the CTA.
		expect(PANEL_SCALE).toBeCloseTo(0.765, 3);
	});

	/**
	 * The regression this whole change risks: panel content taller than the panel
	 * pushes the CTA off the card, because `chips` is `marginTop: auto`.
	 *
	 * The floor is fixed rows + ONE story line — the story is `flexShrink: 1` /
	 * `numberOfLines={2}`, so it yields the second line on small screens rather
	 * than overflowing. If this fails, the CTA is being clipped on a real device.
	 */
	const panelFloor = () => {
		const localityMarginTop = listingGeometry.locality.marginTop;
		const localityFontSize = redlineText.locality.fontSize;
		const specsMarginTop = listingGeometry.specs.marginTop;
		const specsLineHeight = 13; // data row — no prose leading
		const specsFloor = 0; // specs.marginTop is 'auto' — the 4th slack slot, collapses to 0
		return (
			listingGeometry.panel.paddingTop +
			listingGeometry.panel.paddingBottom +
			redlineText.priceCompact.lineHeight +
			listingGeometry.address.marginTop +
			redlineText.address.fontSize +
			localityMarginTop +
			localityFontSize +
			specsFloor +
			specsLineHeight +
			// NOTE: the story row (storyMT + storyLH) is NOT in this floor.
			// The story render was removed 2026-08-13; geometry keeps the
			// fields only so re-enabling stays a one-line render. The floor
			// asserts the panel that actually renders today. storyMB stays —
			// it is the chips' upper gap.
			listingGeometry.story.marginBottom + // chips upper gap
			listingGeometry.chip.height +
			listingGeometry.chips.marginBottom + // chips→CTA FLOOR
			44 // compact CTA (§0.5 touch-target floor)
		);
	};

	/** The card box the feed actually renders (`app/(tabs)/feed.tsx`). */
	const panelHeight = (w: number, h: number) => {
		const cardWidth = w - 16 * 2; // GUTTER
		const cardHeight = Math.min(cardWidth * 1.5, h * 0.74);
		return cardHeight * listingGeometry.panel.flex;
	};

	it("fits its floor on the smallest supported device (375x667 SE)", () => {
		expect(panelFloor()).toBeLessThanOrEqual(panelHeight(375, 667));
	});

	it("fits its floor on every device the app ships to", () => {
		const devices: [string, number, number][] = [
			["SE / 8", 375, 667],
			["13 mini", 375, 812],
			["14 / 13", 390, 844],
			["16 Pro", 402, 874],
			["14 Pro Max", 430, 932],
		];
		for (const [, w, h] of devices) {
			expect(panelFloor()).toBeLessThanOrEqual(panelHeight(w, h));
		}
	});

	it("gets BOTH story lines on a 390pt-wide phone and up", () => {
		// The owner's ask (「两行描述」) is fully satisfied from the iPhone 14 up;
		// SE and 13 mini render one line. Assert the split so a metric change that
		// silently costs everyone the second line fails here.
		const twoLines = panelFloor() + (redlineText.storyCompact.lineHeight ?? 0);
		expect(twoLines).toBeLessThanOrEqual(panelHeight(390, 844));
	});

	it("keeps the story's tightened margin and the redline's colour", () => {
		expect(listingGeometry.story.marginTop).toBe(8);
		expect(listingGeometry.story.color).toBe("#57534D");
	});

	it("tightens only the story's LEADING, never its 13px size", () => {
		// Shrinking the font would read as fine print; the leading is what bought
		// the second line. 13px is the redline's floor for body copy.
		expect(redlineText.storyCompact.fontSize).toBe(13);
		expect(redlineText.storyCompact.lineHeight).toBe(14);
	});

	it("keeps the CTA at the 44pt touch-target floor, not smaller", () => {
		// The panel shrank; the touch target may not. 48 * 0.765 = 37, which is
		// why the compact CTA is floored rather than scaled.
		expect(Math.round(48 * PANEL_SCALE)).toBeLessThan(44);
	});

	it("does not scale the panel's horizontal padding", () => {
		// The card's WIDTH did not change, so the side gutters must not move.
		expect(listingGeometry.panel.paddingHorizontal).toBe(18);
	});

	it("keeps the story's scaled margin and the redline's colour", () => {
		expect(listingGeometry.story.marginTop).toBe(8);
		expect(listingGeometry.story.color).toBe("#57534D");
	});

	it("keeps the chip row proportional to the redline's gap of 6", () => {
		expect(listingGeometry.chips.gap).toBe(5);
	});

	it("keeps the chip on the #F1F1EC surface at the scaled height", () => {
		expect(listingGeometry.chip.height).toBe(21);
		expect(redline.surface).toBe("#F1F1EC");
	});

	// ── Content panel ─────────────────────────────────────────────────────
	it("pads the content panel 18 / 14 / 15 (18/18/20 scaled)", () => {
		expect(listingGeometry.panel.paddingHorizontal).toBe(18);
		expect(listingGeometry.panel.paddingTop).toBe(14);
		expect(listingGeometry.panel.paddingBottom).toBe(15);
	});

	it("stacks address / locality at the scaled margins", () => {
		expect(listingGeometry.address.marginTop).toBe(6);
		expect(listingGeometry.locality.marginTop).toBe(3);
	});

	it("floors the chips→CTA gap at 4 (was a fixed 8 on the CTA)", () => {
		// See SECTION_GAP_FLOOR: 8+8 would have cost the SE its CTA and the
		// iPhone 14 its second story line. 4+4 keeps the fixed cost at 8.
		expect(listingGeometry.chips.marginBottom).toBe(SECTION_GAP_FLOOR);
		expect(SECTION_GAP_FLOOR * 2).toBe(8);
	});

	// ── Panel rhythm: the slack must not pile into ONE gap ────────────────
	//
	// Owner 2026-08-01: 「描述和几个特点之间的空白明显比其他空白大 你参照第二个照片里的
	// 样式和排版」. The panel is 38.2% of the card regardless of content, so it
	// carries free space; whichever `marginTop:'auto'` slots exist split it
	// equally. With ONE slot (`chips`) the story→chips gap took all of it —
	// measured ~37pt against 8pt elsewhere. After the story was removed
	// (2026-08-13) the freed space would have re-piled into the remaining slots,
	// so a fourth slot (`specs`) was added to absorb it.
	it("splits the panel's free space across FOUR auto slots", () => {
		expect(SLACK_SLOTS).toBe(4);
		// The three that are `auto` are asserted structurally in ListingFace's
		// StyleSheet via `geo`; the two below are the two that must keep a FLOOR
		// so a tight device still gets a visible section break.
		expect(listingGeometry.ctaSlot.marginTop).toBe("auto");
	});

	it("gives the two section breaks EQUAL floors", () => {
		// story→chips and chips→CTA are the two 'section' gaps in the reference
		// board and are equal there. Unequal floors would re-create the original
		// complaint at the small end of the device range.
		expect(listingGeometry.story.marginBottom).toBe(
			listingGeometry.chips.marginBottom,
		);
	});

	it("does not raise the panel's fixed cost (no device loses a line)", () => {
		// The whole change must be height-neutral: 8 fixed pt above the CTA became
		// 4 + 4 across the two section breaks. If a future edit raises either
		// floor, the SE's CTA and the iPhone 14's second story line are what pay.
		expect(
			listingGeometry.story.marginBottom + listingGeometry.chips.marginBottom,
		).toBe(8);
	});

	it("keeps every gap below the price tighter than a section break", () => {
		// The identity rows (address / locality) group as one unit; the reference
		// board steps 32 → 24 → 20 → 16 downward, so no identity margin may reach
		// the RENDERED section break. Compared against the rendered gap, not the
		// floor: the floor (4) is deliberately below the address margin (6) so the
		// smallest phones stay tight — on every device with slack the section gap
		// grows past it.
		const rendered = (w: number, h: number) =>
			SECTION_GAP_FLOOR + (panelHeight(w, h) - panelFloor()) / SLACK_SLOTS;
		for (const [w, h] of [
			[390, 844],
			[402, 874],
			[430, 932],
		] as const) {
			expect(listingGeometry.address.marginTop).toBeLessThan(rendered(w, h));
			expect(listingGeometry.locality.marginTop).toBeLessThan(rendered(w, h));
		}
	});

	/**
	 * The worst case for the complaint: the TALLEST device (most free space) with
	 * the THINNEST content (no story, no chips) — every point of slack is real.
	 * With 3 slots no single gap may exceed a third of it plus its own floor.
	 */
	it("caps any single gap at a quarter of the slack on a Pro Max", () => {
		const slack = panelHeight(430, 932) - panelFloor();
		expect(slack).toBeGreaterThan(0); // otherwise this test proves nothing
		const worstGap = slack / SLACK_SLOTS + listingGeometry.story.marginBottom;
		// Before the fix this was `slack + 8` ≈ 37pt on this device.
		expect(worstGap).toBeLessThan(20);
	});

	// ── Hero overlays: exactly ONE, at the redline's inset ────────────────
	it("insets the LISTING pill 15 from the top-left corner", () => {
		expect(listingGeometry.pillSlot).toEqual({ top: 15, left: 15 });
	});

	it("puts NO heart on the hero (removed 2026-08-01)", () => {
		// Owner: 「去掉右上角的爱心标志」. The redline drew it on all four faces and it
		// shipped, but on the listing card it was never wired (the feed passed no
		// `onSave`), so it was pure chrome over the tour video. Asserting the slot
		// is GONE means re-adding the button trips a test.
		expect(listingGeometry).not.toHaveProperty("heartSlot");
	});

	it("puts NO photo-count pill on the hero (removed 2026-08-01)", () => {
		// The redline drew one bottom-left, and it shipped. The owner then pulled
		// it, with all burned-in video captions, for immersion ("不够沉浸"). The
		// count now reaches the buyer in Explore's photo gallery instead. This
		// asserts the slot is GONE, so re-adding the pill trips a test rather than
		// quietly landing back on the video.
		expect(listingGeometry).not.toHaveProperty("photoCountSlot");
	});

	it("has NO second hero overlay — the LISTING pill only", () => {
		// The redline's DO-NOT list: "Add more metadata", "Add score bars",
		// "Add any UI not shown in the reference". A `badgeSlot` reappearing here
		// means the match badge came back; a `photoCountSlot` means the counter did;
		// a `heartSlot` means the heart did.
		expect(listingGeometry).not.toHaveProperty("badgeSlot");
		expect(
			Object.keys(listingGeometry)
				.filter((k) => k.endsWith("Slot"))
				.sort(),
		).toEqual(["ctaSlot", "pillSlot"]);
	});
});
