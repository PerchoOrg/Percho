/**
 * The trade-off question bank.
 *
 * ── What a trade-off question has to be (owner, 2026-08-29) ─────────────────
 *
 * 「some questions here do not make any sense, for example, i would like both
 * bigger yard and shorter commute, why not?」 — that is the whole test. If a
 * buyer can want BOTH, their swipe is arbitrary and the preference we record is
 * noise. Six rules came out of that, and every question below passes all six:
 *
 *   1. MUTUALLY EXCLUSIVE. Two ends of one axis (a house has exactly one year
 *      built), or measured: fewer than ~25% of the pool satisfies both.
 *   2. BOTH SIDES GOOD. Never "renovated vs run-down" — the buyer is choosing
 *      between two lives worth having, not spotting the flaw.
 *   3. IT MUST MOVE THE FEED. If both answers rank the same homes, the question
 *      is decoration.
 *   4. CONCRETE OVER ABSTRACT. "Another bedroom" beats "more space".
 *   5. VISIBLE. A question a photograph can settle beats one only prose can.
 *   6. ABOUT THE HOUSE, NOT THE PEOPLE. US fair-housing: describe the property,
 *      never who lives in it.
 *
 * Rule 6 is why there is no "top-rated schools vs more house". It is a real
 * buyer conflict and one of the strongest, but school quality is a close proxy
 * for race in the US and ranking a feed on it carries real steering risk. The
 * legitimate substitutes are a buyer-initiated SEARCH, or a question about the
 * house ("walk to school / drive to school" is a commute property).
 *
 * ── Data ────────────────────────────────────────────────────────────────────
 *
 * Owner: 「if data is ready then use them, if not, just the questions
 * themselves are fine」. So a side declares `match` only when the pool can
 * actually decide it today; the rest carry copy alone and render as an unlit
 * door with its label. Nothing is faked, and a question gets its numbers the
 * day its field lands — no code change here.
 *
 * `axis` is what stops the deck asking the same thing twice: two questions that
 * share an axis are never both asked in one session (`generate-feed.ts`).
 */
import type { CardIconName } from "@percho/shared/icons";
import type { TradeoffCardV3 } from "./card-types";

/**
 * The bank, grouped by theme. Order inside a theme is the order the engine
 * prefers when nothing else separates two questions.
 */
export const TRADEOFFS: readonly TradeoffCardV3[] = [
	// ── 1. Era and condition ────────────────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-era",
		theme: "era",
		axis: "year",
		prompt: "Newer, or with a past?",
		left: {
			label: "Newer build",
			support: "Nothing to fix yet",
			icon: "check",
			match: { field: "yearBuilt", op: "gte", value: 2005 },
		},
		right: {
			label: "Older character",
			support: "Built when they used real trim",
			icon: "shop",
			match: { field: "yearBuilt", op: "lte", value: 2000 },
		},
	},
	{
		kind: "tradeoff",
		id: "to-turnkey-vs-work",
		theme: "era",
		axis: "condition",
		prompt: "Move in, or make it yours?",
		left: {
			label: "Turnkey",
			support: "Someone already did the work",
			icon: "check",
			dim: "move_in",
		},
		right: {
			label: "Priced for the work",
			support: "The discount is the budget",
			icon: "expand",
		},
	},
	{
		kind: "tradeoff",
		id: "to-kitchen-vs-systems",
		theme: "era",
		axis: "condition",
		prompt: "Where did the money go?",
		left: {
			label: "New kitchen",
			support: "You see it every day",
			icon: "cup",
			dim: "entertaining",
		},
		right: {
			label: "New roof and HVAC",
			support: "You never think about it",
			icon: "shieldCheck",
		},
	},
	{
		kind: "tradeoff",
		id: "to-neverlived-vs-proven",
		theme: "era",
		axis: "history",
		prompt: "First owner, or a known quantity?",
		left: {
			label: "Never lived in",
			support: "Everything under warranty",
			icon: "sparkle",
		},
		right: {
			label: "Settled and proven",
			support: "Its problems already surfaced",
			icon: "handshake",
		},
	},

	// ── 2. How the space is cut ─────────────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-beds-vs-rooms",
		theme: "layout",
		axis: "beds",
		prompt: "More rooms, or bigger ones?",
		left: {
			label: "Another bedroom",
			support: "One more door that closes",
			icon: "family",
			match: { field: "beds", op: "gte", value: 4 },
		},
		right: {
			label: "Bigger rooms",
			support: "The same space, fewer walls",
			icon: "expand",
			match: { field: "sqftPerBed", op: "aboveMedian" },
		},
	},
	{
		kind: "tradeoff",
		id: "to-spread-vs-upkeep",
		theme: "layout",
		axis: "sqft",
		prompt: "How much house do you want?",
		left: {
			label: "Room to spread out",
			support: "Space to grow into",
			icon: "expand",
			match: { field: "sqft", op: "aboveMedian" },
			dim: "space",
		},
		right: {
			label: "Less to keep up",
			support: "An hour to clean, not three",
			icon: "check",
			match: { field: "sqft", op: "belowMedian" },
		},
	},
	{
		kind: "tradeoff",
		id: "to-one-level-vs-two",
		theme: "layout",
		axis: "stories",
		prompt: "Stairs, or no stairs?",
		left: {
			label: "One level",
			support: "Everything on the same floor",
			icon: "walk",
		},
		right: {
			label: "Two stories",
			support: "Sleeping apart from living",
			icon: "expand",
		},
	},
	{
		kind: "tradeoff",
		id: "to-primary-placement",
		theme: "layout",
		axis: "primary",
		prompt: "Where should the primary bedroom be?",
		left: {
			label: "Primary on the main",
			support: "No stairs at the end of the day",
			icon: "moon",
		},
		right: {
			label: "All bedrooms together",
			support: "Everyone on one floor",
			icon: "family",
		},
	},
	{
		kind: "tradeoff",
		id: "to-open-vs-doors",
		theme: "layout",
		axis: "openness",
		prompt: "Open, or rooms with doors?",
		left: {
			label: "One big open space",
			support: "Everyone in the same room",
			icon: "expand",
		},
		right: {
			label: "Rooms with doors",
			support: "A call nobody else hears",
			icon: "moon",
		},
	},

	// ── 3. The spare room ───────────────────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-office-vs-guest",
		theme: "spare-room",
		axis: "spare-room",
		prompt: "What is the spare room for?",
		left: {
			label: "A home office",
			support: "A door you can shut at nine",
			icon: "check",
		},
		right: {
			label: "A guest room",
			support: "Somewhere for people to stay",
			icon: "family",
		},
	},
	{
		kind: "tradeoff",
		id: "to-basement-vs-main",
		theme: "spare-room",
		axis: "basement",
		prompt: "Down, or out?",
		left: {
			label: "Finished basement",
			support: "A whole floor nobody sees",
			icon: "expand",
		},
		right: {
			label: "Bigger main floor",
			support: "All of it on one level",
			icon: "walk",
		},
	},
	{
		kind: "tradeoff",
		id: "to-garage-vs-living",
		theme: "spare-room",
		axis: "garage",
		prompt: "Cars, or rooms?",
		left: {
			label: "A real garage",
			support: "Cars, tools, everything else",
			icon: "car",
		},
		right: {
			label: "That space as living area",
			support: "Square footage you live in",
			icon: "expand",
		},
	},

	// ── 4. Land ─────────────────────────────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-yard-vs-upkeep",
		theme: "land",
		axis: "lot",
		prompt: "A yard, or your Saturdays?",
		left: {
			label: "A yard of your own",
			support: "Room to be outside",
			icon: "yard",
			dim: "outdoors",
		},
		right: {
			label: "Nothing to mow",
			support: "Someone else handles it",
			icon: "check",
		},
	},
	{
		kind: "tradeoff",
		id: "to-flat-vs-wooded",
		theme: "land",
		axis: "terrain",
		prompt: "Use the yard, or look at it?",
		left: {
			label: "Flat and usable",
			support: "You can actually play on it",
			icon: "yard",
		},
		right: {
			label: "Wooded and private",
			support: "Trees instead of neighbors",
			icon: "tree",
			dim: "trails",
		},
	},
	{
		kind: "tradeoff",
		id: "to-pool",
		theme: "land",
		axis: "pool",
		prompt: "A pool, or one less thing?",
		left: {
			label: "A pool",
			support: "Every summer, right there",
			icon: "cup",
		},
		right: {
			label: "No pool to look after",
			support: "No cover, no chemicals, no bill",
			icon: "check",
		},
	},
	{
		kind: "tradeoff",
		id: "to-fenced-vs-open",
		theme: "land",
		axis: "enclosure",
		prompt: "Fenced in, or open out?",
		left: {
			label: "Fenced and enclosed",
			support: "Nothing gets out",
			icon: "shieldCheck",
		},
		right: {
			label: "Open and long views",
			support: "Nothing in the way",
			icon: "tree",
		},
	},

	// ── 5. Location: the density axis ───────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-quiet-vs-walkable",
		theme: "location",
		axis: "density",
		prompt: "Quiet, or in the middle of it?",
		left: {
			label: "A quiet street",
			support: "Nobody drives past",
			icon: "moon",
			dim: "quiet",
		},
		right: {
			label: "Walk to everything",
			support: "Coffee without the car",
			icon: "walk",
			dim: "walkable",
		},
	},
	{
		kind: "tradeoff",
		id: "to-closer-vs-more",
		theme: "location",
		axis: "commute",
		prompt: "Closer in, or more house?",
		left: {
			label: "Closer in",
			support: "Twenty minutes back every day",
			icon: "car",
		},
		right: {
			label: "More house for it",
			support: "The same money goes further out",
			icon: "expand",
		},
	},
	{
		kind: "tradeoff",
		id: "to-trees-vs-new-streets",
		theme: "location",
		axis: "neighborhood-age",
		prompt: "Grown in, or brand new?",
		left: {
			label: "Mature trees",
			support: "Forty years of shade",
			icon: "tree",
			dim: "trails",
		},
		right: {
			label: "Brand-new streets",
			support: "Nothing has worn out yet",
			icon: "sparkle",
			dim: "move_in",
		},
	},
	{
		kind: "tradeoff",
		id: "to-culdesac-vs-sidewalks",
		theme: "location",
		axis: "street",
		prompt: "A dead end, or a way through?",
		left: {
			label: "A cul-de-sac",
			support: "The street is yours",
			icon: "moon",
			dim: "quiet",
		},
		right: {
			label: "Sidewalks and a way through",
			support: "You can walk somewhere",
			icon: "path",
			dim: "walkable",
		},
	},
	{
		kind: "tradeoff",
		id: "to-transit-vs-quiet",
		theme: "location",
		axis: "transit",
		prompt: "Near the train, or away from it?",
		left: {
			label: "Near the train",
			support: "Leave the car at home",
			icon: "walk",
		},
		right: {
			label: "Away from the noise",
			support: "You never hear it",
			icon: "moon",
			dim: "quiet",
		},
	},

	// ── 6. Money ────────────────────────────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-space-vs-price",
		theme: "money",
		axis: "price-per-sqft",
		prompt: "More space, or less to pay?",
		left: {
			label: "More space",
			support: "Every extra foot costs",
			icon: "expand",
			match: { field: "sqft", op: "aboveMedian" },
		},
		right: {
			label: "Less to pay",
			support: "Keep the difference",
			icon: "check",
			match: { field: "price", op: "belowMedian" },
		},
	},
	{
		kind: "tradeoff",
		id: "to-topofbudget-vs-room",
		theme: "money",
		axis: "budget",
		prompt: "Spend it all, or keep some back?",
		left: {
			label: "Top of your budget",
			support: "The best house you can buy",
			icon: "sparkle",
			match: { field: "price", op: "aboveMedian" },
		},
		right: {
			label: "Room left to make it yours",
			support: "Money for what comes after",
			icon: "expand",
			match: { field: "price", op: "belowMedian" },
		},
	},
	{
		kind: "tradeoff",
		id: "to-hoa",
		theme: "money",
		axis: "hoa",
		prompt: "Shared amenities, or no dues?",
		left: {
			label: "HOA with a pool and tennis",
			support: "Maintained, for a monthly fee",
			icon: "family",
		},
		right: {
			label: "No HOA, no rules, no dues",
			support: "Your house, your call",
			icon: "check",
		},
	},
	{
		kind: "tradeoff",
		id: "to-price-vs-monthly",
		theme: "money",
		axis: "carrying-cost",
		prompt: "Lower price, or lower monthly?",
		left: {
			label: "Lower price",
			support: "Less to borrow up front",
			icon: "check",
		},
		right: {
			label: "Lower monthly",
			support: "Taxes and dues matter more",
			icon: "handshake",
		},
	},

	// ── 7. Daily life ───────────────────────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-kitchen-vs-gathering",
		theme: "daily",
		axis: "main-floor-split",
		prompt: "Cook in it, or gather in it?",
		left: {
			label: "A kitchen you cook in",
			support: "Counter, light, room to work",
			icon: "cup",
			dim: "entertaining",
		},
		right: {
			label: "A room everyone gathers in",
			support: "Where people actually end up",
			icon: "family",
		},
	},
	{
		kind: "tradeoff",
		id: "to-laundry",
		theme: "daily",
		axis: "laundry",
		prompt: "Where should the laundry be?",
		left: {
			label: "Upstairs by the bedrooms",
			support: "Where the clothes already are",
			icon: "check",
		},
		right: {
			label: "On the main floor",
			support: "No baskets on the stairs",
			icon: "walk",
		},
	},
	{
		kind: "tradeoff",
		id: "to-dining",
		theme: "daily",
		axis: "dining",
		prompt: "A dining room, or one big table?",
		left: {
			label: "A formal dining room",
			support: "For the nights that deserve it",
			icon: "cup",
		},
		right: {
			label: "One big table in the open",
			support: "Used every single day",
			icon: "family",
		},
	},
	{
		kind: "tradeoff",
		id: "to-storage-vs-walls",
		theme: "daily",
		axis: "storage",
		prompt: "Cupboards, or clear walls?",
		left: {
			label: "Storage everywhere",
			support: "Somewhere to put all of it",
			icon: "expand",
		},
		right: {
			label: "Clean open walls",
			support: "Light and nothing on it",
			icon: "sparkle",
		},
	},

	// ── 8. Timing and risk ──────────────────────────────────────────────────
	{
		kind: "tradeoff",
		id: "to-now-vs-wait",
		theme: "timing",
		axis: "timing",
		prompt: "Move now, or hold out?",
		left: {
			label: "Move in this month",
			support: "Done looking",
			icon: "check",
		},
		right: {
			label: "Wait for the right one",
			support: "It is worth another season",
			icon: "moon",
		},
	},
	{
		kind: "tradeoff",
		id: "to-dom",
		theme: "timing",
		axis: "days-on-market",
		prompt: "Room to negotiate, or first look?",
		left: {
			label: "On the market a while",
			support: "The price has room in it",
			icon: "handshake",
		},
		right: {
			label: "Just listed",
			support: "Before anyone else sees it",
			icon: "sparkle",
		},
	},
	{
		kind: "tradeoff",
		id: "to-known-vs-unseen",
		theme: "timing",
		axis: "history",
		prompt: "A known quantity, or something new?",
		left: {
			label: "A known quantity",
			support: "Sold before, inspected before",
			icon: "shieldCheck",
		},
		right: {
			label: "Something nobody has seen",
			support: "You are the first through it",
			icon: "sparkle",
		},
	},
];

/** Every icon the bank uses — asserted by `theme/icon-font.test.ts`. */
export const TRADEOFF_ICONS: readonly CardIconName[] = TRADEOFFS.flatMap((t) =>
	[t.left.icon, t.right.icon].filter((i): i is CardIconName => i !== undefined),
);
