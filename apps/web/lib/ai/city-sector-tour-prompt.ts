import type { GeoJsonPolygonLike } from '@/lib/geo/point-in-polygon';

export interface CitySectorPromptInput {
  city: string;
  state: string;
  sectors: Array<{
    slug: string;
    name: string;
    description: string | null;
    lat: number;
    lng: number;
    boundary: GeoJsonPolygonLike;
  }>;
}

export interface CitySectorPoiCandidate {
  name: string;
  bucket: string;
  why: string;
  shot_note: string;
  source: string;
  confidence: 'high' | 'medium';
}

export interface CitySectorResearchOutput {
  city_narrative: string;
  sectors: Array<{
    sector_slug: string;
    narrative_angle: string;
    pois: CitySectorPoiCandidate[];
  }>;
}

export function buildCitySectorResearchPrompt(input: CitySectorPromptInput): string {
  const sectors = input.sectors
    .map(
      (sector, index) => `${index + 1}. ${sector.name}
   sector_slug: ${sector.slug}
   centroid: ${sector.lat.toFixed(4)}, ${sector.lng.toFixed(4)}
   identity: ${sector.description ?? 'No additional description.'}`,
    )
    .join('\n');

  return `You are planning ONE coordinated real-estate community tour research pass for ${input.city}, ${input.state}.

The city is divided into these living-area sectors:
${sectors}

TASK
Research all sectors together. Produce one coherent city-wide editorial plan whose
sector lists are distinct, useful to home buyers, and ordered as mini-stories.
Search the web before answering and ground every POI in a source you opened.

SECTOR RULES
- Return 6-10 useful POIs per sector when the real area supports it. Never pad.
- A POI may appear in only ONE sector. Do not repeat the famous city core in
  every sector.
- suggested sector membership is only for recall. Google coordinates and the
  stored sector polygons make the final assignment after this call.
- Tie each school to exactly one sector. Do not claim that every home in the
  sector is assigned to it; listing pages verify attendance by address.
- Prefer schools, public parks, trails, civic spaces, distinctive commercial
  districts, cultural anchors, and visually informative daily-life places.
- Avoid generic urgent care, dentists, storage, pharmacies, and interchangeable
  chain storefronts unless that commercial node is genuinely part of the
  sector's identity.
- Prefer POIs with useful Google listing photos.

ORDERING RULES — the array order is a production instruction
Each sector's POIs must form this narrative arc, omitting empty chapters:
1. identity anchor / strongest establishing location
2. school and family context
3. parks, trails, recreation, or natural setting
4. daily-life commercial district, shopping, food, culture
5. warm or distinctive closing location
Keep two photos of the same POI together. Do not alternate randomly between
unrelated schools, shops, parks, and restaurants.

OUTPUT — JSON only, no fences or preamble
{
  "city_narrative": "one honest sentence distinguishing the city",
  "sectors": [{
    "sector_slug": "exact slug supplied above",
    "narrative_angle": "one specific sentence",
    "pois": [{
      "name": "exact Google Maps name; no address",
      "bucket": "schools|dining|nightlife|shopping|outdoor|fitness|kids|asian_community|daily_errands|faith|work_hubs|healthcare|pets|transit|civic|waterfront|other",
      "why": "what a buyer learns",
      "shot_note": "what the image should communicate",
      "source": "URL opened during research",
      "confidence": "high|medium"
    }]
  }]
}

Return every supplied sector_slug exactly once. Aim for roughly 24-36 unique
POIs city-wide, but factual distinctiveness is more important than count.
The JSON must be complete and parseable. Never use ellipses, comments,
placeholders, or abbreviated arrays.`;
}
