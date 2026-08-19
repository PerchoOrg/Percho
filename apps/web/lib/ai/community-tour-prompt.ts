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
  /** The agent's own distance estimate, in miles. Advisory: the real distance
   *  is measured from the resolved Places coordinate. Absent on runs that
   *  predate 2026-08-18. */
  approx_miles?: number;
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
2-3 minute tour of THIS COMMUNITY and the daily life immediately around it, for
a buyer deciding whether to live here.

The film is about the community, not about the city it sits in. Its own
amenities open it; everything you list is the ring of ordinary life around
those — the school run, the grocery, the park the residents actually walk to.
A buyer can look up the city's attractions themselves. What they cannot look up
is what a Tuesday looks like from this address.

DISTANCE — the rule that matters most
Rank and filter by how near a place is to this community, in this order:
  1. Under 1 mile   — the daily orbit. List these first and list them fully.
  2. 1 to 3 miles   — the weekly orbit: schools, grocery, parks, the usual
                      errands. Most of your list belongs here.
  3. 3 to 4 miles   — only if a resident would genuinely go there weekly and
                      nothing nearer serves the same need.
  Beyond 4 miles    — do not list it, however famous. A town square, stadium
                      or festival street four miles away belongs to the city,
                      not to this community, and putting it on screen tells a
                      buyer nothing true about living here.
State a rough distance for every place so the filter can check you.

METHOD — mandatory
- Search the web before answering. Read local blogs, the city site, the HOA or
  subdivision page, r/{metro} and similar forums, "things to do in {city}"
  guides, school district pages, local news, existing YouTube neighborhood tours.
- Ground every place in something you actually read. If you cannot point to a
  source you opened, do not list it.
- Editorial consensus is your value: what do people who live in THIS
  subdivision actually mention? A place the whole metro knows, but no resident
  here mentions, is the wrong answer.

WHAT QUALIFIES
- Places that answer "what is daily life like here," not "what is the best
  restaurant in the metro."
- The assigned schools, the everyday grocery, the nearest parks and trailheads,
  the streets and entrances around the community itself.
- Skip anything whose photo looks identical in every US suburb — urgent care,
  dentists, chain pharmacies, self-storage, insurance offices.
- Name the one or two things that make THIS place different from the suburb
  twenty minutes away. If nothing does, say so.

WHAT TO OMIT
- Regional destinations: a downtown, town square, amphitheatre, stadium or
  festival street that serves a whole city. Include one ONLY if it is under
  3 miles and residents here treat it as their own.
- Anything you cannot verify is open today. Businesses close. If your source is
  more than two years old, verify separately or drop it.
- Individual restaurants when one nearby centre covers the same ground in one
  shot.

OUTPUT — JSON only, no fences, no preamble
{
  "narrative_angle": "one specific, honest sentence on what defines this place",
  "pois": [{
    "name": "exact name as it appears on Google Maps",
    "bucket": "schools|dining|nightlife|shopping|outdoor|fitness|kids|asian_community|daily_errands|faith|work_hubs|healthcare|pets|transit|civic|waterfront|other",
    "why": "what a buyer learns from seeing this",
    "shot_note": "what specifically to film here",
    "approx_miles": 1.4,
    "source": "URL you opened",
    "confidence": "high|medium"
  }],
  "buckets_deliberately_skipped": [{"bucket": "...", "why": "..."}]
}

CONSTRAINTS
- 12-20 POIs. Do not pad to reach the ceiling. A short, genuinely local list
  beats a long one padded with regional landmarks.
- Max 2 per bucket, unless one bucket genuinely IS the story here.
- Every POI must carry approx_miles. Anything over 4 is dropped before it
  reaches the film, so listing it only wastes a slot.
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
  parks, schools, shopping centres) — we need downloadable imagery for every
  POI. Do NOT list the community's own gate, pool, clubhouse or courts: those
  carry the film, but their photos come from the community's own website
  through a separate path, and Google has nothing for them.`;
}
