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
	 * Surface for the five faces that have NO media by design (trade-off,
	 * challenge, insight, milestone, data). §0.3 gives every photo-backed face a
	 * dark treatment via the foot gradient but names none for a media-less card,
	 * and filling with `ink` — the primary TEXT token — rendered them as a full
	 * screen of flat near-black (owner, on device: "连着看到纯黑的 tradeoff card").
	 * A warm dark ramp instead, staying in the dark family so every on-card token
	 * keeps the contrast it was AA-checked against.
	 */
	cardPlainFrom: "#3B2E20",
	cardPlainTo: "#221A12",
	/** Dimming backdrop behind a bottom sheet / modal. */
	scrim: "rgba(0,0,0,0.4)",
} as const;

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
