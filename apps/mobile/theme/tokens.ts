/**
 * Design tokens — the single source of truth for color, radius, and font
 * family across the whole app. Transcribed verbatim from spec-v3
 * `00-overview.md` §0.3 (= _spec.css :root). All WCAG AA-checked.
 *
 * HARD RULE (see prompts/_MASTER.md #1): this file is the ONLY place a hex
 * literal may appear. Component code references `colors.*` / `radii.*` /
 * `fonts.*` — never a raw hex string, never a literal border radius.
 */

// ─── Color (§0.3) ───────────────────────────────────────────────────
export const colors = {
	bg: "#FAF6F0", // App background (warm paper) — chrome base
	surface: "#FFFFFF", // Cards, sheets, stat tiles
	surface2: "#F3EDE4", // Recessed wells, inputs
	border: "#EADFD0", // Hairline dividers
	ink: "#2B2116", // Primary text
	ink2: "#8A7358", // Secondary text
	ink3: "#B9A88F", // Placeholder text
	accent: "#B45309", // Brand amber — section head, active, links
	accentDeep: "#7C3A05", // Pressed amber
	pos: "#1B7A4D", // match · yes
	neg: "#B3402A", // no · destructive
	cta: "#2B2116", // Primary CTA fill = ink block (amber is accent only)
	/** Light chip/badge/button laid over a photo (§0.3). */
	glass: "rgba(250,246,240,0.92)",
	/**
	 * Immersive card foot gradient (§0.3 note, value approved by owner
	 * 2026-07-26): transparent → rgba(0,0,0,0.72) over the bottom ~45% of the
	 * card. The card face is ALWAYS dark — no light variant (§0.3 invariant).
	 */
	cardGradFrom: "transparent",
	cardGradTo: "rgba(0,0,0,0.72)",
	/** On-photo dark text/scrim helpers (card face is always dark). */
	onCard: "#FFFFFF",
	onCardDim: "rgba(255,255,255,0.72)",
	/**
	 * Base fill behind a media-less face. Only ever visible for a few ms before
	 * `CardSurface` paints over it, so it is the DARKEST stop of the ramp, never
	 * `ink` (the primary TEXT token, which read as a black screen on device).
	 */
	cardPlainTo: "#2E2118",
	/** Hairline arcs in the `CardSurface` motif — see `cardSurfaces`. */
	cardPlainRing: "rgba(255,255,255,0.05)",
	/**
	 * `accent` lightened for use ON a dark card. The amber (#B45309) is AA against
	 * the light `bg`, but on a media-less card's own warm ramp it drops to a
	 * barely-legible smudge (caught reviewing the milestone eyebrow). Same hue,
	 * raised luminance.
	 */
	accentOnCard: "#F0A94B",
	/** Dimming backdrop behind a bottom sheet / modal. */
	scrim: "rgba(0,0,0,0.4)",
} as const;

/**
 * Redline card tokens (2026-07-30) — the owner-supplied "Percho Swipe Cards"
 * redline + reference board, adopted verbatim for the four front faces
 * (listing / community / trade-off / insight). Owner instruction:
 * 「全按redline覆盖」.
 *
 * This is a SECOND, deliberately separate palette from `colors` above, not a
 * replacement for it. `colors` is the app CHROME (warm paper bg, amber accent)
 * and still dresses the tab bar, detail pages, ask/area/challenge/milestone
 * faces. These four cards are what the redline specifies, and its accent is a
 * deep forest GREEN — mixing the two accents on one surface is what the redline
 * forbids ("Forest green is the only accent", "Do not add orange or blue
 * accents"). So the green never leaves these tokens, and the amber never enters
 * a redline face.
 *
 * Values transcribed from the redline's `--*` block, unchanged.
 */
export const redline = {
	/** `--card` — the card face. Warmer and lighter than `scoreTokens.face`. */
	card: "#FFFDF9",
	/** `--surface` — chip / recessed fill on the card. */
	surface: "#F1F1EC",
	/** `--text-primary`. */
	ink: "#171715",
	/** `--text-secondary`. */
	ink2: "#6F6B65",
	/** `--text-muted`. */
	ink3: "#96918A",
	/** Listing story copy — the redline names #57534D for it specifically. */
	inkStory: "#57534D",
	/** `--accent` — deep forest green. The ONLY accent on these faces. */
	accent: "#0E6B57",
	/** Pressed state for the accent fill. Darkening, never fading (see below). */
	accentDeep: "#0A5343",
	/** `--accent-soft` — the pale mint badge behind a choice / sparkle icon. */
	accentSoft: "#EAF2EE",
	/** `--border` — hairline dividers on a redline face. */
	border: "rgba(23,23,21,0.08)",
	/** White text/fills on a photo-led face. */
	onPhoto: "#FFFFFF",
	/** The community card's subtitle, white at 86% per the redline. */
	onPhotoDim: "rgba(255,255,255,0.86)",
	/** Category pill over a photo — "white translucent pill", 10px uppercase. */
	pill: "rgba(255,255,255,0.90)",
	/** The heart button's disc — "white 88% opacity". */
	heart: "rgba(255,255,255,0.88)",
	/** The "18 Photos" pill — "dark translucent background". */
	photoPill: "rgba(14,13,11,0.50)",
	/** Community lifestyle blocks — rgba(255,255,255,0.13) + a 0.15 border. */
	glassTile: "rgba(255,255,255,0.13)",
	glassTileBorder: "rgba(255,255,255,0.15)",
	/** Trade-off choice cards — rgba(255,255,255,0.82) + a 0.85 border. */
	choice: "rgba(255,255,255,0.82)",
	choiceBorder: "rgba(255,255,255,0.85)",
	/** Community photo scrim stops (redline's 180deg overlay). */
	communityScrimFrom: "rgba(0,0,0,0)",
	communityScrimMid: "rgba(7,12,9,0.18)",
	communityScrimTo: "rgba(7,12,9,0.88)",
	/** Trade-off atmospheric wash over its landscape backdrop. */
	tradeoffWashFrom: "rgba(249,245,238,0.10)",
	tradeoffWashMid: "rgba(249,245,238,0.90)",
	tradeoffWashTo: "rgba(249,245,238,1)",
	/** Insight face gradient — `#FFFDF9` → `#F7F3EC`. */
	insightFrom: "#FFFDF9",
	insightTo: "#F7F3EC",
} as const;

/**
 * Radii the redline names that the app's five-step `radii` scale has no slot
 * for. Kept separate so `radii` stays the chrome's scale rather than growing a
 * step per card.
 */
export const redlineRadii = {
	/** Community lifestyle block. */
	tile: 18,
	/** Trade-off choice card. */
	choice: 22,
	/** Insight recommendation thumbnail. */
	thumb: 14,
} as const;

/**
 * Score-panel tokens (2026-07-30, demo variant C).
 *
 * ── These are LIGHT-face values, transcribed from the demo ────────────────────
 *
 * The first version of this panel used a dark-face family (white text, white
 * washes) because it was drawn on `cardPlainTo`. That was the wrong reading of
 * the owner's pick: demo C's card is `#FFFDFB` with `#221A12` ink, and his
 * original brief for this card was 「纯白 + 浅灰为基底，柔和渐变与微阴影，
 * 色彩克制」. Drawing C's geometry on a dark panel reproduced the layout and
 * missed the design. Values below come straight from `card-v7/index.html`'s
 * `.C` rules, so the app and the approved demo cannot drift.
 */
export const scoreTokens = {
	/** `.C .card` — near-white card face, very slightly warm. */
	face: "#FFFDFB",
	/** `--ink` — primary text on the light face. */
	ink: "#221A12",
	/** `--ink2` — secondary text, and the FILL of each dimension's mini-track. */
	ink2: "#7A6A57",
	/** `--ink3` — the "no data source" dash and the eyebrow caption. */
	ink3: "#B3A491",
	/** `--line` — row separators. */
	hairline: "rgba(34,26,18,0.10)",
	/** `.C circle` stroke — the ring's unfilled arc. */
	ringTrack: "#E7DFD0",
	/** `.C .li .track` — a dimension's unfilled mini-track. */
	track: "#EFE9DE",
	/**
	 * `.C .li.na .track` — the demo hatches an unscored row's track with a
	 * repeating gradient. RN has no gradient without a native dep, so it is drawn
	 * as spaced ticks (see `NeighborhoodScore`): the point is that "no data" must
	 * not look like "a score of zero", which a plain empty track does.
	 */
	naTick: "#E6DFD2",
} as const;

/**
 * Backgrounds for faces with NO photograph (§0.3 names a dark treatment for
 * photo-backed faces and nothing for the rest).
 *
 * History: the media-less faces first filled with flat `ink` (#2B2116, the TEXT
 * token) and then with ONE shared brown ramp. Both read on device as a black
 * screen — "对于没有照片的卡面包括 tradeoff 的背景图你设计一下，不能黑屏"
 * (owner, 2026-07-27). Two problems, not one: the ramp bottomed out too dark,
 * AND all five kinds looked identical, so a run of them read as the same broken
 * card repeating.
 *
 * So each kind gets its OWN hue, carrying meaning rather than decoration:
 *   tradeoff  warm clay vs. cool slate — the split IS the card's question, and
 *             the §1.6 brightness feedback now moves across two distinct hues.
 *   challenge indigo — the quiz register, distinct from every other card.
 *   insight   amber — the brand accent's own family, "Percho noticed".
 *   milestone the brightest, warmest ramp: this is the ceremony card.
 *   ask       violet, for a preference-layer question with no place attached.
 *   askGeo    pine, for a geographic question (which side of town, how far out).
 *   area      cool blue-teal, for an area/city/zip card with no photo. Adjacent
 *             to `askGeo` on purpose — both are geography — but separated enough
 *             that an area card and a geo question don't read as the same card
 *             twice (they were literally the same pine on first review).
 *
 * Constraints every entry must satisfy (enforced by `card-surfaces.test.ts`):
 *   - stays in the dark family, so `onCard` / `onCardDim` / `glass` / `pos` /
 *     `neg` keep the contrast they were AA-checked against in §0.3;
 *   - the dark stop is never near-black (mean channel ≥ 0x20);
 *   - visibly chromatic (channel spread ≥ 8) — a neutral dark grey is exactly
 *     what "black screen" means to the eye;
 *   - `from` is materially lighter than `to`, so the ramp is legible as a ramp.
 *
 * `glow` is a single corner wash (transparent-ended gradient) — no blur, no
 * noise, no mesh: these cards are the majority of the stage-0 deck and a
 * full-card offscreen pass on each is not worth a texture.
 */
export const cardSurfaces = {
	tradeoff: { from: "#5A4230", to: "#2E2118", glow: "rgba(255,196,130,0.16)" },
	/** The right half of the trade-off split only. */
	tradeoffAlt: {
		from: "#2C4351",
		to: "#17262E",
		glow: "rgba(150,205,255,0.14)",
	},
	challenge: { from: "#413A63", to: "#221D34", glow: "rgba(180,170,255,0.16)" },
	insight: { from: "#5B4014", to: "#33240E", glow: "rgba(255,205,120,0.18)" },
	milestone: { from: "#6B3D1C", to: "#38200F", glow: "rgba(255,186,96,0.24)" },
	ask: { from: "#4A3A57", to: "#241C2E", glow: "rgba(214,170,255,0.14)" },
	askGeo: { from: "#2F4A46", to: "#17282A", glow: "rgba(140,225,205,0.14)" },
	area: { from: "#274A5E", to: "#132833", glow: "rgba(130,205,255,0.16)" },
} as const;

export type CardSurfaceVariant = keyof typeof cardSurfaces;

// ─── Radius (§0.3) — only these five steps exist ────────────────────
export const radii = {
	card: 28,
	sheet: 24,
	tile: 14,
	btn: 16,
	pill: 999,
} as const;

// ─── Font families (§0.3 / §0.4) ────────────────────────────────────
// `ui` = SF Pro Text, which is the iOS system face ('System' resolves to SF Pro).
//
// `display` is the editorial serif. The redline names a STACK —
//   "New York", "Iowan Old Style", "Baskerville", "Georgia", serif
// — and the first entry matters: **New York is the iOS system serif** and it has
// LINING (equal-height) figures. Georgia, the stack's 4th fallback, has OLD-STYLE
// figures: its 9 descends below the baseline and its 6/8 ascend above cap height.
//
// That is not cosmetic on this product. `$968,000` in Georgia renders as a
// visibly uneven up-and-down row of digits, where the redline's reference board
// shows one flat row (measured: all six digits span y388–409 exactly). The owner
// caught it on sight — 「你这个房价的字体明显不对啊」 (2026-07-30).
//
// RN resolves `fontFamily` through Core Text, so the documented iOS name for the
// system serif works directly: `ui-serif` is the CSS spelling, `"New York"` is
// the family name Core Text registers. `displayFallback` keeps Georgia reachable
// so a platform without New York still gets a serif rather than defaulting to
// sans — see `serifStack()` in `typography.ts`, which is what call sites use.
export const fonts = {
	display: "New York",
	displayFallback: "Georgia",
	ui: "System",
} as const;
