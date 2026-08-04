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
	| "shieldCheck";

/** The family name registered with `expo-font`. */
export const ICON_FONT = "PerchoIcons";

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
