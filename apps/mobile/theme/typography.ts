/**
 * Typography scale — spec-v3 `00-overview.md` §0.4, transcribed verbatim as
 * RN `TextStyle` objects. Serif (New York → Georgia today) is reserved for
 * "worth reading slowly" content: price, ask questions, page/sheet titles.
 * Everything else (specs, buttons, nav) is SF Pro. See §0.4 note.
 *
 * Colors are NOT baked in here — callers layer `color` from `colors.*` so the
 * same style works on paper chrome (ink) and on a dark card face (onCard).
 */
import type { TextStyle } from "react-native";
import { fonts } from "./tokens";

export const textStyles = {
	/** ask question on a card. New York 34 / bold, tracking −1. */
	display: {
		fontFamily: fonts.display,
		fontSize: 34,
		fontWeight: "700",
		letterSpacing: -1,
	},
	/** page title, detail price. New York 28 / bold. */
	title1: {
		fontFamily: fonts.display,
		fontSize: 28,
		fontWeight: "700",
	},
	/** sheet title, price on card. New York 22 / bold. */
	title2: {
		fontFamily: fonts.display,
		fontSize: 22,
		fontWeight: "700",
	},
	/** row title, button. SF Pro 15 / semibold. */
	headline: {
		fontFamily: fonts.ui,
		fontSize: 15,
		fontWeight: "600",
	},
	/** body copy. SF Pro 15 / regular. */
	body: {
		fontFamily: fonts.ui,
		fontSize: 15,
		fontWeight: "400",
	},
	/** address, caption text. SF Pro 13 / regular. */
	footnote: {
		fontFamily: fonts.ui,
		fontSize: 13,
		fontWeight: "400",
	},
	/** SECTION HEAD, kind chip, tag. SF Pro 11 / semibold, tracking +1.2, uppercase. */
	caption: {
		fontFamily: fonts.ui,
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
	/**
	 * The guided tour's WHY block — `02-listing.md` §2.3 #3 specifies serif 17.5
	 * for it by name. Serif because §0.4 reserves the display face for "worth
	 * reading slowly", and the WHY paragraph is the one piece of prose in the app
	 * the buyer is meant to actually read rather than scan.
	 *
	 * Distinct from `body` (SF Pro 15) and from `title2` (serif 22 bold): this is
	 * regular weight at a reading size, not a heading.
	 */
	serifBody: {
		fontFamily: fonts.display,
		fontSize: 17.5,
		fontWeight: "400",
	},
} as const satisfies Record<string, TextStyle>;

/** Price token — New York serif 25 bold, per §0.6 CardFoot spec. */
export const priceStyle: TextStyle = {
	fontFamily: fonts.display,
	fontSize: 25,
	fontWeight: "700",
};

/**
 * Redline type scale (2026-07-30) — the owner-supplied "Percho Swipe Cards"
 * redline, for the four front faces it covers. Owner: 「全按redline覆盖」.
 *
 * Separate from `textStyles` for the same reason `redline` is separate from
 * `colors`: this is the CARD's scale, not the chrome's. Two differences matter
 * and are why the existing styles could not be reused:
 *
 *   · WEIGHT. `textStyles.display`/`title1`/`title2` are all serif **700**. The
 *     redline specifies **500** for every display line ("36px / 1.05 / 500"),
 *     and the reference board's headlines are visibly lighter than bold — that
 *     lighter serif IS the editorial register the redline is asking for.
 *   · LINE HEIGHT. The redline gives explicit ratios (1.05 display, 1.45 body,
 *     1.55 insight body). RN does not derive `lineHeight` from `fontSize`, so
 *     leaving it unset stacks serif headlines too tightly on device.
 *
 * `letterSpacing` values are the redline's `-0.8px` / `-0.2px` tracking.
 */
export const redlineText = {
	/** Listing price — "serif, 35px". */
	price: {
		fontFamily: fonts.display,
		fontSize: 35,
		fontWeight: "500",
		letterSpacing: -0.8,
		lineHeight: 35,
	},
	/** Community place name — "serif 38px, line-height 1". */
	place: {
		fontFamily: fonts.display,
		fontSize: 38,
		fontWeight: "500",
		letterSpacing: -0.9,
		lineHeight: 38,
	},
	/** Trade-off question — "serif 32px, centered, line-height 1.06". */
	question: {
		fontFamily: fonts.display,
		fontSize: 32,
		fontWeight: "500",
		letterSpacing: -0.6,
		lineHeight: 34,
	},
	/** Insight headline — "serif 30–32px, line-height 1.08". */
	insight: {
		fontFamily: fonts.display,
		fontSize: 31,
		fontWeight: "500",
		letterSpacing: -0.7,
		lineHeight: 33,
	},
	/** Listing address — "14px semibold". */
	address: {
		fontFamily: fonts.ui,
		fontSize: 14,
		fontWeight: "600",
		letterSpacing: -0.2,
	},
	/** Locality line — "12px muted". */
	locality: { fontFamily: fonts.ui, fontSize: 12, fontWeight: "400" },
	/** Listing story / community subtitle — "13–14px, line-height 1.45". */
	story: {
		fontFamily: fonts.ui,
		fontSize: 13,
		fontWeight: "400",
		lineHeight: 19,
	},
	/** Community subtitle — 14px at the same 1.45. */
	subtitle: {
		fontFamily: fonts.ui,
		fontSize: 14,
		fontWeight: "400",
		lineHeight: 20,
	},
	/** Insight body — "13px, line-height 1.55, max width 220". */
	insightBody: {
		fontFamily: fonts.ui,
		fontSize: 13,
		fontWeight: "400",
		lineHeight: 20,
	},
	/** Trade-off choice label — "14px semibold, line-height 1.35". */
	choice: {
		fontFamily: fonts.ui,
		fontSize: 14,
		fontWeight: "600",
		lineHeight: 19,
	},
	/** CTA label — "13px semibold". */
	cta: { fontFamily: fonts.ui, fontSize: 13, fontWeight: "600" },
	/** Community CTA — "12px semibold". */
	ctaSm: { fontFamily: fonts.ui, fontSize: 12, fontWeight: "600" },
	/**
	 * Uppercase category pill — "10px / 700 / 0.1em".
	 *
	 * 0.1em at 10px = 1pt of tracking. Distinct from `textStyles.caption`
	 * (11px/600/1.2), which is the chrome's pill.
	 */
	label: {
		fontFamily: fonts.ui,
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 1,
		textTransform: "uppercase",
	},
	/** Chip text on the listing card — the redline's "9–10px". */
	chip: { fontFamily: fonts.ui, fontSize: 9.5, fontWeight: "500" },
	/** Community lifestyle block label — "10px", centered. */
	tile: {
		fontFamily: fonts.ui,
		fontSize: 10,
		fontWeight: "500",
		lineHeight: 13,
	},
	/** "18 Photos" / swipe hint / insight micro-label — 11px. */
	micro: { fontFamily: fonts.ui, fontSize: 11, fontWeight: "400" },
	/** Insight recommendation caption — "9–10px". */
	nano: { fontFamily: fonts.ui, fontSize: 9.5, fontWeight: "400" },
} as const satisfies Record<string, TextStyle>;
