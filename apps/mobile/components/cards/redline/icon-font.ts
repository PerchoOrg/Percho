/**
 * The redline icon set, as a FONT.
 *
 * ── Why a font and not SVG ──────────────────────────────────────────────────
 *
 * Owner picked **Phosphor Fill** (2026-08-01) after reviewing six candidate
 * libraries at real chip size on `demo.percho.co/icon-sets`. The obvious way to
 * ship a library like that is `react-native-svg` — and that is exactly what red
 * screened the app on 2026-07-30: `RNSVGCircle must be a function (received
 * undefined)`, because RNSVG's native view manager is NOT compiled into Expo Go.
 * See DEVLOG 2026-07-30 04:55. We are not going back there for decoration.
 *
 * Phosphor also ships as an **icon font**, which needs no native module at all:
 * `expo-font` is a core Expo Go module, and a glyph is just a `<Text>`. So the
 * real Phosphor outlines ship, at any size, with none of the RNSVG risk.
 *
 * `assets/fonts/PerchoIcons.ttf` is `Phosphor-Fill.ttf` subset with
 * `pyftsubset` down to the 14 codepoints below — 5.2 KB instead of 440 KB. To
 * add a glyph you must re-subset; adding a name here alone will render tofu.
 *
 * The reproducible path is `python3 scripts/build-icon-font.py` (it reads
 * `GLYPHS` there and prints the codepoints to paste back here); the raw command
 * it runs is:
 *
 *   pyftsubset Phosphor-Fill.ttf --unicodes=U+E10E,U+E112,... \
 *     --output-file=assets/fonts/PerchoIcons.ttf --no-hinting --name-IDs='*'
 *
 * ── Why the names did not change ────────────────────────────────────────────
 *
 * `RedlineIconName` keeps the same 14 members it had when the icons were hand
 * built out of `View`s, so no card face changed in this swap. The names are
 * ours; only the artwork underneath moved to Phosphor. (Three more were added
 * 2026-08-02 for the community card's resident reasons — see the union below.)
 *
 * The same union now also exists as `CardIconName` in `@percho/shared`, because
 * the server picks the glyph for a resident-stated attribute and has to name it
 * over the wire. Keep the two in step; `theme/icon-font.test.ts` guards this
 * table against the .ttf, and the shared copy carries the rationale.
 */

/** Icon names every redline face may ask for. */
export type RedlineIconName =
	| "camera"
	| "school"
	| "tree"
	| "walk"
	| "family"
	| "car"
	| "yard"
	| "sparkle"
	// Community-highlight dims: the ten dims that actually occur need ten
	// distinct glyphs, so `quiet` gets its own moon rather than borrowing the
	// `family` art (which read as "family" under a "Quiet Streets" label).
	| "moon"
	| "path"
	| "shop"
	| "cup"
	| "check"
	| "expand"
	// Community-card resident reasons (layout E, 2026-08-02). The community tile
	// now prints the attribute residents actually left ("Dog Friendly") instead of
	// a Percho dim label ("Trails Nearby"), and ~60 attributes need more than the
	// original 14 glyphs could cover without two claims wearing the same art.
	| "dog"
	| "handshake"
	| "shieldCheck"
	// 2026-08-13 listing-card chrome: saved bookmark (filled when saved) and
	// the explore link's arrow.
	| "bookmark"
	| "arrowRight";

/** The family name registered with `expo-font`. */
export const ICON_FONT = "PerchoIcons";

/**
 * The OUTLINE weight of the same set, for the 2026-08-14 trade-off redesign.
 *
 * The main subset is Phosphor FILL (owner's 2026-08-01 pick, "Fill weight
 * only" — see `assets/icons/README.md`). The trade-off card's new spec asks
 * for fine line icons ("精细 outline icon"), which is a different weight of
 * the SAME drawings: Phosphor's regular.ttf uses the identical codepoints,
 * so `ICON_GLYPH` serves both fonts unchanged — only the font file and the
 * centring numbers differ.
 *
 * Subset with `scripts/build-icon-font.py`-style pyftsubset against
 * Phosphor-Regular.ttf using the same unicodes; `PerchoIconsOutline.ttf` is
 * ~7.7 KB for the same 19 glyphs.
 */
export const OUTLINE_FONT = "PerchoIconsOutline";

/**
 * Name → codepoint in `PerchoIcons.ttf`.
 *
 * The comment on each line is the upstream Phosphor glyph, which is the only
 * way to trace a codepoint back to a drawing — the subset font has no
 * human-readable glyph names left.
 */
export const ICON_GLYPH: Record<RedlineIconName, string> = {
	camera: "\ue10e", // camera-fill        — the "18 Photos" pill
	car: "\ue112", // car-fill              — commute / drive
	check: "\ue184", // check-circle-fill   — "Move-in Ready"
	cup: "\uea4a", // cheers-fill           — "Great for Hosting" / nightlife
	expand: "\ue0a2", // arrows-out-fill    — "Spacious"
	family: "\ue68e", // users-three-fill   — "Family Friendly"
	moon: "\ue58e", // moon-stars-fill      — "Quiet Streets"
	path: "\ue39c", // path-fill            — "Trails Nearby"
	school: "\ue62c", // graduation-cap-fill — "Top Schools"
	shop: "\ue470", // storefront-fill      — "Cultural Scene"
	sparkle: "\ue6a2", // sparkle-fill      — "Percho noticed"
	tree: "\ue6da", // tree-fill            — "Private Backyard"
	walk: "\uea88", // footprints-fill      — "Walkable"
	yard: "\uee26", // picnic-table-fill    — outdoor space (tradeoff face)
	dog: "\ue74a", // dog-fill              — "Dog Friendly"
	handshake: "\ue582", // handshake-fill  — "Friendly" / "Welcoming" / "Neighbors"
	shieldCheck: "\ue40c", // shield-check-fill — "Safe"
	bookmark: "\ue0e8", // bookmark-fill      — saved listing (filled bookmark)
	arrowRight: "\ue06c", // arrow-right-fill — explore link affordance
};

/**
 * Width of each glyph's DRAWING, as a fraction of the em box.
 *
 * Measured off `assets/fonts/PerchoIcons.ttf` with fontTools (`hmtx` +
 * outline bounds). Every glyph in this subset has advance width 1024 (1em)
 * and left side bearing 0 — the art is flush LEFT in the em box and the
 * leftover width sits entirely on the right. Centring the text box therefore
 * centres the em box, not the drawing, and every icon renders left of centre
 * by `(1 - artWidth) / 2` em.
 *
 * That is small for the wide glyphs (camera, 0.047em) and large for the
 * narrow ones: `bookmark` is 0.5625em wide, so it sat 0.219em ≈ 4.4pt left of
 * centre inside the 38pt save disc — the off-centre bookmark the owner
 * reported on 2026-08-14. `RedlineIcon` shifts the glyph right by half the
 * slack, which centres the ART for every name.
 *
 * To re-measure after a re-subset:
 *
 *   python3 - <<'PY'
 *   from fontTools.ttLib import TTFont
 *   from fontTools.pens.boundsPen import BoundsPen
 *   f = TTFont('assets/fonts/PerchoIcons.ttf'); gs = f.getGlyphSet()
 *   for cp, g in sorted(f.getBestCmap().items()):
 *       bp = BoundsPen(gs); gs[g].draw(bp)
 *       print(hex(cp), round(bp.bounds[2] / f['head'].unitsPerEm, 4))
 *   PY
 */
export const ICON_ART_WIDTH: Record<RedlineIconName, number> = {
	camera: 0.8125,
	car: 0.9375,
	check: 0.8125,
	cup: 0.8438,
	expand: 0.6875,
	family: 0.9375,
	moon: 0.8125,
	path: 0.7969,
	school: 1,
	shop: 0.8125,
	sparkle: 0.9063,
	tree: 0.875,
	walk: 0.7513,
	yard: 0.8125,
	dog: 0.875,
	handshake: 1,
	shieldCheck: 0.75,
	bookmark: 0.5625,
	arrowRight: 0.75,
};

/**
 * Art widths of the OUTLINE (regular-weight) font, same glyphs.
 *
 * Same measurement as `ICON_ART_WIDTH`, taken off `PerchoIconsOutline.ttf`
 * with fontTools. The outline drawings are wider than the fill ones (mean
 * ≈0.93em vs ≈0.79em) because the fill weight collapses the art to a solid
 * core; the outline keeps the full outer stroke. `RedlineIcon` needs the
 * per-font width to centre the drawing, so the trade-off face cannot reuse
 * the fill numbers.
 */
export const OUTLINE_ART_WIDTH: Record<RedlineIconName, number> = {
	camera: 0.9062,
	car: 0.9688,
	check: 0.9062,
	cup: 0.9062,
	expand: 0.8438,
	family: 0.9688,
	moon: 0.9375,
	path: 0.9062,
	school: 1,
	shop: 0.9062,
	sparkle: 0.9688,
	tree: 0.9375,
	walk: 0.8747,
	yard: 1,
	dog: 0.9375,
	handshake: 1,
	shieldCheck: 0.875,
	bookmark: 0.7812,
	arrowRight: 0.875,
};

/**
 * Font size to request per point of nominal icon size.
 *
 * Measured, not guessed: in this subset the drawn art occupies 0.69em (expand,
 * yard, family) to 0.91em (sparkle) of the em box, mean ≈0.79em. So a glyph set
 * at `fontSize === size` renders visibly SMALLER than the `View` icons it
 * replaces, which drew to the edge of their box. 1.18 puts the average glyph at
 * ~0.93 × size — matching the old optical weight without letting the tallest
 * glyph (sparkle, 0.91em) overflow its row.
 *
 * Vertical centring needs no offset: this font's ascent/descent (960/-64) put
 * the text box centre 0.4375em above the baseline and the average art centre at
 * ~0.44em, so flex-centring the `<Text>` centres the drawing too.
 */
export const ICON_OPTICAL_SCALE = 1.18;

/**
 * Optical scale for the OUTLINE font.
 *
 * The outline drawings are wider (mean ≈0.93em vs ≈0.79em), so the fill
 * scale of 1.18 would blow an outline glyph ~25% past its box. 1.0 keeps the
 * average art at ~0.93 × size — the same "close to the box edge" look the
 * fill scale produces — and the widest glyphs (school/handshake/yard at
 * 1.0em) land exactly at the box.
 */
export const OUTLINE_OPTICAL_SCALE = 1.0;
