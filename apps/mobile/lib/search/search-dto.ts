/**
 * Search result DTO (phase D) — mirrors `apps/web/lib/listings/search.ts`.
 * Parsed defensively so a field the server stops sending degrades to a
 * text-only row rather than a crash.
 */

export interface SearchListing {
	id: string;
	slug: string;
	address: string;
	city: string;
	state: string;
	zip?: string;
	price?: number;
	beds?: number;
	baths?: number;
	sqft?: number;
	coverUrl?: string;
	lat?: number;
	lng?: number;
}

export interface SearchCommunity {
	id: string;
	slug: string;
	name: string;
	city: string;
	state: string;
	heroUrl?: string;
	lat?: number;
	lng?: number;
	/** Outer rings, `[lng, lat]` — the same shape `AreaShape.rings` uses.
	 *  Absent for a community we have no polygon for; the map draws its pin. */
	boundary?: [number, number][][];
}

export interface SearchResult {
	listings: SearchListing[];
	communities: SearchCommunity[];
}

const str = (v: unknown): string | undefined =>
	typeof v === "string" && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
	typeof v === "number" && Number.isFinite(v) ? v : undefined;

function parseListing(v: unknown): SearchListing | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const id = str(o.id);
	const slug = str(o.slug);
	const address = str(o.address);
	const city = str(o.city);
	if (!id || !slug || !address || !city) return null;
	return {
		id,
		slug,
		address,
		city,
		state: str(o.state) ?? "GA",
		zip: str(o.zip),
		price: num(o.price),
		beds: num(o.beds),
		baths: num(o.baths),
		sqft: num(o.sqft),
		coverUrl: str(o.coverUrl),
		lat: num(o.lat),
		lng: num(o.lng),
	};
}

/** `[[lng, lat], …][]`, keeping only rings that can actually be drawn. */
function parseBoundary(v: unknown): [number, number][][] | undefined {
	if (!Array.isArray(v)) return undefined;
	const rings: [number, number][][] = [];
	for (const raw of v) {
		if (!Array.isArray(raw)) continue;
		const ring: [number, number][] = [];
		for (const pt of raw) {
			if (!Array.isArray(pt)) continue;
			const lng = num(pt[0]);
			const lat = num(pt[1]);
			if (lng === undefined || lat === undefined) continue;
			ring.push([lng, lat]);
		}
		// Three points and a close. Fewer is a line, which renders as a scar
		// across the map rather than as a shape.
		if (ring.length >= 4) rings.push(ring);
	}
	return rings.length > 0 ? rings : undefined;
}

function parseCommunity(v: unknown): SearchCommunity | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const id = str(o.id);
	const slug = str(o.slug);
	const name = str(o.name);
	const city = str(o.city);
	if (!id || !slug || !name || !city) return null;
	return {
		id,
		slug,
		name,
		city,
		state: str(o.state) ?? "GA",
		heroUrl: str(o.heroUrl),
		lat: num(o.lat),
		lng: num(o.lng),
		boundary: parseBoundary(o.boundary),
	};
}

export function parseSearchResult(json: unknown): SearchResult {
	const o = (json ?? {}) as Record<string, unknown>;
	const listings = Array.isArray(o.listings) ? o.listings : [];
	const communities = Array.isArray(o.communities) ? o.communities : [];
	return {
		listings: listings
			.map(parseListing)
			.filter((x): x is SearchListing => x !== null),
		communities: communities
			.map(parseCommunity)
			.filter((x): x is SearchCommunity => x !== null),
	};
}
