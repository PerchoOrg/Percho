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
	/** FMLS listing number, FMLS homes only (IDX rule 13.7.b). */
	mlsNumber?: string;
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
}

/** A city with a film (phase409); tapping it opens `/city/[slug]`. */
export interface SearchCity {
	slug: string;
	name: string;
	state: string;
	county?: string;
	posterUrl?: string;
	lat?: number;
	lng?: number;
}

/** A school (phase410); tapping it flies the map to it. */
export interface SearchSchool {
	id: string;
	name: string;
	level?: string;
	city?: string;
	zip?: string;
	lat: number;
	lng: number;
}

export interface SearchResult {
	cities: SearchCity[];
	schools: SearchSchool[];
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
		mlsNumber: str(o.mlsNumber),
	};
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
	};
}

function parseCity(v: unknown): SearchCity | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const slug = str(o.slug);
	const name = str(o.name);
	if (!slug || !name) return null;
	return {
		slug,
		name,
		state: str(o.state) ?? "GA",
		county: str(o.county),
		posterUrl: str(o.posterUrl),
		lat: num(o.lat),
		lng: num(o.lng),
	};
}

function parseSchool(v: unknown): SearchSchool | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const id = str(o.id);
	const name = str(o.name);
	const lat = num(o.lat);
	const lng = num(o.lng);
	if (!id || !name || lat === undefined || lng === undefined) return null;
	return {
		id,
		name,
		level: str(o.level),
		city: str(o.city),
		zip: str(o.zip),
		lat,
		lng,
	};
}

export function parseSearchResult(json: unknown): SearchResult {
	const o = (json ?? {}) as Record<string, unknown>;
	const listings = Array.isArray(o.listings) ? o.listings : [];
	const communities = Array.isArray(o.communities) ? o.communities : [];
	// A server from before phase409 sends no `cities`: an empty group, not a crash.
	const cities = Array.isArray(o.cities) ? o.cities : [];
	const schools = Array.isArray(o.schools) ? o.schools : [];
	return {
		schools: schools
			.map(parseSchool)
			.filter((x): x is SearchSchool => x !== null),
		cities: cities.map(parseCity).filter((x): x is SearchCity => x !== null),
		listings: listings
			.map(parseListing)
			.filter((x): x is SearchListing => x !== null),
		communities: communities
			.map(parseCommunity)
			.filter((x): x is SearchCommunity => x !== null),
	};
}
