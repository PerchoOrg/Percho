/**
 * Wire → engine narrowing for `/api/mobile/feed`'s pool payload.
 *
 * The server hand-types its DTOs (`apps/web/lib/feed/*`) because
 * `database.types.ts` is a stub, so there is no generated contract binding the
 * two sides. This module is that binding, and it is deliberately strict: an
 * unparseable row is DROPPED, never defaulted. A listing without a price label
 * or a unit without a centroid would otherwise reach a card as an empty string or
 * a (0,0) coordinate — a fabricated value, which §3's "real or absent" rule
 * forbids more strongly than it forbids a short deck.
 *
 * Pure: no react/react-native/expo/zustand, so it is testable on its own.
 */
import type { DimKey } from "@percho/shared";
import { DIMS } from "@percho/shared";
import type { CommunityCardV3, ListingCardV3 } from "./card-types";
import type { FeedPool } from "./generate-feed";
import type { GeoLevel, GeoStats, GeoUnit } from "./geo-unit";
import { GEO_LEVELS } from "./geo-unit";

function str(v: unknown): string | undefined {
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
	return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function rec(v: unknown): Record<string, unknown> | null {
	return typeof v === "object" && v !== null && !Array.isArray(v)
		? (v as Record<string, unknown>)
		: null;
}

function level(v: unknown): GeoLevel | undefined {
	return GEO_LEVELS.find((l) => l === v);
}

/** Only dims the shared vocabulary actually defines — no unknown keys. */
function dims(v: unknown): DimKey[] {
	if (!Array.isArray(v)) return [];
	return v.filter((d): d is DimKey => typeof d === "string" && d in DIMS);
}

function strings(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((s): s is string => typeof s === "string" && s.length > 0);
}

function stats(v: unknown): GeoStats {
	const raw = rec(v);
	if (!raw) return {};
	const out: GeoStats = {};
	const median = rec(raw.medianListPrice);
	const value = num(median?.value);
	const sampleSize = num(median?.sampleSize);
	// Both or neither: a median with no sample size is exactly the unqualified
	// statistic the server's 8-listing floor exists to prevent.
	if (value !== undefined && sampleSize !== undefined) {
		out.medianListPrice = { value, sampleSize };
	}
	const active = num(raw.activeListings);
	if (active !== undefined && active > 0) out.activeListings = active;
	return out;
}

export function parseGeoUnit(v: unknown): GeoUnit | null {
	const raw = rec(v);
	if (!raw) return null;
	const id = str(raw.id);
	const name = str(raw.name);
	const state = str(raw.state);
	const lvl = level(raw.level);
	const centroid = rec(raw.centroid);
	const lat = num(centroid?.lat);
	const lng = num(centroid?.lng);
	if (!id || !name || !state || !lvl) return null;
	// No coordinates → no map thumb and no distance math. (0,0) is the Gulf of
	// Guinea, so a missing centroid drops the unit rather than relocating it.
	if (lat === undefined || lng === undefined) return null;

	const parentId = str(raw.parentId);
	const heroUrl = str(raw.heroUrl);
	const videoUrl = str(raw.videoUrl);
	return {
		id,
		level: lvl,
		name,
		state,
		...(parentId ? { parentId } : {}),
		centroid: { lat, lng },
		...(heroUrl ? { heroUrl } : {}),
		...(videoUrl ? { videoUrl } : {}),
		communityCount: num(raw.communityCount) ?? 0,
		sampleCommunityNames: strings(raw.sampleCommunityNames).slice(0, 3),
		stats: stats(raw.stats),
	};
}

export function parseListing(v: unknown): ListingCardV3 | null {
	const raw = rec(v);
	if (!raw) return null;
	const id = str(raw.id);
	const slug = str(raw.slug);
	const address = str(raw.address);
	const priceLabel = str(raw.priceLabel);
	const heroUrl = str(raw.heroUrl);
	// A listing card is a photo with a price on it. Missing either makes it a
	// blank card, which is worse than one fewer card in the deck.
	if (!id || !slug || !address || !priceLabel || !heroUrl) return null;

	const videoUrl = str(raw.videoUrl);
	const communityId = str(raw.communityId);
	const geoUnitId = str(raw.geoUnitId);
	const matchScore = num(raw.matchScore);
	const d = dims(raw.dims);
	return {
		kind: "listing",
		id,
		slug,
		address,
		priceLabel,
		bedBathSqft: str(raw.bedBathSqft) ?? "",
		heroUrl,
		...(videoUrl ? { videoUrl } : {}),
		...(communityId ? { communityId } : {}),
		...(geoUnitId ? { geoUnitId } : {}),
		...(matchScore !== undefined ? { matchScore } : {}),
		...(d.length > 0 ? { dims: d } : {}),
		// The server flags the gate variant; the client engine re-applies its own
		// gate on top, so these are carried through verbatim rather than inferred.
		...(raw.tease === true ? { tease: true as const } : {}),
		...(raw.preview === true ? { preview: true as const } : {}),
	};
}

export function parseCommunity(v: unknown): CommunityCardV3 | null {
	const raw = rec(v);
	if (!raw) return null;
	const id = str(raw.id);
	const slug = str(raw.slug);
	const name = str(raw.name);
	const city = str(raw.city);
	const state = str(raw.state);
	const heroUrl = str(raw.heroUrl);
	if (!id || !slug || !name || !city || !state || !heroUrl) return null;

	const videoUrl = str(raw.videoUrl);
	const geoUnitId = str(raw.geoUnitId);
	const priceLabel = str(raw.priceLabel);
	const homes = num(raw.homes);
	const pills = strings(raw.pills);
	const d = dims(raw.dims);
	return {
		kind: "community",
		id,
		slug,
		name,
		city,
		state,
		heroUrl,
		...(videoUrl ? { videoUrl } : {}),
		...(geoUnitId ? { geoUnitId } : {}),
		...(priceLabel ? { priceLabel } : {}),
		...(homes !== undefined ? { homes } : {}),
		...(pills.length > 0 ? { pills } : {}),
		...(d.length > 0 ? { dims: d } : {}),
	};
}

export interface ParsedPoolPage {
	pool: FeedPool;
	/** True when the server has no more inventory behind this offset. */
	done: boolean;
}

/**
 * Parses one `/api/mobile/feed` response. Never throws on shape: a malformed
 * body yields an empty pool and `done: true`, which the caller treats as
 * exhaustion (§1.9) rather than as a crash mid-swipe.
 */
export function parsePoolResponse(body: unknown): ParsedPoolPage {
	const raw = rec(body);
	const pool = rec(raw?.pool);
	// A body with no `pool` object at all is not a page we can page past: the
	// caller would keep asking for the next offset of something unreadable. Report
	// it as done so the §1.9 terminal card takes over instead.
	if (pool === null) {
		return {
			pool: { geoUnits: [], listings: [], communities: [] },
			done: true,
		};
	}
	const geoUnits = Array.isArray(pool.geoUnits) ? pool.geoUnits : [];
	const listings = Array.isArray(pool.listings) ? pool.listings : [];
	const communities = Array.isArray(pool.communities) ? pool.communities : [];

	const parsedListings = listings
		.map(parseListing)
		.filter((l): l is ListingCardV3 => l !== null);

	// §1.6's challenge card needs the real price NUMBER, which the wire carries
	// alongside the formatted label. A listing with no price simply isn't a
	// candidate — `pickChallenge` skips ids that are missing here, so an absent
	// price costs one challenge card rather than producing a wrong answer.
	const listingPrices: Record<string, number> = {};
	for (const l of listings) {
		const row = rec(l);
		const id = str(row?.id);
		const price = num(row?.price);
		if (id && price !== undefined && price > 0) listingPrices[id] = price;
	}

	return {
		pool: {
			geoUnits: geoUnits
				.map(parseGeoUnit)
				.filter((u): u is GeoUnit => u !== null),
			listings: parsedListings,
			communities: communities
				.map(parseCommunity)
				.filter((c): c is CommunityCardV3 => c !== null),
			listingPrices,
		},
		done: raw?.done === true,
	};
}
