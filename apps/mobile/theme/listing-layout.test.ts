/**
 * The listing card's 2026-08-18 immersive full-bleed layout, asserted as text.
 *
 * Sibling of `community-panel-fit.test.ts` (the community card's full-bleed
 * composition). On 2026-08-18 the listing card joined the ONE card system:
 * media fills the ENTIRE card, price/specs/address sit on a bottom scrim, and
 * the white text block under the media is GONE.
 *
 * This file reads `ListingFace.tsx` as text rather than importing it — the
 * mobile vitest suite is deliberately react-native-free (see
 * `redline-type.test.ts`), and the component pulls in `StyleSheet` / `View`.
 *
 * ── The three fixed elements (owner, 2026-08-18) ────────────────────────────
 *
 * City / Community / Listing must carry IDENTICAL type label, save disc, and
 * Explore CTA — same position, size, colour, style. The parity assertions
 * read all three faces and compare the shared numbers:
 *
 *   · badge        top 12 / left 12, padding 7/10, rgba(255,255,255,0.92)
 *   · save disc    top 12 / right 12, 40px, rgba(255,255,255,0.75)
 *   · explore      white 15/500 "Explore →", right-aligned
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LISTING = readFileSync("components/cards/ListingFace.tsx", "utf8");
const AREA = readFileSync("components/cards/AreaFace.tsx", "utf8");
const COMMUNITY = readFileSync("components/cards/CommunityFace.tsx", "utf8");
/**
 * The shared top-right control (phase140). The bookmark art and the disc
 * geometry moved here when the mute joined it in one capsule, so the parity
 * assertions below read it rather than each face.
 */
const CORNER = readFileSync("components/cards/CardCorner.tsx", "utf8");

describe("listing card immersive full-bleed layout (2026-08-18)", () => {
	it("fills the card with media — no white text block below", () => {
		// The old face split card into media + white block; the new face has
		// ONE media layer with the info overlaid. The white container
		// (geo.block / textBlock) must be gone — from the STYLES, not from
		// the history notes in the header.
		expect(LISTING).not.toMatch(/styles\.(block|divider)/);
		expect(LISTING).not.toContain("textBlock as geo");
		expect(LISTING).not.toContain("media as mediaGeo");
		expect(LISTING).not.toContain("flex: 1, minHeight: 0");
		expect(LISTING).toContain('overflow: "hidden"');
		expect(LISTING).toContain('fit="cover"');
	});

	it("carries a bottom scrim like the CITY card", () => {
		expect(LISTING).toContain("LinearGradient");
		expect(LISTING).toContain("rgba(0,0,0,0.5)");
		// All three faces now share the DEEP gradient (owner 2026-08-19: 底部渐变
		// + 信息文字条) — same 0.55 start, deep 0.92 end. The listing card led,
		// then AreaFace and CommunityFace followed in the same pass.
		expect(LISTING).toContain("locations={[0.55, 0.78, 1]}");
		expect(LISTING).toContain("rgba(0,0,0,0.92)");
		expect(AREA).toContain("locations={[0.55, 0.78, 1]}");
		expect(COMMUNITY).toContain("locations={[0.55, 0.78, 1]}");
	});

	it("keeps the LISTING badge and the bookmark", () => {
		expect(LISTING).toContain("LISTING");
		expect(LISTING).toContain("SAVE_TAP_TARGET");
		// The bookmark is drawn by the shared corner control since phase140 —
		// the listing face mounts it and passes the saved state.
		expect(LISTING).toContain("<CardCorner");
		expect(LISTING).toContain("save={{");
		expect(CORNER).toContain("function BookmarkIcon");
	});

	/**
	 * phase140 (owner pick "G2"): the corner holds ONE object. Two stacked
	 * discs — a mute above the bookmark — was the shape the owner rejected
	 * (「右上两个 button 很奇怪」), so a capsule with a hairline between two
	 * cells replaced them, and a face with only one control keeps the plain
	 * 40pt disc.
	 */
	it("puts the mute and the bookmark in ONE capsule", () => {
		// Both cells, one container.
		expect(CORNER).toContain("function SpeakerIcon");
		expect(CORNER).toContain("function BookmarkIcon");
		expect(CORNER).toContain("both ? styles.capsule : styles.disc");
		// The lone-control form is still the disc every face drew before.
		expect(CORNER).toContain(
			'disc: { width: 40, height: 40, borderRadius: 20 }',
		);
		// A photo-only card gets no speaker: the control must not promise audio
		// the card does not have.
		expect(LISTING).toContain("card.videoUrl");
	});

	/**
	 * The community face gets the mute but NOT at the badge's height: its tour
	 * video burns a place-name pill into that corner (see `_render_label_png`
	 * in the render worker), which is why the bookmark was removed from it on
	 * 2026-08-20. The control drops below the pill instead of moving to a third
	 * corner.
	 */
	it("drops the community mute clear of the film's burned-in label", () => {
		expect(COMMUNITY).toContain("COMMUNITY_SOUND_TOP");
		expect(COMMUNITY).toContain("<CardCorner");
		// Still no bookmark on this face.
		expect(COMMUNITY).not.toContain("save={{");
	});

	it("renders price, specs and address on the photo — no white container", () => {
		expect(LISTING).toContain("card.priceLabel");
		expect(LISTING).toContain("card.bedBathSqft");
		expect(LISTING).toContain("styles.address");
		expect(LISTING).toContain("styles.info");
		// The overlay block lives on the photo (absolute info), never in a
		// natural-height white panel below the media.
		expect(LISTING).toContain('position: "absolute"');
	});

	it("unifies the three fixed elements across City / Community / Listing", () => {
		const badge = "paddingVertical: 7,\n\t\tpaddingHorizontal: 10";
		expect(LISTING).toContain(badge);
		expect(AREA).toContain(badge);
		expect(COMMUNITY).toContain(badge);

		// The save disc: AreaFace still draws its own (that face has not been in
		// the deck since 2026-08-22 and phase140 left it untouched), while the
		// listing card's moved into the shared corner control when the mute
		// joined it. Community has never had one — it dropped the bookmark on
		// 2026-08-20 because the disc sat where the tour video draws its place
		// name and distance.
		const disc =
			'width: 40,\n\t\theight: 40,\n\t\tborderRadius: 20,\n\t\tbackgroundColor: "rgba(255,255,255,0.75)"';
		expect(AREA).toContain(disc);
		expect(CORNER).toContain('backgroundColor: "rgba(255,255,255,0.85)"');
		expect(COMMUNITY).not.toContain(disc);

		// Same explore CTA — label copy, size, weight, colour.
		expect(LISTING).toContain(
			'fontSize: 15,\n\t\tfontWeight: "500",\n\t\tcolor: "rgba(255,255,255,0.92)"',
		);
		expect(AREA).toContain(
			'fontSize: 15,\n\t\tfontWeight: "500",\n\t\tcolor: "rgba(255,255,255,0.92)"',
		);
		expect(COMMUNITY).toContain(
			'fontSize: 15,\n\t\tfontWeight: "500",\n\t\tcolor: "rgba(255,255,255,0.92)"',
		);
		expect(LISTING).toContain("Explore\n");
	});

	it("keeps the CTA label and routes it through the shared tap target", () => {
		// Owner, 2026-08-16: CTA → "Explore →" (the old "Why people love it"
		// text link is gone with the white block). The listing card now says
		// "Explore", not "Explore home", matching CITY / COMMUNITY.
		expect(LISTING).toContain("arm(EXPLORE_TAP_TARGET)");
		// The feed must actually send that target somewhere, or the link is
		// dead in the stack (a Pressable inside the pan gesture never fires —
		// RNGH #3172).
		const feed = readFileSync("app/(tabs)/feed.tsx", "utf8");
		expect(feed).toContain('top.kind === "listing"');
		expect(feed).toContain("router.push(`/listing/${top.id}`)");
		expect(feed).toContain("tapSlot={args.tapSlot}");
	});
});
