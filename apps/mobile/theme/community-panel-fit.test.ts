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

	it("keeps the COMMUNITY badge, and NO bookmark", () => {
		expect(SRC).toContain("COMMUNITY");
		// The bookmark is gone from this face alone (2026-08-20). Its disc sat
		// at top:12/right:12, which is where the tour video draws the place
		// name and distance — see `_render_label_png` in the render worker. The
		// City and Listing faces keep theirs; neither plays a labelled video.
		expect(SRC).not.toContain("BookmarkIcon");
		expect(SRC).not.toContain("SAVE_TAP_TARGET");
	});

	it("caps the signal glyphs at TWO", () => {
		// Owner 2026-08-17 capped the lifestyle row at 2 (was 3). The row became
		// GLYPHS on 2026-08-22 — "lets add icons to the left of community name
		// for now" — and the cap survived the change of medium, now for a second
		// reason: the glyphs, the name and `Explore` share one line, so every
		// icon is width the name does not get.
		expect(SRC).toContain("const MAX_COMMUNITY_ICONS = 2");
		expect(SRC).not.toContain("MAX_TAGS");
		// The cap is enforced in ONE place — the `push` helper both sources feed
		// — rather than at each call site, which is what a `slice` per source
		// used to require.
		expect(SRC).toContain("out.length >= MAX_COMMUNITY_ICONS");
	});

	it("keeps the glyphs on the name's right, never under it", () => {
		// Owner 2026-08-23: "dont put icons below the community name, put them
		// on the right side, if overlaps with explore, then use two line for
		// community name, but still put icons to the right side". The row that
		// holds the name and the glyphs must therefore NOT wrap — a wrapping
		// row is exactly what dropped the glyphs onto a line of their own on
		// long names. The name absorbs the squeeze instead, wrapping to its two
		// lines inside a narrower box.
		const infoLeft = SRC.slice(
			SRC.indexOf("\tinfoLeft: {"),
			SRC.indexOf("\t},", SRC.indexOf("\tinfoLeft: {")),
		);
		expect(infoLeft).toContain("flexDirection");
		expect(infoLeft).not.toContain("flexWrap");
		expect(SRC).toContain("numberOfLines={2}");
		// And they must still be the name's neighbours in the tree, not the
		// link's: one container holds the name and the glyphs, `Explore` is
		// outside it.
		const left = SRC.indexOf("styles.infoLeft");
		const glyphs = SRC.indexOf("styles.icons");
		const cta = SRC.indexOf("styles.ctaRow");
		expect(left).toBeGreaterThan(-1);
		expect(glyphs).toBeGreaterThan(left);
		expect(cta).toBeGreaterThan(glyphs);
	});

	it("has no pill row left", () => {
		// The pills were replaced, not moved: nothing on this card renders a
		// label in a box any more.
		expect(SRC).not.toContain("MAX_COMMUNITY_PILLS");
		expect(SRC).not.toContain("PILL_HEIGHT");
		expect(SRC).not.toContain("chipLabel");
	});

	it("never substitutes a glyph it does not have", () => {
		// The shipped font is a 14-glyph subset and several real signals
		// ("Lake nearby", "Golf nearby") have no honest match. The card must
		// skip those, never fall back — a wrong glyph is a claim the community
		// was never measured on. The server returns `icon` as optional and this
		// face only ever pushes a defined one.
		expect(SRC).toContain("if (!icon || seen.has(icon)");
	});

	it("renders no statistic line on the card", () => {
		// The glass tile carried a `fact` sub-line and the pill that replaced it
		// could not; the glyph that replaced the pill certainly cannot. The
		// facts live on the community explore screen, which is where the CTA
		// goes.
		expect(SRC).not.toContain("r.fact");
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
