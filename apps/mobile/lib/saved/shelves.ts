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
 * own header — the line above its card rides along it, and the homes
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
	/** FMLS listing number, FMLS homes only (IDX rule 13.7.b). */
	mlsNumber?: string;
	/** `area` only: "Suwanee, GA · Gwinnett County", as above its card. */
	placeLine?: string;
	/** `area` only: the lens key, for `/compare-areas`. Absent outside metro. */
	areaKey?: string;
	/** What the place's own page found, in a line — see `communityFact`. */
	fact?: string;
	/** Where it is, for the map view. */
	center?: { lat: number; lng: number };
}

export interface ShelfCard {
	id: string;
	kind: "listing" | "community";
	title: string;
	sub: string;
	thumbUrl?: string;
	href: string;
	mlsNumber?: string;
}

export interface Shelf {
	/** The town. Also the React key — one shelf per place, by construction. */
	place: string;
	/** Set when this town is ALSO saved as an area; it becomes the header. */
	area?: { id: string; placeLine?: string; areaKey?: string };
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
		...(e.mlsNumber ? { mlsNumber: e.mlsNumber } : {}),
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
					...(e.placeLine ? { placeLine: e.placeLine } : {}),
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

/** "2 homes · 1 community" — what is on the shelf, or "" when it is bare. */
export function shelfCountLine(shelf: Shelf): string {
	const homes = shelf.cards.filter((c) => c.kind === "listing").length;
	const hoods = shelf.cards.filter((c) => c.kind === "community").length;
	const parts: string[] = [];
	if (homes) parts.push(`${homes} home${homes > 1 ? "s" : ""}`);
	if (hoods) parts.push(`${hoods} ${hoods > 1 ? "communities" : "community"}`);
	return parts.join(" · ");
}

/** The listing ids on a shelf — what its own "Compare N" hands to `/compare`. */
export function shelfListingIds(shelf: Shelf): string[] {
	return shelf.cards.filter((c) => c.kind === "listing").map((c) => c.id);
}

/**
 * One save as the grid, list and map views draw it (phase386).
 *
 * Those three are flat — a save is a tile whatever town it is in — so here a
 * saved AREA is a tile too, named for itself, where a shelf makes it the
 * header. Its `href` is the city's page when it has one; without one the tab
 * opens it on the Search map, as the shelf header does.
 */
export interface SavedTile {
	id: string;
	kind: ShelfEntry["kind"];
	title: string;
	/** The city for a home or a community; the line above its card for a city. */
	sub: string;
	fact?: string;
	thumbUrl?: string;
	href?: string;
	center?: { lat: number; lng: number };
	mlsNumber?: string;
	areaKey?: string;
}

/** Every save that has resolved, in saved order (newest first). */
export function buildTiles(entries: readonly ShelfEntry[]): SavedTile[] {
	return entries.flatMap((e): SavedTile[] => {
		const title = e.kind === "area" ? e.place : e.title;
		if (!e.place || !title) return [];
		const sub = e.kind === "area" ? (e.placeLine ?? "") : e.place;
		return [
			{
				id: e.id,
				kind: e.kind,
				title,
				sub,
				...(e.fact ? { fact: e.fact } : {}),
				...(e.thumbUrl ? { thumbUrl: e.thumbUrl } : {}),
				...(e.href ? { href: e.href } : {}),
				...(e.center ? { center: e.center } : {}),
				...(e.mlsNumber ? { mlsNumber: e.mlsNumber } : {}),
				...(e.areaKey ? { areaKey: e.areaKey } : {}),
			},
		];
	});
}
