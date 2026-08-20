/**
 * Research prompt for the Community Tour pipeline.
 *
 * Rewritten 2026-08-19 with the owner, against measured evidence: POI output
 * fell as this prompt grew. ~800 input tokens returned 7-12 POIs; the 1221-token
 * version that followed returned 5. Every rule the pipeline already enforces in
 * code — the distance ceiling, the religious filter, Places resolution — was
 * spending model attention for nothing, because getting those wrong costs the
 * model nothing. They are one line each now, and the space went to recall.
 *
 * Two things drive recall: the buyer's own questions ("where do people buy
 * groceries") rather than a bucket enum, which produces classification instead
 * of memory; and reading the community's own site first, because Aberdeen's
 * HOA page listed four parks inside four miles that the agent never proposed.
 *
 * Output contract is strict JSON. `source` is not proof-of-work — it is a page
 * the photo-ingest panel can later pull imagery from, so it should be the
 * place's own site wherever one exists.
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
  /** Why a buyer cares. Capped at 10 words — it was averaging 21. */
  why: string;
  /** Removed 2026-08-19: nothing read it. Optional so old runs still parse. */
  shot_note?: string;
  /** The agent's own distance estimate, in miles. Advisory: the real distance
   *  is measured from the resolved Places coordinate. Absent on runs that
   *  predate 2026-08-18. */
  approx_miles?: number;
  /** The place's own website — a photo-ingest candidate, not a citation. */
  source: string;
  confidence: 'high' | 'medium';
}

export interface TourResearchOutput {
  narrative_angle: string;
  /**
   * The community's own site, from STEP 1.
   *
   * STEP 1 has always said "Note the URL" — with nowhere in the output schema
   * to note it, so the model dutifully found the site, used it, and dropped the
   * address. Aberdeen's 31 hand-picked photos all came from
   * aberdeencommunity.org, pasted in by hand, while `communities.website` sat
   * null (owner 2026-08-20: "did we get main website url for the community?").
   * Optional so runs that predate the field still parse.
   */
  community_site?: string;
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

  return `Research ${ctx.name}, a residential community in ${place}${coord}, for a
short video tour aimed at someone deciding whether to live there.

STEP 1 — find the community's own website (HOA, subdivision, builder) and read
it, especially any "local info" or "area" page. Residents' own list of what is
nearby beats any search, and it is where the good photos live. Note the URL.

STEP 2 — answer these, by name, for someone living at this address:
  Where do they buy groceries? Eat on a weeknight? Take coffee?
  Which ELEMENTARY, which MIDDLE, and which HIGH school do the children go to?
    Name all three — schools decide more purchases here than anything else on
    this list, and a missing tier is the gap a buyer notices first.
  Where do they walk, run, or take a dog?
  Where do kids go on a Saturday? Where do adults work out?
  What errands — pharmacy, hardware, post — and where?
  What is the one local thing that is not in every suburb?
Each answer is a POI. Buckets exist to classify them afterwards, not to
prompt you: schools, dining, nightlife, shopping, outdoor, fitness, kids,
asian_community, daily_errands, work_hubs, healthcare, pets, transit, civic,
waterfront, other. Scan that list at the end and fill anything real you missed.

DISTANCE — two tiers, both measured from the community:
  Walkable (under ~0.5 mi) — the strongest material. List all of it.
  Within a 15-minute drive (~7 mi) — everything else. Nearer is always better.
Give approx_miles for every POI. Beyond 15 minutes is dropped, so do not list it.
A downtown, town square, stadium or festival street is the city's, not this
community's: include one only if it is under 3 miles and residents treat it as
their own.

RULES
- 12 to 15 POIs. Returning fewer is a failure — if you cannot reach 12, say why
  in buckets_deliberately_skipped rather than stopping quietly. Coverage of
  different kinds of place matters more than depth on any one.
- Max 2 per bucket, except schools, which may have 3 so every tier fits. With
  that cap, 12 POIs means at least six kinds of place.
- No places of worship, of any religion. (Fair-housing rule, not taste.)
- Skip what looks identical in every US suburb, or has nothing to look at:
  urgent care, dentists, chain pharmacies, self-storage, insurance offices,
  recycling and waste sites, car washes, bank branches.
- Skip the community's own gate, pool, clubhouse and courts — those come from
  the community's website through a separate path.
- Names are resolved against Google Places, so spell each one exactly as Google
  Maps does, including the branch suffix ("Publix Super Market at Windward
  Commons", not "Publix"). Give no street address — it makes the lookup worse.

OUTPUT — JSON only, no fences, no preamble
{
  "narrative_angle": "one honest, specific sentence on what defines this place",
  "community_site": "the community's own website from STEP 1 — omit if it has none",
  "pois": [{
    "name": "exact Google Maps name",
    "bucket": "one of the buckets above",
    "why": "why a buyer cares — 10 words maximum",
    "approx_miles": 1.4,
    "source": "the place's own website, for photos — omit if it has none",
    "confidence": "high|medium"
  }],
  "buckets_deliberately_skipped": [{"bucket": "...", "why": "one line"}]
}`;
}
