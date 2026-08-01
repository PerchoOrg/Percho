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
import { HERO_RATIO, listingGeometry } from "./listing-geometry";
import { redline } from "./tokens";

describe("listing card redline geometry", () => {
	// ── The values that drifted ───────────────────────────────────────────
	it("splits the card 54/46 between hero and content panel", () => {
		expect(HERO_RATIO).toBe(0.54);
		expect(listingGeometry.panel.flex).toBeCloseTo(0.46, 5);
	});

	it("sets the story's margin-top to 15, not 14", () => {
		expect(listingGeometry.story.marginTop).toBe(15);
		expect(listingGeometry.story.color).toBe("#57534D");
	});

	it("keeps the chip row at the redline's gap of 6", () => {
		expect(listingGeometry.chips.gap).toBe(6);
	});

	it("keeps chip height 27 on the #F1F1EC surface", () => {
		expect(listingGeometry.chip.height).toBe(27);
		expect(redline.surface).toBe("#F1F1EC");
	});

	// ── Content panel ─────────────────────────────────────────────────────
	it("pads the content panel 18 / 18 / 20", () => {
		expect(listingGeometry.panel.paddingHorizontal).toBe(18);
		expect(listingGeometry.panel.paddingTop).toBe(18);
		expect(listingGeometry.panel.paddingBottom).toBe(20);
	});

	it("stacks address / locality at the redline's margins", () => {
		expect(listingGeometry.address.marginTop).toBe(8);
		expect(listingGeometry.locality.marginTop).toBe(4);
	});

	it("puts the CTA 14 below the chip row", () => {
		expect(listingGeometry.ctaSlot.marginTop).toBe(14);
	});

	// ── Hero overlays: exactly three, at the redline's insets ─────────────
	it("insets the LISTING pill and the heart 15 from the top corners", () => {
		expect(listingGeometry.pillSlot).toEqual({ top: 15, left: 15 });
		expect(listingGeometry.heartSlot).toEqual({ top: 15, right: 15 });
	});

	it("puts the photo-count pill bottom-left of the hero", () => {
		expect(listingGeometry.photoCountSlot).toEqual({ bottom: 14, left: 15 });
	});

	it("has NO fourth hero overlay — the match badge is not a redline element", () => {
		// The redline's DO-NOT list: "Add more metadata", "Add score bars",
		// "Add any UI not shown in the reference". A `badgeSlot` reappearing here
		// means the badge came back.
		expect(listingGeometry).not.toHaveProperty("badgeSlot");
		expect(
			Object.keys(listingGeometry)
				.filter((k) => k.endsWith("Slot"))
				.sort(),
		).toEqual(["ctaSlot", "heartSlot", "photoCountSlot", "pillSlot"]);
	});
});
