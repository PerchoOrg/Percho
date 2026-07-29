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
	/**
	 * ── LIGHT CARD FAMILY (owner override of the §0.3 dark-card invariant) ────
	 *
	 * 2026-07-29, verbatim: 「下面的背景也需要重新设计一下 比如以纯白 + 浅灰为基底，
	 * 搭配柔和渐变与微阴影，还原真实卡片触感；色彩克制，仅用点缀色突出核心操作，
	 * 整体干净通透，无视觉噪音。」
	 *
	 * §0.3 said the card face is ALWAYS dark, and every media-backed face got
	 * that free from a scrim over the photo. That held while the media was
	 * full-bleed. It stopped holding on 2026-07-28, when the listing card became
	 * three parts (1:1 inline media + info + map): the info block is no longer
	 * ON a photograph, so "dark card" turned into a large flat chocolate panel
	 * with three lines of text floating in it — which is exactly the 太单薄 /
	 * 很多空的位置 the owner reported.
	 *
	 * So the LISTING card's chassis is now light. The media block keeps its own
	 * dark treatment (it is a photo/video), and `onCard` / `cardGradTo` are
	 * untouched — every other face still uses them. Text on this chassis uses
	 * `ink` / `ink2` / `ink3`, which are the AA-checked pairs for `bg`.
	 */
	cardLightFrom: "#FFFFFF", // top of the chassis ramp — pure white
	cardLightTo: "#F4F1EC", // bottom — the faintest warm grey, not a colour
	/** Hairline card edge. Lighter than `border` so it reads as a lifted edge. */
	cardLightEdge: "#EFE9E0",
	/** Recessed well inside a light card (map slot, spec chips). */
	cardLightWell: "#F7F4EF",
	/** Spec chip fill — grey, so the accent stays reserved for the one CTA. */
	cardLightChip: "#F1EDE6",
} as const;

/**
 * The light card's micro-shadow (owner: 「柔和渐变与微阴影，还原真实卡片触感」).
 *
 * Two stacked shadows are how a real card reads: a tight contact shadow at the
 * edge plus a wide soft ambient one. RN takes only ONE shadow per view, so the
 * chassis nests two views — hence two token sets rather than one.
 *
 * Values are deliberately weak. A heavy drop shadow on a near-full-screen card
 * reads as a modal, not as paper, and would be the 视觉噪音 the brief rules out.
 */
export const cardShadow = {
	/** Wide ambient — the outer view. */
	ambient: {
		shadowColor: "#2B2116",
		shadowOpacity: 0.1,
		shadowRadius: 24,
		shadowOffset: { width: 0, height: 12 },
		elevation: 8,
	},
	/** Tight contact — the inner view, right at the edge. */
	contact: {
		shadowColor: "#2B2116",
		shadowOpacity: 0.06,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
		elevation: 2,
	},
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
 *   data      cool slate — a back face, deliberately the most recessive.
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
	data: { from: "#41504F", to: "#252F31", glow: "rgba(190,220,235,0.14)" },
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
// `display` renders Georgia on-device today (owner-approved 2026-07-26); real
// New York font files can drop in here later without touching call sites.
// `ui` = SF Pro Text, which is the iOS system face ('System' resolves to SF Pro).
export const fonts = {
	display: "Georgia",
	ui: "System",
} as const;
