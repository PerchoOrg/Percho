/**
 * The community card's immersive full-bleed layout, asserted as text.
 *
 * ── What this file used to be ────────────────────────────────────────────────
 *
 * A fit check for the OLD community panel: a `HERO_RATIO` (61.8%) hero over a
 * 38.2% panel capped at 190pt, seating a 38pt name, a 2-line blurb, three 52pt
 * glass tiles with a statistic line, and a 44pt CTA. It existed because the
 * first attempt at that panel OVERFLOWED SILENTLY — the CTA had
 * `flexShrink: 1`, so it yielded and rendered at 16pt, 29pt below the card.
 *
 * ── What it is now (2026-08-14 → 2026-08-16) ─────────────────────────────────
 *
 * 2026-08-14: `CommunityFace` was rebuilt on `ListingFace`'s layout — media
 * `flex: 1, minHeight: 0` with the shared `media` inset, and a natural-height
 * text block under it. So the arithmetic here was the listing card's
 * arithmetic with the community card's rows, against the same
 * `TEXT_BLOCK_TARGET`. The overflow guard was still the reason the file
 * existed: the block was 189pt against a 190pt target, ONE point of headroom.
 *
 * 2026-08-16 (Tia): the community card became an immersive full-bleed card
 * like the CITY card — media fills the entire card, the white text block is
 * gone, and the name + chips + CTA sit on a bottom scrim. The text-block
 * arithmetic is obsolete (there is no block), so this file now asserts the
 * new composition as text: full-bleed media, the scrim, the white-on-photo
 * info, the kept COMMUNITY badge and bookmark, and the shared tap target.
 *
 * The parity assertions read `CommunityFace.tsx` as text rather than importing
 * it — the mobile vitest suite is deliberately react-native-free (see
 * `redline-type.test.ts`), and the component pulls in `StyleSheet` / `View`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = readFileSync("components/cards/CommunityFace.tsx", "utf8");
const AREA = readFileSync("components/cards/AreaFace.tsx", "utf8");

describe("community card immersive full-bleed layout (2026-08-16)", () => {
	it("fills the card with media — no white text block below", () => {
		// The old face split card into media + white block; the new face has
		// ONE absolutely-filled media layer with the info overlaid. The white
		// container (geo.block / textBlock) must be gone — from the STYLES,
		// not from the history notes in the header.
		expect(SRC).not.toMatch(/styles\.(block|row1|divider|blurb|tile|place)/);
		expect(SRC).not.toMatch(/\.\.\.(textBlock|mediaGeo)/);
		expect(SRC).not.toContain("textBlock as geo");
		expect(SRC).not.toContain("media as mediaGeo");
		expect(SRC).not.toContain("flex: 1, minHeight: 0");
		expect(SRC).toContain('overflow: "hidden"');
	});

	it("carries a bottom scrim like the CITY card", () => {
		expect(SRC).toContain("LinearGradient");
		expect(SRC).toContain("rgba(0,0,0,0.5)");
		expect(SRC).toContain("locations={[0.55, 0.78, 1]}");
		expect(AREA).toContain("locations={[0.55, 0.78, 1]}");
	});

	it("keeps the COMMUNITY badge and the bookmark", () => {
		expect(SRC).toContain("COMMUNITY");
		expect(SRC).toContain("SAVE_TAP_TARGET");
		expect(SRC).toContain("BookmarkIcon");
	});

	it("caps the chip row at TWO pills", () => {
		// Owner 2026-08-17: max 2 lifestyle pills (was 3, borrowed from the
		// listing card's MAX_TAGS — which no longer exists, because the listing
		// card's pills were deleted in the same pass). The cap is local to this
		// face now, and EVERY one of the four label sources must respect it, or
		// a community with reasons-but-no-signals quietly renders three again.
		expect(SRC).toContain("const MAX_COMMUNITY_PILLS = 2");
		expect(SRC).not.toContain("MAX_TAGS");
		expect(SRC.match(/slice\(0, MAX_COMMUNITY_PILLS\)/g)).toHaveLength(4);
	});

	it("renders chips label-only — no statistic line survives on the card", () => {
		// The glass tile carried a `fact` sub-line; a white one-line pill
		// cannot, and there is no placeholder for a reason with no fact. The
		// facts moved to the community explore screen, which is where the CTA
		// goes. The card's chips are the server's lifestyle signals.
		expect(SRC).not.toContain("r.fact");
		expect(SRC).toContain("PILL_HEIGHT");
		expect(SRC).toContain("card.signals");
	});

	it("does NOT render the authored blurb/description row", () => {
		// Owner, 2026-08-15: 「删除 description」 — no paragraph on the card.
		// The blurb style is gone with the row it drew.
		expect(SRC).not.toContain("card.blurb");
		expect(SRC).not.toContain("styles.blurb");
	});

	it("keeps the CTA label and routes it through the shared tap target", () => {
		// Owner, 2026-08-16: CTA → "Explore →" (the old "Why people love it"
		// text link is gone with the white block). The header's history note
		// may still mention the old copy — the STYLES and the render must not.
		expect(SRC).toContain("Explore");
		expect(SRC).not.toContain('Why people love it">');
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
