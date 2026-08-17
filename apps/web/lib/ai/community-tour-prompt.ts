/**
 * Generic dual-agent research prompt for the Community Tour pipeline.
 *
 * Runs identically in both Gemini grounding calls (gemini_a / gemini_b).
 * NO density class / probe: the agent researches like a person searching an
 * unfamiliar city.
 *
 * Output contract is strict JSON so the orchestrator can merge both agents'
 * results without a human.
 */

export type TourBucket =
  | 'schools'
  | 'dining'
  | 'nightlife'
  | 'shopping'
  | 'outdoor'
  | 'fitness'
  | 'kids'
  | 'asian_community'
  | 'daily_errands'
  | 'faith'
  | 'work_hubs'
  | 'healthcare'
  | 'pets'
  | 'transit'
  | 'civic'
  | 'waterfront'
  | 'other';

export interface TourPoiCandidate {
  name: string;
  bucket: TourBucket;
  why: string;
  shot_note: string;
  source: string;
  confidence: 'high' | 'medium';
}

export interface TourResearchOutput {
  narrative_angle: string;
  pois: TourPoiCandidate[];
  buckets_deliberately_skipped: Array<{ bucket: string; why: string }>;
}

export function buildResearchPrompt(ctx: {
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
}): string {
  const place = [ctx.city, ctx.state, ctx.zip].filter(Boolean).join(' ');
  const coord =
    ctx.lat != null && ctx.lng != null
      ? ` (centroid ${ctx.lat.toFixed(4)}, ${ctx.lng.toFixed(4)})`
      : '';

  return `You are researching ${ctx.name}, a residential community in ${place}${coord}.

TASK
Identify the specific places a human videographer should film to make an honest
2-3 minute neighborhood tour that a prospective home buyer would find useful.

METHOD — mandatory
- Search the web before answering. Read local blogs, the city site, the HOA or
  subdivision page, r/{metro} and similar forums, "things to do in {city}"
  guides, school district pages, local news, existing YouTube neighborhood tours.
- Ground every place in something you actually read. If you cannot point to a
  source you opened, do not list it.
- You are NOT ranking by proximity — the Places API already does that. Your
  value is editorial consensus: what do people who live here actually mention?

WHAT QUALIFIES
- Places that answer "what is daily life like here," not "what is the best
  restaurant in the metro."
- Visually distinctive: town centers, parks, trailheads, food halls, campuses,
  streetscapes, waterfronts.
- Skip anything whose photo looks identical in every US suburb — urgent care,
  dentists, chain pharmacies, self-storage, insurance offices.
- Name the one or two things that make THIS place different from the suburb
  twenty minutes away. If nothing does, say so.

WHAT TO OMIT
- Anything you cannot verify is open today. Businesses close. If your source is
  more than two years old, verify separately or drop it.
- Individual restaurants when a food hall or town center covers the same ground
  in one shot.

OUTPUT — JSON only, no fences, no preamble
{
  "narrative_angle": "one specific, honest sentence on what defines this place",
  "pois": [{
    "name": "exact name as it appears on Google Maps",
    "bucket": "schools|dining|nightlife|shopping|outdoor|fitness|kids|asian_community|daily_errands|faith|work_hubs|healthcare|pets|transit|civic|waterfront|other",
    "why": "what a buyer learns from seeing this",
    "shot_note": "what specifically to film here",
    "source": "URL you opened",
    "confidence": "high|medium"
  }],
  "buckets_deliberately_skipped": [{"bucket": "...", "why": "..."}]
}

CONSTRAINTS
- 12-20 POIs. Do not pad to reach the ceiling.
- Max 2 per bucket, unless one bucket genuinely IS the story here.
- Every name will be checked against Google Places. Names that do not resolve
  are discarded. An unverifiable name is worse than a missing one — this feeds
  a published real-estate video.
- Do NOT give an address. The name is looked up against Google Places inside a
  circle around this community, so the city is already known and a guessed
  street address only makes the query wrong. Owner 2026-08-17: addresses came
  back \"very inaccurate\" and the search returned nothing.
- Spend that effort on the NAME instead: exactly as Google Maps spells it,
  including the suffix that distinguishes branches (\"Publix Super Market at
  Windward Commons\", not \"Publix\").
- Prefer places that are known to have Google listing photos (restaurants,
  parks, malls, landmarks) over private spots, HOA clubhouses, and model
  homes — we need downloadable imagery for every POI.`;
}
