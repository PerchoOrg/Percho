/**
 * Community Tour pipeline — per-step logic.
 *
 * Steps (owner-fixed 2026-08-15):
 *   1. community info     (DB read, no work)
 *   2. agent research     (claude/codex CLI — LOCAL DEV ONLY, see
 *                          scripts/community-tour/agent-research.ts)
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
    agent: 'claude' | 'codex' | 'both';
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
  agent: 'claude' | 'codex';
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
        agent: group.some((c) => c.agent === 'claude')
          ? group.some((c) => c.agent === 'codex')
            ? 'both'
            : 'claude'
          : 'codex',
      });
      continue;
    }
    const place = places[0];
    if (!place?.id) {
      dropped.push({
        name: first.name,
        bucket: first.bucket,
        reason: 'no google result',
        agent: group.some((c) => c.agent === 'claude')
          ? group.some((c) => c.agent === 'codex')
            ? 'both'
            : 'claude'
          : 'codex',
      });
      continue;
    }
    if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
      dropped.push({
        name: first.name,
        bucket: first.bucket,
        reason: `not operational (${place.businessStatus})`,
        agent: group.some((c) => c.agent === 'claude')
          ? group.some((c) => c.agent === 'codex')
            ? 'both'
            : 'claude'
          : 'codex',
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
          agent: group.some((c) => c.agent === 'claude')
            ? group.some((c) => c.agent === 'codex')
              ? 'both'
              : 'claude'
            : 'codex',
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
          (b.rating ?? 0) - (a.rating ?? 0) ||
          (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0),
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
        score: scorePoi({ bucket: bucketFromPlace(p), agreement: 1, confidence: 'high', photo_count: p.photos?.length ?? 0 }),
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

// ─── step 6: duration by photo category ─────────────────────────────────────

/**
 * Duration per photo category — decided at tag time, cached with the clip.
 * Owner: "每个照片不是固定生成4s的clip - 需要根据照片内容决定时间长度 最长4s".
 * Aerial/landscape get the full walk; interiors/details breathe shorter.
 */
export const DURATION_BY_CATEGORY: Record<string, number> = {
  aerial: 4.0,
  landscape: 4.0,
  storefront: 3.0,
  food: 2.5,
  interior: 2.0,
  detail: 2.5,
  people: 2.5,
  signage: 2.0, // text-heavy → depthflow/kenburns, not Seedance
  other: 2.5,
};

export function durationForCategory(category: string | null | undefined): number {
  return DURATION_BY_CATEGORY[category ?? 'other'] ?? 2.5;
}

// ─── shot list (step 6b) ────────────────────────────────────────────────────

export interface Shot {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  category: string;
  duration_s: number;
  engine: 'seedance' | 'depthflow' | 'kenburns';
  bucket: string;
}

export interface ShotListInput {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  category: string;
  usable: boolean;
  has_prominent_text: boolean;
  ai_score: number;
  bucket: string;
}

/**
 * Build the shot list: open widest (aerial/landscape), hero second, interleave
 * buckets, never two consecutive same-POI, max 2 per POI, close with activity.
 * Text-heavy photos → depthflow/kenburns; clean open scenes → seedance.
 */
export function buildShotList(inputs: ShotListInput[]): Shot[] {
  const usable = inputs
    .filter((p) => p.usable)
    .map((p) => ({
      ...p,
      engine: p.has_prominent_text
        ? ('depthflow' as const)
        : p.category === 'aerial' || p.category === 'landscape'
          ? ('seedance' as const)
          : p.category === 'storefront'
            ? ('seedance' as const)
            : ('kenburns' as const),
    }));

  const byCategory: Record<string, ShotListInput[]> = {};
  for (const p of usable) {
    (byCategory[p.category] ??= []).push(p);
  }

  const pool: Array<{ input: ShotListInput; engine: Shot['engine'] }> = [];
  for (const p of usable) {
    pool.push({ input: p, engine: p.engine });
  }
  // widen first
  const widen = ['aerial', 'landscape'];
  const openers = pool.filter((x) => widen.includes(x.input.category));
  const rest = pool.filter((x) => !widen.includes(x.input.category));

  const shots: Shot[] = [];
  const perPoi = new Map<string, number>();
  let lastPoiId: string | null = null;

  const push = (x: { input: ShotListInput; engine: Shot['engine'] }) => {
    const n = perPoi.get(x.input.poi_id) ?? 0;
    if (n >= 2) return;
    shots.push({
      photo_id: x.input.photo_id,
      poi_id: x.input.poi_id,
      poi_name: x.input.poi_name,
      category: x.input.category,
      duration_s: durationForCategory(x.input.category),
      engine: x.engine,
      bucket: x.input.bucket,
    });
    perPoi.set(x.input.poi_id, n + 1);
    lastPoiId = x.input.poi_id;
  };

  // opener: widest available
  const open = openers.sort((a, b) => (b.input.ai_score ?? 0) - (a.input.ai_score ?? 0))[0];
  if (open) push(open);

  // hero: strongest single frame (town center / park usually)
  const heroPool = rest
    .concat(openers.filter((x) => x !== open))
    .sort((a, b) => (b.input.ai_score ?? 0) - (a.input.ai_score ?? 0));
  const hero = heroPool[0]!;
  if (hero) push(hero);

  // interleave buckets, never two consecutive same-POI
  const byBucket = new Map<string, Array<{ input: ShotListInput; engine: Shot['engine'] }>>();
  for (const x of rest.concat(openers.filter((x) => x !== open && x !== hero))) {
    const arr = byBucket.get(x.input.bucket) ?? [];
    arr.push(x);
    byBucket.set(x.input.bucket, arr);
  }

  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const [, arr] of byBucket) {
      if (arr.length === 0) continue;
      // round-robin: pop highest ai_score first
      arr.sort((a, b) => (b.input.ai_score ?? 0) - (a.input.ai_score ?? 0));
      const x = arr.shift();
      if (!x) continue;
      if (lastPoiId === x.input.poi_id) {
        // try next in bucket
        const alt = arr.shift();
        if (alt) {
          push(alt);
        } else {
          // nothing else in bucket — still push (accept consecutive same-POI
          // when it's the only option; rare)
          push(x);
        }
      } else {
        push(x);
      }
      remaining = true;
    }
  }

  // close: activity/light frame if any left
  const closePool = pool.filter((x) => !shots.some((s) => s.photo_id === x.input.photo_id));
  if (closePool.length > 0) {
    const closer =
      closePool.find((x) => x.input.category === 'storefront' || x.input.category === 'people') ??
      closePool[0]!;
    push(closer);
  }

  return shots;
}
