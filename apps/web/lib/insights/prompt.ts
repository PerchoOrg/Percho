/**
 * The move-in insight prompt — one home in, eight cards out.
 *
 * This is the whole editorial policy of the section in one place: what to
 * research, whose shoes to stand in, what a card is, and the Fair Housing
 * line. The owner reviewed the shape on a demo (2026-08-29, 2895 Shurburne
 * Dr): cards, not questions; a headline a buyer reads in two seconds; the
 * detail on the card itself; sources behind a tap.
 *
 * Pure: builds a string. The runner (`codex.ts`) and the parser (`parse.ts`)
 * never see each other's concerns.
 */

import { CARDS_PER_HOME, INSIGHT_THEMES } from '@percho/shared/insights';

/** What the job knows about the home. Every field optional but the address. */
export interface ListingFacts {
  address: string;
  city: string;
  state: string;
  zip?: string;
  neighborhood?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  lotSize?: string;
  hoa?: string;
  description?: string[];
  daysOnMarket?: number;
  /** Vision-tagger captions, one per photo the tagger found usable. */
  photoCaptions?: string[];
}

function factLines(f: ListingFacts): string {
  const specs = [
    f.yearBuilt ? `Built ${f.yearBuilt}` : null,
    f.beds !== undefined && f.baths !== undefined ? `${f.beds} bed / ${f.baths} bath` : null,
    f.sqft ? `${f.sqft.toLocaleString('en-US')} sqft` : null,
    f.lotSize ? `${f.lotSize} lot` : null,
    f.price ? `asking $${f.price.toLocaleString('en-US')}` : null,
    f.daysOnMarket !== undefined ? `${f.daysOnMarket} days on market` : null,
    f.hoa ? `HOA ${f.hoa}` : null,
  ].filter((s): s is string => s !== null);
  const lines = [
    `Address: ${f.address}, ${f.city}, ${f.state}${f.zip ? ` ${f.zip}` : ''}`,
    ...(f.neighborhood ? [`Neighborhood (as listed): ${f.neighborhood}`] : []),
    ...(specs.length ? [specs.join(' · ')] : []),
    ...(f.description?.length ? [`Listing says: ${f.description.join(' ')}`] : []),
    ...(f.photoCaptions?.length ? [`Photos show: ${f.photoCaptions.join('; ')}`] : []),
  ];
  return lines.join('\n');
}

export function buildInsightsPrompt(facts: ListingFacts): string {
  return `You are researching one specific home for a buyer who is deciding whether to visit it. Your job is the one a good friend who has lived on this exact street would do: tell them what they would only find out after moving in.

THE HOME
${factLines(facts)}

RESEARCH FIRST (use web search; prefer primary sources — city, county, school district, DOT, transit agency, municipal code, assessor, local news — over listing portals):
1. The street: road class of this street and the nearest through-road; corner or mid-block; cul-de-sac; sidewalks; posted speed; any traffic-calming or road project the city lists for it.
2. Within a short walk: schools (distance, and whether the walk crosses an arterial), parks, trails, playgrounds, the nearest coffee, grocery, gas, pharmacy.
3. What you'd hear or smell: distance and direction to the nearest freeway, rail line, airport approach, stadium, fire station, industrial site, treatment plant.
4. The house's record: permits or additions on record, prior rental or sale listings, price changes and days on market, HOA and what it covers, flood zone and any hazard mapping for the parcel, which city actually governs the parcel (mailing city can differ).
5. What's changing: construction, transit, zoning or school-boundary changes within a mile that a public body has published, with dates.
6. The money: property tax history for the parcel, the neighbourhood's median price and $/sqft trend, how this listing compares.
7. The town: nearest full-line grocery, nearest international or specialty groceries and what kind, places of worship by tradition within 20 minutes, recurring community events the city or local press lists, the library, the rec centre, the farmers market if any.

THEN THINK from each of these positions in turn and ask "what would I only discover after living here?": a parent of young kids · a teenager's parent · a single person · a couple without kids · someone downsizing · someone who works from home · a daily commuter · a dog owner · a gardener · someone who cooks a specific cuisine · someone who needs a place of worship · a first-time buyer · an investor · someone with limited mobility. Keep the discoveries that most of them would agree matter, and that your research actually supports.

WRITE ${CARDS_PER_HOME} INSIGHT CARDS. A buyer scans each card in two seconds, so every field is short and concrete:
- "headline": the takeaway in at most 8 words. Concrete, no hedging. ("Morning exits get worse until summer 2027" · "Listing says 4 bedrooms, records say 3" · "Your Alpharetta address is governed by Roswell")
- "detail": ONE sentence, at most 25 words, carrying the specific name, number or date that makes the headline true.
- "kind": "watch" (a warning or trade-off), "plus" (a genuine upside), or "know" (a neutral fact that changes how you'd live here).
- "verify": optional — a go-and-see action of at most 10 words with a time of day, only when a visit can settle it. Never "consult a professional".
- "basis": the facts you used, each {"note": the fact in a few words, "url": the page you opened}. At least one. A card you cannot base on a page you opened does not exist — omit it rather than guess.
- "theme": one of ${INSIGHT_THEMES.join(' · ')}.
- "decisiveness": 1–3 — how much this could change the decision to buy THIS home (3 = could make or kill the deal). At most three cards may be 3.

RULES
- Surprising beats obvious. "There's a park nearby" is not a card; "Ball-field lights and Friday games until 10pm" is.
- At least three cards must be "watch". A list with no catch is not honest. At least one should be "plus".
- Spread across at least five themes. Never two cards on the same fact.
- Fair Housing: describe places, distances, records, published plans and the behaviour of the street. Never describe the residents by race, religion, national origin, family status, disability, age or any other protected class — not even as a public statistic.
- No praise words (charming, vibrant, sought-after). No marketing tone.

OUTPUT: exactly one JSON object, {"cards":[...]}, and no text outside it.
`;
}
