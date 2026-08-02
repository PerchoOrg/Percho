/**
 * The community card's panel must seat its rows on the SMALLEST device.
 *
 * The face became hero + panel on 2026-08-02 (owner: 「横图要截取完全占据视频区域
 * 也就是卡片的0.618高度」), which means it inherited `ListingFace`'s failure mode:
 * the panel is a fixed PROPORTION of the card, so growing a row silently pushes
 * the CTA off the bottom edge on an SE. That bug was fixed twice on the listing
 * face before it got a test; this one gets the test up front.
 *
 * No react-native import — the suite is deliberately RN-free, so the geometry is
 * asserted as arithmetic over the same constants the component spreads.
 */
import { describe, expect, it } from "vitest";
import { HERO_RATIO } from "./listing-geometry";

/** `app/(tabs)/feed.tsx` — card is `min(width - 2*GUTTER) * 1.5, height * 0.74)`. */
const GUTTER = 16;
const CARD_ASPECT = 1.5;
const CARD_MAX_VIEWPORT = 0.74;

/** `styles.panel` + `styles.tile` + `styles.ctaSlot` in `CommunityFace.tsx`. */
const PANEL_PADDING_TOP = 14;
const PANEL_PADDING_BOTTOM = 15;
const CTA_HEIGHT = 48;
const CTA_MARGIN_TOP = 12;
const TILE_H = 84;
/** `TILE_H_WITH_FACT` — the row grows when any reason carries a sub-fact. */
const TILE_H_WITH_FACT = 96;

const DEVICES = {
	"iPhone SE / 8": [375, 667],
	"iPhone 13 mini": [375, 812],
	"iPhone 14 / 13": [390, 844],
	"iPhone 16 Pro": [402, 874],
	"iPhone 14 Pro Max": [430, 932],
} as const;

function panelHeight(w: number, h: number): number {
	const cardWidth = w - GUTTER * 2;
	const cardHeight = Math.min(cardWidth * CARD_ASPECT, h * CARD_MAX_VIEWPORT);
	return cardHeight * (1 - HERO_RATIO);
}

function panelNeeds(tileHeight: number): number {
	return (
		PANEL_PADDING_TOP +
		tileHeight +
		CTA_MARGIN_TOP +
		CTA_HEIGHT +
		PANEL_PADDING_BOTTOM
	);
}

describe("CommunityFace panel fit", () => {
	// 96 is the real worst case, not an edge case: 42.8% of communities resolve
	// exactly one sub-fact and the whole row grows together.
	for (const [name, [w, h]] of Object.entries(DEVICES)) {
		it(`seats a fact-bearing tile row + CTA on ${name}`, () => {
			expect(panelNeeds(TILE_H_WITH_FACT)).toBeLessThanOrEqual(
				panelHeight(w, h),
			);
		});
	}

	it("has the tightest margin on the smallest device", () => {
		const [w, h] = DEVICES["iPhone SE / 8"];
		const slack = panelHeight(w, h) - panelNeeds(TILE_H_WITH_FACT);
		// 3.5pt. Documented so the next person sees how little room is left before
		// adding a row — not a target to optimise.
		expect(slack).toBeGreaterThan(0);
		expect(slack).toBeLessThan(6);
	});

	it("the plain tile row keeps real headroom everywhere", () => {
		for (const [w, h] of Object.values(DEVICES)) {
			expect(panelNeeds(TILE_H)).toBeLessThanOrEqual(panelHeight(w, h) - 10);
		}
	});

	it("the cover's render size matches the hero box it fills", () => {
		// The cover is rendered 1080x1000 by `scripts/ken-burns`. If HERO_RATIO
		// ever moves, that render is wrong and the video letterboxes again.
		const heroAspect = 1 / (CARD_ASPECT * HERO_RATIO);
		expect(1080 / 1000).toBeCloseTo(heroAspect, 2);
	});
});
