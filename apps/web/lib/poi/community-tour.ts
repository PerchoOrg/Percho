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

import { haversineMeters, searchNearby, searchText } from './google-places';
import { PLACES_TYPE_TO_BUCKET } from './google-places';

// ─── step 3: resolve + merge ────────────────────────────────────────────────

export interface ResolvedPoi {
  /** Google place_id — everything downstream operates on this only. */
  place_id: string;
  name: string;
  formatted_address: string | null;
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

/** Map a raw Places result to a tour bucket via its primary type. */
function bucketFromPlace(p: { primaryType?: string; types?: string[] }): string {
  const t = p.primaryType ?? p.types?.[0];
  if (!t) return 'other';
  return PLACES_TYPE_TO_BUCKET[t] ?? 'other';
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
}): number {
  return (
    bucketWeight(p.bucket) *
    (p.agreement === 2 ? 1.0 : 0.75) *
    (p.confidence === 'high' ? 1.0 : 0.85) *
    Math.min(1.0, p.photo_count / 3)
  );
}

export type CandidateInput = {
  name: string;
  address_hint: string;
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

  for (const [name, group] of byName) {
    const first = group[0]!;
    const query = [first.name, first.address_hint, ''].filter(Boolean).join(' ');
    let places;
    try {
      places = await searchText(query);
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
      if (d > radiusMeters * 2) {
        dropped.push({
          name: first.name,
          bucket: first.bucket,
          reason: `too far (${Math.round(d / 1000)}km)`,
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
      score: scorePoi({ bucket: first.bucket, agreement, confidence, photo_count }),
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
      .sort(
        (a, b) =>
          (b.rating ?? 0) - (a.rating ?? 0) || (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0),
      )
      .slice(0, 3)
      .map((p) => ({
        place_id: p.id,
        name: p.displayName?.text ?? '',
        formatted_address: p.formattedAddress ?? null,
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
