/**
 * Top up a community's surrounding places when research came back short.
 *
 * Research resolves about seventeen surrounding places. The editorial pass then
 * takes some out — low-value stops, places another film nearby already shows —
 * and nothing put any back, so Hedgerows reached the cut with ten places and
 * Towne Village with eight, against a budget of fifteen; their films ran 52s
 * and 36s where the earlier ones ran 63–91s (owner 2026-11-21: "好像时长有变少").
 *
 * So `resolve` asks Google for the best-regarded parks, places to eat and
 * places to go around the community until there are FILL_TARGET candidates —
 * enough that an editorial pass still leaves the plan its fifteen. The plan's
 * own budget decides what is actually filmed.
 */
import { haversineMeters } from '@/lib/geo/distance';
import {
  ADMINISTRATIVE_TYPES,
  type ResolvedPoi,
  bucketFromPlace,
  scorePoi,
} from './community-tour';
import { type PlaceResult, searchNearby } from './google-places';
import { isReligiousPlace } from './religious-content';

/** Surrounding candidates `resolve` aims to hand on. */
export const FILL_TARGET = 24;
/** No more than this many fill places of one kind. */
const FILL_PER_BUCKET = 3;
/** Closer than a community tour's 7-mile ceiling: a fill place has no research behind it. */
const FILL_MAX_M = 8047;
/** A place few people have rated is not one a buyer would be shown. */
const MIN_RATING = 4.3;
const MIN_REVIEWS = 50;

/** Three nearby searches, each a family of kinds (Places allows a type list per call). */
const FILL_SEARCHES: readonly (readonly string[])[] = [
  ['park', 'playground', 'library', 'museum'],
  ['restaurant', 'cafe', 'bakery'],
  ['shopping_mall', 'gym', 'movie_theater', 'bowling_alley'],
];

/** Which nearby results to add, best first. PURE. */
export function pickFill(
  candidates: PlaceResult[],
  opts: {
    center: { lat: number; lng: number };
    have: ReadonlySet<string>;
    need: number;
  },
): ResolvedPoi[] {
  const seen = new Set(opts.have);
  const scored: Array<{ p: PlaceResult; d: number; rank: number }> = [];
  for (const p of candidates) {
    if (!p.id || seen.has(p.id) || !p.location || !p.photos?.length) continue;
    if ((p.rating ?? 0) < MIN_RATING || (p.userRatingCount ?? 0) < MIN_REVIEWS) continue;
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
    if ((p.types ?? []).some((t) => ADMINISTRATIVE_TYPES.has(t))) continue;
    if (
      isReligiousPlace({
        name: p.displayName?.text ?? null,
        primaryType: p.primaryType ?? null,
        types: p.types ?? null,
      })
    ) {
      continue;
    }
    const d = haversineMeters(opts.center, { lat: p.location.latitude, lng: p.location.longitude });
    if (d > FILL_MAX_M) continue;
    seen.add(p.id);
    // Well regarded by many, and near: the same three things a person asks.
    const rank = (p.rating ?? 0) * Math.log10(p.userRatingCount ?? 1) * (1 - d / (FILL_MAX_M * 2));
    scored.push({ p, d, rank });
  }
  scored.sort((a, b) => b.rank - a.rank || a.p.id.localeCompare(b.p.id));

  const perBucket = new Map<string, number>();
  const out: ResolvedPoi[] = [];
  for (const { p, d } of scored) {
    if (out.length >= opts.need) break;
    const bucket = bucketFromPlace(p);
    if ((perBucket.get(bucket) ?? 0) >= FILL_PER_BUCKET) continue;
    perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + 1);
    const loc = p.location as { latitude: number; longitude: number };
    out.push({
      place_id: p.id,
      name: p.displayName?.text ?? '',
      formatted_address: p.formattedAddress ?? null,
      primary_type: p.primaryType ?? null,
      types: p.types ?? null,
      raw_place: p,
      bucket,
      lat: loc.latitude,
      lng: loc.longitude,
      distance_m: Math.round(d),
      agreement: 1,
      confidence: 'medium',
      source: 'google_fill',
      why: `Well regarded nearby: ${p.rating?.toFixed(1)} from ${p.userRatingCount} reviews`,
      shot_note: '',
      photo_count: p.photos?.length ?? 0,
      rating: p.rating ?? null,
      user_ratings_total: p.userRatingCount ?? null,
      score: scorePoi({
        bucket,
        agreement: 1,
        confidence: 'medium',
        photo_count: p.photos?.length ?? 0,
        distance_m: d,
      }),
    });
  }
  return out;
}

/** Nearby places to add until the surrounding candidates reach FILL_TARGET. */
export async function fillSurroundings(
  resolved: ResolvedPoi[],
  center: { lat: number; lng: number },
): Promise<ResolvedPoi[]> {
  const surrounding = resolved.filter((r) => r.bucket !== 'amenities').length;
  const need = FILL_TARGET - surrounding;
  if (need <= 0) return [];
  const candidates: PlaceResult[] = [];
  for (const includedTypes of FILL_SEARCHES) {
    try {
      candidates.push(
        ...(await searchNearby({ center, radius: FILL_MAX_M, maxResultCount: 20, includedTypes })),
      );
    } catch (err) {
      console.warn('[fill-places] nearby search failed', {
        includedTypes,
        error: (err as Error).message,
      });
    }
  }
  return pickFill(candidates, { center, have: new Set(resolved.map((r) => r.place_id)), need });
}
