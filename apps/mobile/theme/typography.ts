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
