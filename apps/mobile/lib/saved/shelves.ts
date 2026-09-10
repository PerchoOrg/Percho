/**
 * Saved shelves (phase272) — the shortlist grouped by PLACE. PURE: resolved
 * entries in, shelves out.
 *
 * ── Why the flat list went ──────────────────────────────────────────────────
 *
 * Owner, on the four-layout mockup (`/demos/saved-layout-v1/`): "B". A row per
 * save gave a county and a $624k house identical weight and — the real cost —
 * hid the one fact in the list that decides anything: that four of your ten
 * saves are in the same town. The buyer study put most people at "which of my
 * two or three neighbourhoods", and that question is only legible once the
 * shortlist is grouped by the place it is actually about.
 *
 * ── A saved AREA is a header, not a card ────────────────────────────────────
 *
 * The load-bearing idea. A bookmarked city card was always the odd row out: it
 * has no photograph, and what it names is not a thing beside the homes but the
 * place those homes are IN. Here it stops being a row and becomes the shelf's
 * own header — the county and the true-cost line ride along it, and the homes
 * and communities saved in that town sit underneath.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 *
 * `items` is newest-first, and a shelf takes the position of its earliest
 * member, so the town you last touched leads. Nothing is sorted by price or
 * name: the order is your own history, which is the only ranking this tab has
 * ever claimed.
 */

/** A save that has resolved far enough to know where it belongs. */
export interface ShelfEntry {
	id: string;
	kind: "listing" | "community" | "area";
	/**
	 * The city this save sits in — the group key. Absent while a row's detail
	 * is still in flight or has failed, which is why `unplaced` exists.
	 */
	place?: string;
	/** Card face. Absent on an `area`, which never draws a card. */
	title?: string;
	sub?: string;
	thumbUrl?: string;
	href?: string;
	/** `area` only: the county line the shelf header carries. */
	costLine?: string;
	/** `area` only: the lens key, for `/compare-areas`. Absent outside metro. */
	areaKey?: string;
}

export interface ShelfCard {
	id: string;
	kind: "listing" | "community";
	title: string;
	sub: string;
	thumbUrl?: string;
	href: string;
}

export interface Shelf {
	/** The town. Also the React key — one shelf per place, by construction. */
	place: string;
	/** Set when this town is ALSO saved as an area; it becomes the header. */
	area?: { id: string; costLine?: string; areaKey?: string };
	cards: ShelfCard[];
}

export interface Shelves {
	shelves: Shelf[];
	/** Saves whose place we do not know yet — still loading, or 404/error. */
	unplaced: ShelfEntry[];
}

/** The card face of an entry, or null when it has not resolved to one. */
function toCard(e: ShelfEntry): ShelfCard | null {
	if (e.kind === "area") return null;
	if (e.title === undefined || e.href === undefined) return null;
	return {
		id: e.id,
		kind: e.kind,
		title: e.title,
		sub: e.sub ?? "",
		...(e.thumbUrl ? { thumbUrl: e.thumbUrl } : {}),
		href: e.href,
	};
}

export function buildShelves(entries: readonly ShelfEntry[]): Shelves {
	const byPlace = new Map<string, Shelf>();
	const unplaced: ShelfEntry[] = [];

	for (const e of entries) {
		if (!e.place) {
			unplaced.push(e);
			continue;
		}
		let shelf = byPlace.get(e.place);
		if (!shelf) {
			// Insertion order IS the output order — `Map` preserves it, and
			// `entries` arrives newest-first.
			shelf = { place: e.place, cards: [] };
			byPlace.set(e.place, shelf);
		}
		if (e.kind === "area") {
			// Two saved cities inside one town cannot happen (the place IS the
			// city), so the first area wins and a second would be the same row.
			if (!shelf.area) {
				shelf.area = {
					id: e.id,
					...(e.costLine ? { costLine: e.costLine } : {}),
					...(e.areaKey ? { areaKey: e.areaKey } : {}),
				};
			}
			continue;
		}
		const card = toCard(e);
		if (card) shelf.cards.push(card);
		else unplaced.push(e);
	}

	return { shelves: [...byPlace.values()], unplaced };
}

/** "2 homes · 1 neighbourhood" — what is on the shelf, or "" when it is bare. */
export function shelfCountLine(shelf: Shelf): string {
	const homes = shelf.cards.filter((c) => c.kind === "listing").length;
	const hoods = shelf.cards.filter((c) => c.kind === "community").length;
	const parts: string[] = [];
	if (homes) parts.push(`${homes} home${homes > 1 ? "s" : ""}`);
	if (hoods) parts.push(`${hoods} neighbourhood${hoods > 1 ? "s" : ""}`);
	return parts.join(" · ");
}

/** The listing ids on a shelf — what its own "Compare N" hands to `/compare`. */
export function shelfListingIds(shelf: Shelf): string[] {
	return shelf.cards.filter((c) => c.kind === "listing").map((c) => c.id);
}
