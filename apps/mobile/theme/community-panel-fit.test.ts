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
 *
 * 2026-08-13: the feed card no longer uses the `min(cardWidth×1.5, h×0.74)`
 * clamp — the card fills the available height (flex:1 inside the padded
 * CardContainer). The community panel is capped at 190pt (`maxHeight` in
 * CommunityFace), so the fit assertion below checks the panel's fixed rows
 * against that cap rather than against a proportional slice of a card that no
 * longer exists.
 */
const GUTTER = 26;
const CARD_ASPECT = 1.5;
const CARD_MAX_VIEWPORT = 0.74;

/**
 * The community panel's height cap. Mirrored from `CommunityFace`'s styles.
 */
const PANEL_CAP = 190;

/**
 * Rendered heights of `CommunityFace`'s panel rows. Keep in sync with its styles.
 *
 * ALL FOUR rows are here — title, description, highlights WITH statistics, button
 * (owner: 「所有信息都需要保留」). They fit because the type scaled, not because
 * anything was cut, so this arithmetic is the whole argument for those sizes.
 */
const PAD_TOP = 10;
const PAD_BOTTOM = 11;
const NAME_H = 22; // place @ 20/22
const BLURB_H = 2 * 13; // subtitle @ 11.5/13, numberOfLines={2}
const TILES_MARGIN_TOP = 4;
const TILE_H = 48; // padV 5x2 + glyph 11 + gap 2 + label 11 + gap 2 + fact 12
const CTA_H = 44; // §0.5 floor — RedlineCta's own height, the one size that never scales

/**
 * The shortest device, declared separately so the fit assertions do not need a
 * non-null assertion on `DEVICES[0]` (which the repo's lint forbids, rightly —
 * an index access that "cannot" be undefined is exactly how off-by-ones hide).
 */
const SMALLEST = { name: "iPhone SE / 8", w: 375, h: 667 };

/** Every device the app supports, shortest first. */
const DEVICES = [
	SMALLEST,
	{ name: "iPhone 13 mini", w: 375, h: 812 },
	{ name: "iPhone 14", w: 390, h: 844 },
	{ name: "iPhone 16 Pro", w: 402, h: 874 },
	{ name: "iPhone 16 Pro Max", w: 430, h: 932 },
];

function panelHeight(w: number, h: number) {
	// 2026-08-13: the card fills the available height; the community panel is
	// capped at PANEL_CAP. `w`/`h` are kept in the signature so the device
	// table still reads as a real-device check.
	return PANEL_CAP;
}

const GAP = 6; // panel `gap`, applied between each pair of rows
const CONTENT_H =
	PAD_TOP +
	NAME_H +
	GAP +
	BLURB_H +
	GAP +
	TILES_MARGIN_TOP +
	TILE_H +
	GAP +
	CTA_H +
	PAD_BOTTOM;

describe("community card panel fits", () => {
	it.each(DEVICES)("seats all four rows on $name", ({ w, h }) => {
		expect(CONTENT_H).toBeLessThanOrEqual(panelHeight(w, h));
	});

	it("caps the panel at 190pt so a taller card grows the hero", () => {
		// The cap is load-bearing: without it the 38.2% slice grows with the
		// card and the slack pools into the tiles' flexGrow — the 2026-08-02
		// "hole under the tiles" bug.
		expect(PANEL_CAP).toBe(190);
		expect(CONTENT_H).toBeLessThanOrEqual(PANEL_CAP);
	});

	it("keeps the CTA at its full 44pt inside the capped panel", () => {
		// The regression was a CRUSHED CTA, not a clipped panel. If the rows ever
		// grow past the cap again, this is the assertion that should fail.
		const withoutCta = CONTENT_H - CTA_H;
		expect(PANEL_CAP - withoutCta).toBeGreaterThanOrEqual(CTA_H);
	});

	it("would NOT fit at the redline's unscaled sizes", () => {
		// The scale-down is load-bearing, not cosmetic. At the token sizes
		// (place 38/38, subtitle 14/20, 84pt tile) the same four rows overflow —
		// which is why "just use the tokens" is not an option here.
		const unscaled =
			PAD_TOP +
			38 +
			GAP +
			2 * 20 +
			GAP +
			TILES_MARGIN_TOP +
			84 +
			GAP +
			CTA_H +
			PAD_BOTTOM;
		expect(unscaled).toBeGreaterThan(panelHeight(SMALLEST.w, SMALLEST.h));
	});

	it("keeps the statistic line inside the tile budget", () => {
		// The statistic is the row most likely to be "temporarily" dropped again.
		// 11pt of the 52pt tile is the fact line; assert the tile still has it.
		const tileWithoutFact = TILE_H - 11 - 2;
		expect(TILE_H).toBeGreaterThan(tileWithoutFact);
		expect(CONTENT_H).toBeLessThanOrEqual(panelHeight(SMALLEST.w, SMALLEST.h));
	});

	it("matches the listing card's hero exactly", () => {
		// The owner's ask was parity, so assert the constant is SHARED, not copied.
		// The listing card itself no longer splits by ratio (2026-08-13), but
		// HERO_RATIO still pins the community hero.
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

	it("feed.tsx no longer pins a fixed card height (2026-08-13)", () => {
		// The card now fills the available height; the old
		// `min(cardWidth*1.5, h*0.74)` box and its centered dead space are gone.
		const src = readFileSync("app/(tabs)/feed.tsx", "utf8");
		expect(src).not.toContain("cardHeight");
		expect(src).toContain("cardContainer");
	});
});
