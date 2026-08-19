/**
 * Community Tour pipeline — per-step logic.
 *
 * Steps (owner-fixed 2026-08-15):
 *   1. community info     (DB read, no work)
 *   2. agent research     (dual Gemini grounding — inline, Vercel)
 *   3. resolve+merge      (Google Places Text Search firewall)
 *   4. <4 survivors       → widen radius hook (thresholds TBD)
 *   5. fetch photos       (3 per POI, 1600px, existing poi_photos pipeline)
 *   6. AI tag + duration  (Gemini → category → duration map → shot list)
 *   7. generate clips     (photo = unit, cached in photo_clips)
 *   8. assemble           (ffmpeg concat per shot list)
 *
 * Step outputs persist into community_tour_runs.step_results jsonb so the
 * admin page renders history instead of re-running.
 */

import { type PlaceResult, haversineMeters, searchNearby, searchText } from './google-places';
import { PLACES_TYPE_TO_BUCKET } from './google-places';
import { RELIGIOUS_DROP_REASON, isReligiousPlace } from './religious-content';

// ─── step 3: resolve + merge ────────────────────────────────────────────────

export interface ResolvedPoi {
  /** Google place_id — everything downstream operates on this only. */
  place_id: string;
  name: string;
  formatted_address: string | null;
  /** Google's own classification — persisted onto `pois`, and the fallback
   *  the photos step uses to derive a bucket. */
  primary_type: string | null;
  types: string[] | null;
  /**
   * The whole Places result. `fetchPhotosForCommunityPoi` reads its photo
   * references out of `pois.raw_place`, so a POI stored without it resolves
   * fine and then yields zero photos (owner 2026-08-17, Aberdeen).
   */
  raw_place: PlaceResult | null;
  bucket: string;
  lat: number;
  lng: number;
  distance_m: number | null;
  agreement: 1 | 2;
  confidence: 'high' | 'medium';
  source: string;
  why: string;
  shot_note: string;
  photo_count: number;
  rating: number | null;
  user_ratings_total: number | null;
  score: number;
  dropped?: false;
}

export interface ResolveResult {
  resolved: ResolvedPoi[];
  dropped: Array<{
    name: string;
    bucket: string;
    reason: string;
    agent: 'gemini_a' | 'gemini_b' | 'both';
  }>;
  buckets: Record<string, number>;
  /** Third dimension: top-rated Google places near the community. */
  top_rated: ResolvedPoi[];
}

/**
 * Google types that mean "an area", not "a place you can film". A search that
 * cannot find the POI happily returns the surrounding city or ZIP instead.
 */
const ADMINISTRATIVE_TYPES = new Set([
  'locality',
  'sublocality',
  'political',
  'postal_code',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'country',
  'neighborhood',
]);

/** Map a raw Places result to a tour bucket via its primary type. */
function bucketFromPlace(p: { primaryType?: string; types?: string[] }): string {
  const t = p.primaryType ?? p.types?.[0];
  if (!t) return 'other';
  return PLACES_TYPE_TO_BUCKET[t] ?? 'other';
}

/**
 * Hard ceiling on how far a POI can be and still belong in a community tour
 * (owner 2026-08-18: "不应该有市中心的喷泉啥的 除非距离真的很近").
 *
 * The old rule was `radiusMeters * 2` — 12 km with the 6 km suburban default,
 * which let Suwanee Town Center into Aberdeen's film and put its fountain in
 * the second clip. Four miles is calibrated against the Aberdeen list: it cuts
 * Town Center on Main (4.7 mi), Town Center Park (5.0), PlayTown Suwanee (4.8)
 * and Suwanee Creek Park (4.9) — all of which are across the county line in
 * Gwinnett — while keeping the assigned schools (0.9, 1.1, 3.0), the grocery
 * (1.4), the library (2.1) and the temple (2.6). Those four were the owner's
 * actual complaint, and a 5-mile line let every one of them through.
 */
export const MAX_DISTANCE_M = 6437; // 4 miles

/**
 * How much a POI's score decays with distance. 1.0 for anything inside the
 * daily orbit, then falling to 0.4 at the ceiling, so a nearer place beats a
 * further one of the same kind without the far one being silently erased —
 * a genuinely exceptional 4-mile park can still outrank a dull 1-mile one.
 */
export function distanceWeight(distanceM: number | null): number {
  if (distanceM == null) return 0.7; // unknown: neither rewarded nor condemned
  const NEAR_M = 1609; // 1 mile — full marks
  if (distanceM <= NEAR_M) return 1.0;
  if (distanceM >= MAX_DISTANCE_M) return 0.4;
  const t = (distanceM - NEAR_M) / (MAX_DISTANCE_M - NEAR_M);
  return 1.0 - 0.6 * t;
}

/** Per-bucket weight — schools first (GA buyer #1), S+A tiers, then C-tier. */
const BUCKET_WEIGHT: Record<string, number> = {
  schools: 1.0,
  dining: 0.9,
  outdoor: 0.9,
  shopping: 0.8,
  nightlife: 0.7,
  fitness: 0.7,
  kids: 0.7,
  asian_community: 0.8,
  daily_errands: 0.6,
  faith: 0.5,
  work_hubs: 0.5,
  healthcare: 0.4,
  pets: 0.4,
  transit: 0.4,
  civic: 0.6,
  waterfront: 0.9,
  other: 0.3,
};

export function bucketWeight(bucket: string): number {
  return BUCKET_WEIGHT[bucket] ?? 0.3;
}

export function scorePoi(p: {
  bucket: string;
  agreement: 1 | 2;
  confidence: 'high' | 'medium';
  photo_count: number;
  /** Straight-line metres from the community. Optional so older callers and
   *  fixtures keep working; absent scores as "unknown", not as "near". */
  distance_m?: number | null;
}): number {
  return (
    bucketWeight(p.bucket) *
    distanceWeight(p.distance_m ?? null) *
    (p.agreement === 2 ? 1.0 : 0.75) *
    (p.confidence === 'high' ? 1.0 : 0.85) *
    Math.min(1.0, p.photo_count / 3)
  );
}

export type CandidateInput = {
  name: string;
  bucket: string;
  why: string;
  shot_note: string;
  source: string;
  confidence: 'high' | 'medium';
  agent: 'gemini_a' | 'gemini_b';
};

/**
 * Resolve candidate POIs from both agents against Google Places.
 * Firewall: unresolvable / too far / non-operational → drop, no retry.
 */
export async function resolveCandidates(
  candidates: CandidateInput[],
  center: { lat: number; lng: number },
  radiusMeters: number,
  /**
   * "Alpharetta, GA" — the community's own city and state. Appended to the
   * NAME to disambiguate; the agent's guess at a street address is not used at
   * all any more. Owner 2026-08-17, on Aberdeen: the addresses came back "very
   * inaccurate" and a name+address query returned nothing, while the name plus
   * the real city resolves. The agent knows what a place is called; it does not
   * know where it is.
   */
  locality?: string,
): Promise<ResolveResult> {
  const byName = new Map<string, CandidateInput[]>();
  for (const c of candidates) {
    const key = c.name.trim().toLowerCase();
    const arr = byName.get(key) ?? [];
    arr.push(c);
    byName.set(key, arr);
  }

  const resolved: ResolvedPoi[] = [];
  const dropped: ResolveResult['dropped'] = [];

  for (const [_name, group] of byName) {
    const first = group[0]!;
    const query = [first.name, locality].filter(Boolean).join(', ');
    let places: PlaceResult[];
    try {
      // Biased to the community's circle, so a name that exists in fifty
      // states resolves to the one next door.
      places = await searchText(query, { center, radiusMeters });
    } catch (err) {
      dropped.push({
        name: first.name,
        bucket: first.bucket,
        reason: `places error: ${(err as Error).message}`,
        agent: group.some((c) => c.agent === 'gemini_a')
          ? group.some((c) => c.agent === 'gemini_b')
            ? 'both'
            : 'gemini_a'
          : 'gemini_b',
      });
      continue;
    }
    const place = places[0];
    if (!place?.id) {
      dropped.push({
        name: first.name,
        bucket: first.bucket,
        reason: 'no google result',
        agent: group.some((c) => c.agent === 'gemini_a')
          ? group.some((c) => c.agent === 'gemini_b')
            ? 'both'
            : 'gemini_a'
          : 'gemini_b',
      });
      continue;
    }
    // A name Google cannot place often resolves UP to the town it is in:
    // "Suwanee Town Center" comes back as the city of Suwanee (verified against
    // the live API, 2026-08-17). That is not a POI, has no useful photos, and
    // would put a map pin of a whole city in the tour.
    if (place.types?.some((t) => ADMINISTRATIVE_TYPES.has(t))) {
      dropped.push({
        name: first.name,
        bucket: first.bucket,
        reason: `resolved to a place type, not a POI (${place.types.find((t) => ADMINISTRATIVE_TYPES.has(t))})`,
        agent: group.some((c) => c.agent === 'gemini_a')
          ? group.some((c) => c.agent === 'gemini_b')
            ? 'both'
            : 'gemini_a'
          : 'gemini_b',
      });
      continue;
    }
    // Places of worship never reach a film. Checked here, after resolution,
    // because Google's type is the reliable signal and the agent only supplies
    // a name — NASSTA arrived as a name the agent proposed (owner 2026-08-19).
    if (
      isReligiousPlace({
        name: place.displayName?.text ?? first.name,
        bucket: first.bucket,
        primaryType: place.primaryType ?? null,
        types: place.types ?? null,
      })
    ) {
      dropped.push({
        name: first.name,
        bucket: first.bucket,
        reason: RELIGIOUS_DROP_REASON,
        agent: group.some((c) => c.agent === 'gemini_a')
          ? group.some((c) => c.agent === 'gemini_b')
            ? 'both'
            : 'gemini_a'
          : 'gemini_b',
      });
      continue;
    }
    if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
      dropped.push({
        name: first.name,
        bucket: first.bucket,
        reason: `not operational (${place.businessStatus})`,
        agent: group.some((c) => c.agent === 'gemini_a')
          ? group.some((c) => c.agent === 'gemini_b')
            ? 'both'
            : 'gemini_a'
          : 'gemini_b',
      });
      continue;
    }
    if (place.location) {
      const d = haversineMeters(center, {
        lat: place.location.latitude,
        lng: place.location.longitude,
      });
      if (d > MAX_DISTANCE_M) {
        dropped.push({
          name: first.name,
          bucket: first.bucket,
          reason: `too far (${(d / 1609).toFixed(1)} mi — a community tour stops at ${(MAX_DISTANCE_M / 1609).toFixed(0)})`,
          agent: group.some((c) => c.agent === 'gemini_a')
            ? group.some((c) => c.agent === 'gemini_b')
              ? 'both'
              : 'gemini_a'
            : 'gemini_b',
        });
        continue;
      }
    }

    const agentSet = new Set(group.map((c) => c.agent));
    const agreement: 1 | 2 = agentSet.size >= 2 ? 2 : 1;
    const confidence = group.some((c) => c.confidence === 'high') ? 'high' : 'medium';
    const best = group.find((c) => c.confidence === 'high') ?? group[0]!;
    const photo_count = place.photos?.length ?? 0;

    resolved.push({
      place_id: place.id,
      name: place.displayName?.text ?? first.name,
      formatted_address: place.formattedAddress ?? null,
      primary_type: place.primaryType ?? null,
      types: place.types ?? null,
      raw_place: place,
      bucket: first.bucket,
      lat: place.location?.latitude ?? center.lat,
      lng: place.location?.longitude ?? center.lng,
      distance_m: place.location
        ? Math.round(
            haversineMeters(center, {
              lat: place.location.latitude,
              lng: place.location.longitude,
            }),
          )
        : null,
      agreement,
      confidence,
      source: best.source,
      why: best.why,
      shot_note: best.shot_note,
      photo_count,
      rating: place.rating ?? null,
      user_ratings_total: place.userRatingCount ?? null,
      score: scorePoi({
        bucket: first.bucket,
        agreement,
        confidence,
        photo_count,
        distance_m: place.location
          ? haversineMeters(center, {
              lat: place.location.latitude,
              lng: place.location.longitude,
            })
          : null,
      }),
    });
  }

  resolved.sort((a, b) => b.score - a.score);

  // ── Third dimension: top-rated Google places nearby (owner 2026-08-16).
  // Places API v1 has no rating sort — pull 20 and pick the best-rated 3.
  // Top-10 was mostly merchants; keep it to a handful of true standouts.
  const seenIds = new Set(resolved.map((r) => r.place_id));
  let topRated: ResolvedPoi[] = [];
  try {
    const nearby = await searchNearby({ center, radius: radiusMeters, maxResultCount: 20 });
    topRated = nearby
      .filter((p) => p.rating != null && p.userRatingCount != null && !seenIds.has(p.id))
      // Same ceiling as the agent path: a 4.8-star restaurant six miles out is
      // still not part of living here.
      .filter(
        (p) =>
          !p.location ||
          haversineMeters(center, { lat: p.location.latitude, lng: p.location.longitude }) <=
            MAX_DISTANCE_M,
      )
      // A nearby search ranks by rating and knows nothing of the policy; a
      // well-reviewed church would walk straight in.
      .filter(
        (p) =>
          !isReligiousPlace({
            name: p.displayName?.text ?? null,
            primaryType: p.primaryType ?? null,
            types: p.types ?? null,
          }),
      )
      .sort(
        (a, b) =>
          (b.rating ?? 0) - (a.rating ?? 0) || (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0),
      )
      .slice(0, 3)
      .map((p) => ({
        place_id: p.id,
        name: p.displayName?.text ?? '',
        formatted_address: p.formattedAddress ?? null,
        primary_type: p.primaryType ?? null,
        types: p.types ?? null,
        raw_place: p,
        bucket: bucketFromPlace(p),
        lat: p.location?.latitude ?? center.lat,
        lng: p.location?.longitude ?? center.lng,
        distance_m: p.location
          ? Math.round(
              haversineMeters(center, {
                lat: p.location.latitude,
                lng: p.location.longitude,
              }),
            )
          : null,
        agreement: 1 as const,
        confidence: (p.rating ?? 0) >= 4.3 ? ('high' as const) : ('medium' as const),
        source: 'google_top_rated',
        why: `Top-rated nearby: ${p.rating?.toFixed(1)}★ (${p.userRatingCount} reviews)`,
        shot_note: '',
        photo_count: p.photos?.length ?? 0,
        rating: p.rating ?? null,
        user_ratings_total: p.userRatingCount ?? null,
        score: scorePoi({
          bucket: bucketFromPlace(p),
          agreement: 1,
          confidence: 'high',
          photo_count: p.photos?.length ?? 0,
          distance_m: p.location
            ? haversineMeters(center, { lat: p.location.latitude, lng: p.location.longitude })
            : null,
        }),
      }));
    resolved.push(...topRated);
  } catch {
    // Nearby ranking is a bonus dimension — a failure here must not sink the
    // agent-resolved results.
  }

  resolved.sort((a, b) => b.score - a.score);

  const buckets: Record<string, number> = {};
  for (const r of resolved) buckets[r.bucket] = (buckets[r.bucket] ?? 0) + 1;

  return { resolved, dropped, buckets, top_rated: topRated };
}

// Duration, engine and shot ordering used to live here as a photo-category
// lookup (DURATION_BY_CATEGORY / buildShotList). They were replaced on
// 2026-08-17 by the orchestration layer in lib/poi/tour-orchestrator/, which
// derives all three from the Curator's annotations plus the pixel size. The
// lookup is deleted rather than deprecated: two engine mappings in one
// pipeline is how a clip ends up rendered by the rule nobody was reading.
