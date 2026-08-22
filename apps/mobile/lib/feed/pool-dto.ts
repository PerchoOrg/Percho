import { DIMS } from "@percho/shared/dims";
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
import type { CardIconName } from "@percho/shared/icons";
import { CARD_ICON_NAMES } from "@percho/shared/icons";
import type { DimKey } from "@percho/shared/types";
import type {
	CommunityCardV3,
	CommunityReasonV3,
	CommunitySignalV3,
	ListingCardV3,
	NeighborhoodScores,
	ScoreDimension,
	ScoreDimensionKey,
} from "./card-types";
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

/**
 * The three "why people love it" tiles.
 *
 * Strict for the same reason the rest of this module is: a reason whose `icon` is
 * not in the shipped font renders a TOFU BOX on device and nowhere else — the
 * exact failure class `theme/icon-font.test.ts` exists to catch on the app side,
 * except here the bad name comes off the wire where no test can see it. An
 * unknown icon drops the whole tile rather than substituting a default glyph:
 * a wrong picture under a resident's words is a fabricated claim, and three
 * tiles is a target, not a quota.
 *
 * `fact` is optional and absent on most real tiles (57.1% of communities have
 * none at all) — see `CommunityCardV3.reasons`.
 */
function reasons(v: unknown): CommunityReasonV3[] {
	if (!Array.isArray(v)) return [];
	const out: CommunityReasonV3[] = [];
	for (const item of v) {
		const raw = rec(item);
		if (!raw) continue;
		const label = str(raw.label);
		const icon = CARD_ICON_NAMES.find((n) => n === raw.icon) as
			| CardIconName
			| undefined;
		if (!label || !icon) continue;
		const fact = str(raw.fact);
		out.push({ label, icon, ...(fact ? { fact } : {}) });
	}
	return out;
}

/**
 * The lifestyle signals, each with the glyph the server picked for it.
 *
 * The glyph is dropped when the shipped subset font cannot draw it — the same
 * check the reason tiles do, and for the same reason: an icon name now crosses
 * the wire, and a name this build's font lacks renders as a tofu box. Dropping
 * the icon keeps the LABEL, which is the part that carries meaning.
 */
function signals(v: unknown): CommunitySignalV3[] {
	if (!Array.isArray(v)) return [];
	const out: CommunitySignalV3[] = [];
	for (const item of v) {
		const raw = rec(item);
		if (!raw) continue;
		const label = str(raw.label);
		if (!label) continue;
		const icon = CARD_ICON_NAMES.find((n) => n === raw.icon) as
			| CardIconName
			| undefined;
		out.push({ label, ...(icon ? { icon } : {}) });
	}
	return out;
}

function strings(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/**
 * The tour's per-place progress segments.
 *
 * Validated harder than `signals` is, and for a different reason: a bad string
 * costs a wrong chip, whereas a bad `endFraction` lays out the whole dashed bar
 * wrong. Every entry must be a finite fraction in (0, 1] and the sequence must
 * RISE — that is what makes each dash's width (this end minus the last) a
 * positive number. Anything else yields `[]` and the card draws a plain bar,
 * which needs no structure to be correct.
 */
function tourSegments(v: unknown): { name: string; endFraction: number }[] {
	if (!Array.isArray(v)) return [];
	const out: { name: string; endFraction: number }[] = [];
	let prev = 0;
	for (const raw of v) {
		const r = rec(raw);
		if (r === null) return [];
		const endFraction = num(r.endFraction);
		if (endFraction === undefined || endFraction <= prev || endFraction > 1)
			return [];
		prev = endFraction;
		out.push({ name: str(r.name) ?? "", endFraction });
	}
	return out;
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

/**
 * Neighborhood scores off the wire.
 *
 * Validated field by field rather than cast, like everything else in this file:
 * a malformed `dims` entry must not reach the renderer as a partially-shaped
 * object. In particular `score` distinguishes three states —
 *
 *   a finite number → show it
 *   explicit null    → "no source", the card shows an em dash
 *   anything else    → treat as null; never coerce to 0
 *
 * That last line is the whole point. `Number(undefined)` is NaN and
 * `Number(null)` is 0, so a sloppy parse here would silently claim a
 * neighbourhood scored zero on Safety.
 */
function scores(v: unknown): NeighborhoodScores | undefined {
	const raw = rec(v);
	if (!raw) return undefined;
	if (!Array.isArray(raw.dims)) return undefined;

	const valid: ScoreDimensionKey[] = [
		"safety",
		"schools",
		"convenience",
		"potential",
	];
	const dims: ScoreDimension[] = [];
	for (const entry of raw.dims) {
		const d = rec(entry);
		if (!d) continue;
		const key = str(d.key);
		const label = str(d.label);
		if (!key || !label) continue;
		if (!valid.includes(key as ScoreDimensionKey)) continue;
		const score = num(d.score);
		dims.push({
			key: key as ScoreDimensionKey,
			label,
			// `num` returns undefined for null/NaN/non-numbers alike, which is
			// exactly the "unknown" case — normalise it to null.
			score: score === undefined ? null : score,
			count: num(d.count) ?? 0,
			...(num(d.nearestM) !== undefined ? { nearestM: num(d.nearestM) } : {}),
			...(str(d.reason) ? { reason: str(d.reason) } : {}),
		});
	}
	if (dims.length === 0) return undefined;

	const overall = num(raw.overall);
	return { overall: overall === undefined ? null : overall, dims };
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
	// Both or neither — a lone coordinate cannot place a pin.
	const lat = num(raw.lat);
	const lng = num(raw.lng);
	const mapUrl = str(raw.mapUrl);
	// "Peachtree Corners, GA" — both parts or nothing. A lone state reads as a
	// broken sub-line under the street address.
	const city = str(raw.city);
	const state = str(raw.state);
	const locality = city && state ? `${city}, ${state}` : city;
	const zip = str(raw.zip);
	const description = strings(raw.description);
	const sc = scores(raw.scores);
	const d = dims(raw.dims);
	// >1 guard repeated client-side: a stale/hand-rolled server must not be able
	// to make the pill read "1 Photos".
	const pc = num(raw.photoCount);
	const photoCount = pc !== undefined && pc > 1 ? Math.floor(pc) : undefined;
	return {
		kind: "listing",
		id,
		slug,
		address,
		priceLabel,
		bedBathSqft: str(raw.bedBathSqft) ?? "",
		heroUrl,
		...(videoUrl ? { videoUrl } : {}),
		...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
		...(mapUrl ? { mapUrl } : {}),
		...(locality ? { locality } : {}),
		...(zip ? { zip } : {}),
		...(description.length > 0 ? { description } : {}),
		...(sc ? { scores: sc } : {}),
		...(communityId ? { communityId } : {}),
		...(geoUnitId ? { geoUnitId } : {}),
		...(matchScore !== undefined ? { matchScore } : {}),
		...(d.length > 0 ? { dims: d } : {}),
		...(photoCount !== undefined ? { photoCount } : {}),
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
	const r = reasons(raw.reasons);
	// Distinctive lifestyle signals — the chip row's primary content
	// (2026-08-15). No validation beyond non-empty strings: the server owns the
	// vocabulary, and a stale build must not drop pills for the whole pool.
	const signalList = signals(raw.signals);
	const segments = tourSegments(raw.tourSegments);
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
		...(r.length > 0 ? { reasons: r } : {}),
		...(signalList.length > 0 ? { signals: signalList } : {}),
		...(segments.length > 0 ? { tourSegments: segments } : {}),
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

	return {
		pool: {
			geoUnits: geoUnits
				.map(parseGeoUnit)
				.filter((u): u is GeoUnit => u !== null),
			listings: parsedListings,
			communities: communities
				.map(parseCommunity)
				.filter((c): c is CommunityCardV3 => c !== null),
		},
		done: raw?.done === true,
	};
}
