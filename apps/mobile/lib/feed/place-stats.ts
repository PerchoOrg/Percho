/**
 * Place stat bars for the Community and City cards.
 *
 * Owner spec (Tia, 2026-08-19): the community/city cards get the same bottom
 * gradient + divided info bar as the listing card. Community shows
 * Schools / Safety / Convenience / Growth; city shows Jobs / Cost of Living /
 * Commute / Growth (reference photo).
 *
 * The API does not serve these numbers yet, so this module produces
 * DETERMINISTIC random values keyed on the card id — the same card always
 * shows the same stats, different cards differ, nothing re-rolls on re-render.
 * `placeStats` is the single seam to replace when the real API data lands:
 * swap the body for the wire response and keep the `StatCell[]` shape.
 *
 * Deliberately a placeholder (`ponytail:` the module IS the placeholder — the
 * owner asked for random data now, API later).
 */

export interface StatCell {
	label: string;
	value: string;
}

export type PlaceKind = "community" | "city";

/** Small deterministic PRNG (mulberry32) seeded from the card id. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a hash of the card id — stable across renders and sessions. */
function hashId(id: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** `5.4` → `+5.4%`. Growth is always shown positive (reference photo). */
function pct(v: number): string {
	return `+${v.toFixed(1)}%`;
}

/** `8` → `8/10` — a school/safety rating. */
function outOfTen(v: number): string {
	return `${v}/10`;
}

/** `104` → `104` — a convenience / cost-of-living index. */
function index(v: number): string {
	return `${Math.round(v)}`;
}

function communityCells(rand: () => number): StatCell[] {
	return [
		{ label: "Schools", value: outOfTen(6 + Math.floor(rand() * 5)) }, // 6–10
		{ label: "Safety", value: outOfTen(6 + Math.floor(rand() * 5)) },
		{ label: "Convenience", value: index(40 + rand() * 120) }, // 40–160
		{ label: "Growth (3yr)", value: pct(1 + rand() * 7) }, // +1%–+8%
	];
}

function cityCells(rand: () => number): StatCell[] {
	return [
		{ label: "Jobs (YoY)", value: pct(0.5 + rand() * 5.5) }, // +0.5%–+6%
		{ label: "Cost of Living", value: index(75 + rand() * 75) }, // 75–150
		{ label: "Commute", value: `${Math.round(15 + rand() * 45)} min` }, // 15–60 min
		{ label: "Growth (3yr)", value: pct(1 + rand() * 7) },
	];
}

/**
 * Deterministic 4-cell stat bar for a community or city card.
 * Same id → same cells, always. Replace the body with real API data when it
 * lands — keep the shape.
 */
export function placeStats(id: string, kind: PlaceKind): StatCell[] {
	const rand = mulberry32(hashId(id));
	return kind === "community" ? communityCells(rand) : cityCells(rand);
}
