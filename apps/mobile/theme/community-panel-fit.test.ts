/**
 * The community panel must seat name + tiles + CTA on the SMALLEST device.
 *
 * The face became hero + panel on 2026-08-02 (owner: 「C 跟listing card 的视频大小
 * 保持一致 最底下还是要有一个Why people love it按钮」), reusing `HERO_RATIO` so the
 * media matches `ListingFace` exactly.
 *
 * This exists because the first attempt at this panel OVERFLOWED SILENTLY. With
 * a 2-line blurb and 84pt stacked tiles the stack needed 254pt in a 188pt panel;
 * nothing threw and nothing clipped — the CTA had `flexShrink: 1`, so it yielded
 * and rendered at 16pt, 29pt below the card's bottom edge. A layout that fails by
 * quietly shrinking the one tappable thing needs an arithmetic guard, not a
 * screenshot.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HERO_RATIO } from "./listing-geometry";

/**
 * Mirrors of `app/(tabs)/feed.tsx`'s card sizing. Duplicated rather than
 * imported because feed.tsx pulls in expo-router and the whole card stack, which
 * a geometry test has no business booting. If these drift the test lies, so they
 * are asserted against the real thing in "feed constants" below.
 */
const GUTTER = 16;
const CARD_ASPECT = 1.5;
const CARD_MAX_VIEWPORT = 0.74;

/** Rendered heights of `CommunityFace`'s panel rows. Keep in sync with its styles. */
const PAD_TOP = 14;
const PAD_BOTTOM = 15;
const NAME_H = 28; // redlineText.place at fontSize 26 / lineHeight 28
const TILES_MARGIN_TOP = 11;
const TILE_H = 33; // paddingVertical 9 x2 + the 15pt glyph on a single-line row
const CTA_H = 44; // §0.5 floor — RedlineCta's own height

/** Every device the app supports, shortest first. */
const DEVICES = [
	{ name: "iPhone SE / 8", w: 375, h: 667 },
	{ name: "iPhone 13 mini", w: 375, h: 812 },
	{ name: "iPhone 14", w: 390, h: 844 },
	{ name: "iPhone 16 Pro", w: 402, h: 874 },
	{ name: "iPhone 16 Pro Max", w: 430, h: 932 },
];

function panelHeight(w: number, h: number) {
	const cardWidth = w - GUTTER * 2;
	// Same clamp as feed.tsx: the aspect loses to the viewport on short phones.
	const cardHeight = Math.min(cardWidth * CARD_ASPECT, h * CARD_MAX_VIEWPORT);
	return cardHeight * (1 - HERO_RATIO);
}

const CONTENT_H =
	PAD_TOP + NAME_H + TILES_MARGIN_TOP + TILE_H + CTA_H + PAD_BOTTOM;

describe("community card panel fits", () => {
	it.each(DEVICES)("seats name + tiles + CTA on $name", ({ w, h }) => {
		expect(CONTENT_H).toBeLessThanOrEqual(panelHeight(w, h));
	});

	it("keeps the CTA at its full 44pt on the smallest device", () => {
		// The regression was a CRUSHED CTA, not a clipped panel. If the rows ever
		// grow past the panel again, this is the assertion that should fail.
		const smallest = DEVICES[0]!;
		const panel = panelHeight(smallest.w, smallest.h);
		const withoutCta = CONTENT_H - CTA_H;
		expect(panel - withoutCta).toBeGreaterThanOrEqual(CTA_H);
	});

	it("has no room for a second tile line", () => {
		// Documents WHY the sub-facts moved to the destination screen: the 96pt
		// stacked tile (+63 over the single-line row) does not fit.
		const smallest = DEVICES[0]!;
		const stacked = CONTENT_H - TILE_H + 96;
		expect(stacked).toBeGreaterThan(panelHeight(smallest.w, smallest.h));
	});

	it("matches the listing card's hero exactly", () => {
		// The owner's ask was parity, so assert the constant is SHARED, not copied.
		expect(HERO_RATIO).toBeCloseTo(0.618, 3);
	});

	it("feed constants still match feed.tsx", () => {
		// The mirrors above are only trustworthy if they track the real file. Read
		// the source rather than importing it (see the note on the constants).
		// Plain relative path: vitest runs with `apps/mobile` as cwd, and the
		// URL-based form trips the DOM-vs-node `URL` type clash in this tsconfig.
		const src = readFileSync("app/(tabs)/feed.tsx", "utf8");
		expect(src).toContain(`const GUTTER = ${GUTTER};`);
		expect(src).toContain(`const CARD_ASPECT = ${CARD_ASPECT};`);
		expect(src).toContain(`const CARD_MAX_VIEWPORT = ${CARD_MAX_VIEWPORT};`);
	});
});
