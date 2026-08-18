import {
  type CitySectorResearchOutput,
  buildCitySectorResearchPrompt,
} from '@/lib/ai/city-sector-tour-prompt';
import { type GeoJsonPolygonLike, pointInPolygon } from '@/lib/geo/point-in-polygon';
import type { Json } from '@/lib/supabase/database.types';
import { extractJsonObject } from '@/lib/utils/extract-json';
import {
  type CandidateInput,
  type ResolveResult,
  type ResolvedPoi,
  resolveCandidates,
  scorePoi,
} from './community-tour';
import { PLACES_TYPE_TO_BUCKET, haversineMeters, searchNearby } from './google-places';
import { type RunRow, type TourDb, asJson, mustWrite } from './tour-steps/shared';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface CitySectorDefinition {
  community_id: string;
  run: RunRow;
  slug: string;
  name: string;
  city: string;
  state: string;
  description: string | null;
  lat: number;
  lng: number;
  boundary: GeoJsonPolygonLike;
}

export interface CitySectorBatchResult {
  prompt: string;
  research: CitySectorResearchOutput;
  raw: string;
  usage: { input_tokens: number; output_tokens: number };
  sectors: Record<string, { resolved: number; dropped: number }>;
}

const FALLBACK_TYPES = [
  'secondary_school',
  'park',
  'tourist_attraction',
  'shopping_mall',
  'supermarket',
  'grocery_store',
  'cafe',
  'movie_theater',
  'library',
  'church',
  'mosque',
  'hindu_temple',
] as const;

const CHAPTER_RANK: Record<string, number> = {
  civic: 0,
  schools: 1,
  kids: 1,
  outdoor: 2,
  waterfront: 2,
  fitness: 2,
  shopping: 3,
  daily_errands: 3,
  asian_community: 3,
  dining: 4,
  nightlife: 4,
  faith: 4,
  other: 4,
};

/** Google-only recall for a thin sector; never invokes an LLM. */
export async function findPolygonFallbackPois(
  definition: CitySectorDefinition,
  excludePlaceIds: Set<string>,
  targetCount = 8,
  existingPois: ResolvedPoi[] = [],
): Promise<ResolvedPoi[]> {
  const found = new Map<string, ResolvedPoi>();
  for (const type of FALLBACK_TYPES) {
    const places = await searchNearby({
      center: { lat: definition.lat, lng: definition.lng },
      radius: 7000,
      includedTypes: [type],
      maxResultCount: 20,
    });
    for (const place of places) {
      if (
        !place.id ||
        !place.location ||
        excludePlaceIds.has(place.id) ||
        found.has(place.id) ||
        !pointInPolygon(place.location.longitude, place.location.latitude, definition.boundary) ||
        (place.photos?.length ?? 0) === 0 ||
        (place.businessStatus && place.businessStatus !== 'OPERATIONAL')
      ) {
        continue;
      }
      const bucket =
        PLACES_TYPE_TO_BUCKET[place.primaryType ?? ''] ?? PLACES_TYPE_TO_BUCKET[type] ?? 'other';
      found.set(place.id, {
        place_id: place.id,
        name: place.displayName?.text ?? '',
        formatted_address: place.formattedAddress ?? null,
        primary_type: place.primaryType ?? null,
        types: place.types ?? null,
        raw_place: place,
        bucket,
        lat: place.location.latitude,
        lng: place.location.longitude,
        distance_m: Math.round(
          haversineMeters(
            { lat: definition.lat, lng: definition.lng },
            { lat: place.location.latitude, lng: place.location.longitude },
          ),
        ),
        agreement: 1,
        confidence: 'medium',
        source: 'google_polygon_nearby_fallback',
        why: `Representative ${bucket} POI inside ${definition.name}`,
        shot_note: '',
        photo_count: place.photos?.length ?? 0,
        rating: place.rating ?? null,
        user_ratings_total: place.userRatingCount ?? null,
        score: scorePoi({
          bucket,
          agreement: 1,
          confidence: 'medium',
          photo_count: place.photos?.length ?? 0,
        }),
        suggested_sector_slug: definition.slug,
      });
    }
  }
  const ranked = [...found.values()].sort(
    (a, b) =>
      (CHAPTER_RANK[a.bucket] ?? 4) - (CHAPTER_RANK[b.bucket] ?? 4) ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0),
  );
  const selected: ResolvedPoi[] = [];
  const perBucket = new Map<string, number>();
  for (const poi of existingPois) {
    perBucket.set(poi.bucket, (perBucket.get(poi.bucket) ?? 0) + 1);
  }
  for (const poi of ranked) {
    const cap = poi.bucket === 'outdoor' ? 3 : 2;
    if ((perBucket.get(poi.bucket) ?? 0) >= cap) continue;
    selected.push(poi);
    perBucket.set(poi.bucket, (perBucket.get(poi.bucket) ?? 0) + 1);
    if (selected.length >= targetCount) break;
  }
  return selected;
}

function parseOutput(raw: string, expectedSlugs: Set<string>): CitySectorResearchOutput {
  const candidates: CitySectorResearchOutput[] = [];
  for (let offset = 0; offset < raw.length; offset += 1) {
    const relative = raw.slice(offset).indexOf('{');
    if (relative < 0) break;
    const start = offset + relative;
    const json = extractJsonObject(raw.slice(start));
    if (!json) break;
    try {
      const parsed = JSON.parse(json) as CitySectorResearchOutput;
      if (Array.isArray(parsed.sectors)) candidates.push(parsed);
    } catch {
      // Grounded model output can contain a search-shaped object before the
      // final answer. Ignore it and continue scanning for the sector payload.
    }
    offset = start + json.length - 1;
  }
  const parsed = candidates.at(-1);
  if (!parsed)
    throw new Error(`city-sector research returned no complete sector JSON (${raw.length} chars)`);
  const returned = new Set(parsed.sectors.map((sector) => sector.sector_slug));
  for (const slug of expectedSlugs) {
    if (!returned.has(slug)) throw new Error(`city-sector research omitted ${slug}`);
  }
  return parsed;
}

async function callResearch(prompt: string): Promise<{
  raw: string;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 12_000,
      },
    }),
  });
  if (!response.ok)
    throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const raw = data.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text ?? '';
  return {
    raw,
    usage: {
      input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/** One LLM call + one global Places resolve pass for every sector in a city. */
export async function runCitySectorResearchBatch(
  sb: TourDb,
  definitions: CitySectorDefinition[],
): Promise<CitySectorBatchResult> {
  if (definitions.length < 2) throw new Error('city-sector batch requires at least two sectors');
  const city = definitions[0]!.city;
  const state = definitions[0]!.state;
  if (definitions.some((sector) => sector.city !== city || sector.state !== state)) {
    throw new Error('all sectors in a city batch must share city/state');
  }
  const promptInput = {
    city,
    state,
    sectors: definitions.map(({ slug, name, description, lat, lng, boundary }) => ({
      slug,
      name,
      description,
      lat,
      lng,
      boundary,
    })),
  };
  const prompt = buildCitySectorResearchPrompt(promptInput);
  const called = await callResearch(prompt);
  const expectedSlugs = new Set(definitions.map((sector) => sector.slug));
  const research = parseOutput(called.raw, expectedSlugs);

  const sectorResearch = new Map(research.sectors.map((sector) => [sector.sector_slug, sector]));
  const candidates: CandidateInput[] = [];
  for (const definition of definitions) {
    const sector = sectorResearch.get(definition.slug)!;
    sector.pois.forEach((poi, index) => {
      candidates.push({
        ...poi,
        confidence: poi.confidence === 'high' ? 'high' : 'medium',
        agent: 'gemini_a',
        narrative_order: index,
        suggested_sector_slug: definition.slug,
      });
    });
  }

  const center = {
    lat: definitions.reduce((sum, sector) => sum + sector.lat, 0) / definitions.length,
    lng: definitions.reduce((sum, sector) => sum + sector.lng, 0) / definitions.length,
  };
  const radiusMeters = Math.max(
    6000,
    ...definitions.map(
      (sector) => haversineMeters(center, { lat: sector.lat, lng: sector.lng }) + 8000,
    ),
  );
  const global = await resolveCandidates(candidates, center, radiusMeters, `${city}, ${state}`);

  const assigned = new Map<string, ResolveResult['resolved']>(
    definitions.map((sector) => [sector.slug, []]),
  );
  const outside: ResolveResult['dropped'] = [...global.dropped];
  for (const poi of global.resolved) {
    const owner = definitions.find((sector) => pointInPolygon(poi.lng, poi.lat, sector.boundary));
    if (!owner) {
      outside.push({
        name: poi.name,
        bucket: poi.bucket,
        reason: 'outside every sector polygon',
        agent: 'gemini_a',
      });
      continue;
    }
    assigned.get(owner.slug)!.push(poi);
  }

  const globallyAssigned = new Set([...assigned.values()].flat().map((poi) => poi.place_id));
  for (const definition of definitions) {
    const current = assigned.get(definition.slug)!;
    const uniqueNames = new Map<string, ResolvedPoi>();
    for (const poi of current) {
      const key = poi.name.trim().toLowerCase();
      if (!uniqueNames.has(key)) uniqueNames.set(key, poi);
    }
    current.splice(0, current.length, ...uniqueNames.values());
    if (current.length >= 6) continue;
    const fallback = await findPolygonFallbackPois(
      definition,
      globallyAssigned,
      8 - current.length,
      current,
    );
    current.push(...fallback);
    for (const poi of fallback) globallyAssigned.add(poi.place_id);
  }

  const summary: CitySectorBatchResult['sectors'] = {};
  for (const definition of definitions) {
    const resolved = assigned.get(definition.slug)!;
    resolved.sort(
      (a, b) =>
        (a.suggested_sector_slug === definition.slug ? 0 : 1) -
          (b.suggested_sector_slug === definition.slug ? 0 : 1) ||
        (a.narrative_order ?? 999) - (b.narrative_order ?? 999) ||
        b.score - a.score,
    );
    resolved.forEach((poi, index) => {
      poi.narrative_order = index;
    });
    const buckets: Record<string, number> = {};
    for (const poi of resolved) buckets[poi.bucket] = (buckets[poi.bucket] ?? 0) + 1;
    const ownSuggested = new Set(
      sectorResearch.get(definition.slug)!.pois.map((poi) => poi.name.trim().toLowerCase()),
    );
    const dropped = outside.filter((item) => ownSuggested.has(item.name.trim().toLowerCase()));
    const resolve: ResolveResult = { resolved, dropped, buckets, top_rated: [] };
    const agentResearch = {
      city_batch: true,
      city_research: research,
      community: {
        name: definition.name,
        city: definition.city,
        state: definition.state,
        lat: definition.lat,
        lng: definition.lng,
      },
      prompt,
      agents: {
        gemini_a: {
          ok: true,
          parsed: sectorResearch.get(definition.slug),
          raw: null,
          usage: called.usage,
        },
      },
    };
    await mustWrite(
      `save city-sector batch(${definition.slug})`,
      sb
        .from('community_tour_runs')
        .update({
          status: resolved.length >= 4 ? 'fetching_photos' : 'resolving',
          step_results: asJson({
            ...definition.run.step_results,
            agent_research: agentResearch as unknown as Json,
            resolve: resolve as unknown as Json,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', definition.run.id),
    );
    summary[definition.slug] = { resolved: resolved.length, dropped: dropped.length };
  }

  return { prompt, research, raw: called.raw, usage: called.usage, sectors: summary };
}
