# Move-in Questions — the question bank behind "What people ask before they move here"

> Status: Draft for owner review, phase 124 (2026-08-29). Product design note,
> not an implementation spec. Feeds the listing explore page
> (`docs/design/spec-v3/02-listing.md`, phase119 layout) and the profile
> (`docs/design/preference-learning.md` §5).
>
> Origin: the owner asked, for a specific house, "what would I only find out
> after living there — like having to U-turn to get onto the main road?" Two
> rounds of answers (traffic-calmed collector at the corner, school zone three
> blocks south, 1967 build that had been an investor rental, I-405 widening
> through 2028, convergence-zone snow on a steep hill, …) turned out to be the
> data buyers actually want. This document generalises that into something the
> app can produce for every listing.

## 0. TL;DR

The explore page today tells the buyer things: fit, cost, facts, comps. This
adds a surface that **asks** instead — a bank of questions a person would ask
themselves before moving somewhere, ranked for this buyer, each one opening
into an answer about **this** home and street.

Three claims:

1. **The question is the primitive, not the insight.** Different buyers need
   different pages: one wants to know what the street feels like on a Sunday
   morning, another wants to know where property taxes are heading. No fixed
   set of sections covers both. A ranked question list does.
2. **Which questions a buyer opens is the most honest profile signal we will
   ever get** — stronger than a like. It feeds ranking silently, per canon
   §9.7; the buyer is never told.
3. **Every answer carries a "Based on" line, or it does not exist.** This is
   the explore page's "real or absent" rule applied to prose: an answer that
   cannot name its basis is dropped at generation time, never shown.

The 30-Second Rule (preference-learning §8): opening a question satisfies
goal 1 (learn about the buyer) by construction; the answer satisfies goal 2
(teach) or goal 3 (confidence) — each entry below records which.

## 1. Principles

### 1.1 Ask, don't tell

The page header is `WHAT PEOPLE ASK BEFORE THEY MOVE HERE`. The rows are
questions in the buyer's own voice ("Would my kid have friends within bike
range?"), not labels ("Family-friendliness"). A label is a filter; a question
is a thought the buyer recognises as their own. Recognition is the whole
mechanism — the buyer taps the question they were already half-asking.

### 1.2 Answer or absent

An answer is a short paragraph plus a basis line plus (optionally) a verify
action. The basis line names the facts the answer rests on and links their
sources. Generation must emit the basis as structured data, not prose; if the
basis array is empty the row is dropped. There is no "we couldn't find out"
state on screen — a question we cannot answer for this home is simply not in
the list.

### 1.3 Facts about the place, never characterisations of the people

The Fair Housing Act (and WA's Law Against Discrimination) forbid steering by
race, colour, religion, national origin, sex, familial status, disability
(federal) plus sexual orientation, gender identity, marital status, veteran
status and more (WA). Several themes below — Culture, People, Kids — sit right
next to that line. The rule that keeps us on the right side of it:

- **Allowed**: the existence, distance and character of *places and
  institutions* — an H Mart, a mosque, a Chinese school, a senior centre, a
  playground, a Pride event, a farmers market. Behavioural indicators of a
  street: owner tenure, rental share, Halloween turnout, what Nextdoor argues
  about.
- **Forbidden**: any description of who the neighbours *are* by a protected
  class, or any answer whose content is "people like you live / don't live
  here". No demographic percentages, ever, even when the source is public
  Census data. No "family neighbourhood" as a characterisation of residents;
  "playground 200 m away, elementary school three blocks" says what the
  buyer needs.

Every question below carries a `fh` flag: `n/a`, `care` (answer only through
places/institutions/behaviour), or `never` (question is reserved; we do not
ask it). The generation prompt carries the same rule verbatim.

### 1.4 Form follows question

Answers are not all paragraphs. A question about a 5k loop is a map; a
question about the freeway is a measured distance plus a verify action; a
question about Sunday morning is a short narrative with a hedge ("we'd
expect …"); a question about what Nextdoor argues about is best answered by
quoting it. The `form` field on each entry fixes this so the UI can render a
row without inspecting prose.

### 1.5 Scope decides cost

Many answers are true of the street or the neighbourhood, not the house. The
entry's `scope` (`home` / `street` / `hood` / `city`) tells the generator what
to cache by: neighbourhood-scoped answers are computed once per neighbourhood
and shared by every listing in it; only `home` and `street` answers are per
listing. This is what makes an LLM-with-search pipeline affordable at
hundreds of listings.

## 2. Entry schema

Each question in §3 is a row with these fields. This is the shape the
question bank file will carry (`lib/insights/questions.ts` or a JSON the
worker reads — implementation decides).

| Field | Meaning |
|---|---|
| `id` | `theme.slug`, stable forever (events reference it). |
| `q` | The question, buyer's voice, second person, ≤ 12 words where possible. |
| `who` | Audience tags the question is most alive for. Ranking uses them; they are not gates. Vocabulary: `all`, `family`, `single`, `couple`, `downsizer`, `immigrant`, `investor`, `remote`, `commuter`, `pet`, `multigen`, `first_time`, `accessibility`, `athlete`, `gardener`. |
| `scope` | `home` / `street` / `hood` / `city` — cache and generation granularity (§1.5). |
| `basis` | Which fact types are allowed to support the answer. The generator may only cite these. Vocabulary in §2.1. |
| `form` | `text` / `number` / `map` / `quote` / `narrative` / `timeline` / `checklist` / `yes_no`. |
| `verify` | Optional "go see for yourself" action template. `—` when a visit cannot settle it. |
| `dim` | Existing `DimKey` this question's *opening* feeds (`packages/shared/src/dims.ts`), or a proposed new dim marked `+`. |
| `goal` | Which 30-Second-Rule goal the *answer* serves: `teach` (2) or `confidence` (3). Opening always serves goal 1. |
| `fh` | Fair Housing handling: `n/a`, `care`, `never` (§1.3). |

### 2.1 Basis vocabulary

What an answer may rest on. The generator must tag every basis item with one
of these and a source URL (or a measurement it made itself, e.g. a distance).

| Basis | What it is | Free? |
|---|---|---|
| `road` | Road classification and geometry around the parcel (OSM: residential / tertiary / secondary / motorway; node degree for corners; cul-de-sac). | yes |
| `dist` | A measured distance or drive/walk time from the parcel to a named place. | yes / Google Directions for drive time |
| `place` | A named business or institution and its type (Google Places / OSM). | Places is paid, cached |
| `school` | A school, its distance, its grade span, its rating from a named rater. `k12_schools` when populated. | mixed |
| `transit` | A stop, line, frequency, opening date. | yes |
| `project` | A public-works, school-construction or transit project page from a city / county / DOT / district. | yes |
| `zoning` | Municipal code on lot use: ADU, middle housing, tree removal, short-term rental. | yes |
| `assessor` | Parcel record: year built, lot, permits, assessed value, tax history, sale history. | mostly |
| `mls` | The listing's own history: list date, price changes, prior rental listing, days on market. | in mirror |
| `listing_text` | The agent's own description — quoted as the agent's claim, per `listing-highlights.ts`. | yes |
| `photo` | Vision tags on the listing's photos (`listing_photos.ai_tags`): room type, orientation clues, condition signals. | yes |
| `hazard` | FEMA flood zone, USGS fault / landslide, wildfire risk, local hazard map. | yes |
| `climate` | NOAA normals, local microclimate write-ups (e.g. convergence zone), snow-route maps. | yes |
| `utility` | Provider, fibre availability, sewer vs septic, overhead vs buried lines. | yes |
| `crime` | Police department published stats or bulletins by type. Never a heatmap by block. | yes |
| `civic` | City council / planning minutes, comprehensive plan, school district plans and levies. | yes |
| `tenure` | Owner tenure and rental share from assessor / ACS at tract level — **used only as a behavioural indicator, never as a people descriptor**. | yes |
| `social` | Nextdoor / Reddit / local news: *topics and quotes*, attributed. Never paraphrased as a fact about residents. | yes |
| `market` | Zip / neighbourhood median price, $/sqft, DOM trend from a named source. | yes |

## 3. The question bank

Eighty-odd questions in fifteen themes. Order within a theme is roughly "most
likely to change a decision" first. The Bothell example (10404 NE 198th St)
is used for illustration where an answer shape is not obvious.

### 3.1 Vibe — what the street is like

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `vibe.sunday` | What does this street feel like at 9am on a Sunday? | all | street | road, place, school, tenure, social | narrative | Sunday 9–10am, walk the block | quiet | confidence | care |
| `vibe.porch` | Do people sit out front here, or drive into the garage and close the door? | all | street | photo, road, tenure | text | Weekday 6pm, drive the block slowly | quiet | confidence | care |
| `vibe.halloween` | How many houses on this block do Halloween? | family, all | street | social | quote | — | family | teach | care |
| `vibe.wave` | Is this a wave-at-your-neighbour street or a never-learn-their-names street? | all | street | tenure, road, social | narrative | — | quiet | confidence | care |
| `vibe.nextdoor` | What does this neighbourhood's Nextdoor actually argue about? | all | hood | social | quote | — | quiet | teach | care |
| `vibe.evening` | Is anything happening here after 9pm, or is it dark and done? | single, couple | hood | place, road | text | Friday 9:30pm, drive through | nightlife | teach | n/a |
| `vibe.saturday_noise` | What does Saturday morning sound like — leaf blowers, kids, nothing? | all | street | road, photo, social | text | Saturday 9am, stand in the yard | quiet | confidence | n/a |

Illustration, `vibe.sunday`, Bothell: *"We'd expect quiet-with-kids: a 1960s
block where owners stay a long time, an elementary school three blocks south,
a park within a walk. The local Nextdoor is 'lost cat' and 'who has a
ladder', not parking disputes."* Basis: tenure (assessor), school (dist),
place (park), social (Nextdoor topic mix, linked).

### 3.2 People — who I'd be neighbours with (behaviour only)

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `people.tenure` | How long do people stay here — a 20-year street or a 3-year street? | all | street | tenure, assessor | number | — | quiet | teach | care |
| `people.rentals` | How much of this block is rentals? Any short-term rentals? | all | street | assessor, zoning, social | number | — | quiet | teach | care |
| `people.turnover` | Who's moving in right now — what's the trend on this street? | all | hood | assessor, market | text | — | — | teach | care |
| `people.this_house` | Was this house lived in by its owner, or rented out? | all | home | mls, assessor | text | Ask the agent: tenant in place? Lease end? | move_in | confidence | n/a |
| `people.single` | Would I feel out of place here on my own? | single | hood | place, transit | text | — | nightlife | confidence | care |
| `people.downsize` | If I'm downsizing, is there a life here without a car? | downsizer | hood | place, dist, transit | text | — | walkable | confidence | care |
| `people.demographics` | *Who lives here, by age / origin / religion / family?* | — | — | — | — | — | — | — | **never** |

`people.demographics` is listed so nobody adds it later thinking it was
overlooked. The three questions above it answer what a buyer legitimately
wants from it — stability, ownership, fit for a life stage — through places
and behaviour.

### 3.3 Culture — can the way I live run here

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `culture.grocery` | Where's the nearest grocery that carries what I actually cook with? | immigrant, all | hood | place, dist | map | — | +culture | teach | care |
| `culture.worship` | Is there a place of worship of my tradition within 20 minutes? | all | city | place, dist | map | — | +culture | teach | care |
| `culture.language` | Where do people who speak my language gather — school, centre, festival? | immigrant | city | place, civic | text | — | +culture | teach | care |
| `culture.table` | Could I find a dim sum Sunday / a taqueria / a proper pho place / a bakery I'd drive for? | all | hood | place | map | — | hip | teach | n/a |
| `culture.games` | Mahjong, cricket, pickup soccer, pickleball — where would I find my game? | all | city | place, civic | text | — | +culture | teach | care |
| `culture.market` | Is there a farmers market, and is it a real one or three stalls? | all | hood | place, civic | text | Go on market day | hip | teach | n/a |
| `culture.festival` | What does this town do once a year that everyone goes to? | all | city | civic, social | text | — | hip | teach | n/a |

The buyer's cuisine, language and tradition are not in the profile and we do
not ask. `culture.grocery` and `culture.worship` answer with the *set* of what
exists (H Mart 9 mi · 99 Ranch 10 mi · Indian grocer 4 mi · halal butcher
3 mi; mosque / temple / gurdwara / Chinese church within 20 min) and let the
buyer find themselves in it. A later "Ask your own" can narrow.

### 3.4 Third places — where I'd go without planning to

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `third.coffee` | Which coffee shop would become *my* coffee shop? | all | hood | place, dist | map | Go at 8am Saturday, see who's there | walkable | teach | n/a |
| `third.friday` | Is there a bar or restaurant I'd walk to on a Friday, or is every evening a drive? | single, couple | street | place, dist, road | text | — | nightlife | confidence | n/a |
| `third.bump` | Where would I run into neighbours without planning it? | all | hood | place, civic | text | — | walkable | teach | care |
| `third.gym` | Is there a gym / pool / climbing wall / yoga studio I'd actually use? | athlete, all | hood | place, dist | map | — | — | teach | n/a |
| `third.library` | Is the library one people use, or a building? | family, downsizer | hood | place, civic | text | Go on a weekday afternoon | family | teach | n/a |
| `third.dogpark` | Where would I take the dog to meet other dogs? | pet | hood | place, dist | map | — | +pets | teach | n/a |

### 3.5 Kids — more than a school rating

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `kids.friends` | Would my kid have friends within bike range? | family | street | school, place, road, social | text | Weekday 4pm, count bikes | family | confidence | care |
| `kids.walk` | Can my kid walk to school without crossing a busy road? | family | street | road, school, dist | map | Walk it at 8:15am | schools | confidence | n/a |
| `kids.bus` | Where's the bus stop, and can I see it from the house? | family | street | school, dist | map | — | schools | confidence | n/a |
| `kids.zone` | Will I drive through a school zone every day? | all | street | school, road | yes_no | Drive it at 3:15pm | quiet | teach | n/a |
| `kids.daycare` | What's daycare like around here — waitlists, cost? | family | hood | place, social | text | — | family | teach | n/a |
| `kids.after` | Swim team, soccer club, language school, piano — how far is each? | family | city | place, dist | map | — | family | teach | care |
| `kids.teens` | Where do teenagers go here? Is there anywhere for them? | family | hood | place, civic | text | — | family | teach | n/a |
| `kids.school_change` | Is a school boundary or closure about to move? | family | city | civic, project | timeline | — | schools | teach | n/a |
| `kids.school_real` | The school rating says 5/10 — what does it actually mean here? | family | city | school, social | text | — | schools | teach | care |
| `kids.pediatric` | Pediatrician, urgent care, children's hospital — how far? | family | city | place, dist | map | — | family | teach | n/a |

`kids.friends` is the hardest `care` case: answered by playground / school /
park distance, sidewalk presence, and quoted social posts ("looking for
carpool to Maywood Hills") — never by "lots of families live here".

### 3.6 Pets

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `pets.walk` | Is there a 30-minute dog walk from the door that isn't along a busy road? | pet | street | road, place, dist | map | Walk it | +pets | confidence | n/a |
| `pets.offleash` | Off-leash park nearby? What's the leash culture here? | pet | hood | place, civic, social | text | — | +pets | teach | n/a |
| `pets.wildlife` | Coyotes? Bears? Anything that changes how I let the cat out? | pet, all | city | civic, social | text | — | +pets | teach | n/a |
| `pets.vet` | Vet and emergency vet — how far? | pet | city | place, dist | map | — | +pets | teach | n/a |
| `pets.rules` | Any HOA or city rule on pets, chickens, fences? | pet | home | zoning, listing_text | text | — | +pets | teach | n/a |

### 3.7 Body — how I'd move here

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `body.loop` | Is there a safe 5k loop from the front door? | athlete, all | street | road, place | map | Run it | trails | confidence | n/a |
| `body.bike` | Can I bike to anything useful, or is every road a 40 mph arterial? | athlete, commuter | hood | road, transit | map | — | walkable | teach | n/a |
| `body.air` | What's the air like here in wildfire season? Pollen season? | all | city | climate, civic | text | — | — | teach | n/a |
| `body.light` | Which rooms get morning light? Where does the afternoon sun land? | all | home | photo, assessor | text | Visit at 8am and 4pm | — | confidence | n/a |
| `body.stairs` | How many stairs between the car and the kitchen? Between the bedroom and a bathroom? | downsizer, accessibility, multigen | home | photo, listing_text | number | Count them | +multigen | confidence | n/a |

### 3.8 Nature & seasons

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `nature.trailhead` | What's the trailhead I'd go to on a normal Saturday, not a special one? | all | hood | place, dist | map | — | trails | teach | n/a |
| `nature.november` | What does November look like here? | all | city | climate | narrative | — | — | teach | n/a |
| `nature.snow` | Does this neighbourhood get snow days the city doesn't? | all | hood | climate, road | text | — | quiet | teach | n/a |
| `nature.garden` | Is the yard sunny enough to grow tomatoes? | gardener | home | photo, assessor | text | Visit at noon, look for shade | outdoors | confidence | n/a |
| `nature.trees` | Big trees — mine to keep or remove? Overhead lines? | all | home | zoning, photo, utility | text | — | outdoors | teach | n/a |
| `nature.water` | Where's the water — lake, river, shore — and can I actually get to it? | all | city | place, dist | map | — | outdoors | teach | n/a |
| `nature.view` | Is there a view, and who could build in front of it? | all | home | photo, zoning | text | — | — | teach | n/a |

### 3.9 Work

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `work.commute` | What's the 8am drive to where I work — and the 5:30pm drive back? | commuter | home | dist, road, transit | number | Drive it once at 5:30pm | +commute | confidence | n/a |
| `work.toll` | Will I be paying tolls to get anywhere on time? | commuter | city | road, transit | number | — | +commute | teach | n/a |
| `work.transit` | Could I get to work without the car, on a bad day? | commuter | street | transit, dist | text | — | walkable | confidence | n/a |
| `work.fallback` | If I lose this job, what's within 30 minutes? | commuter, all | city | civic, place | text | — | +commute | teach | n/a |
| `work.office` | Is there a room here that's a real home office — door, quiet side, fibre? | remote | home | photo, utility, road | text | Stand in it with the window open | space | confidence | n/a |
| `work.airport` | How far is an airport I'd actually fly from? | remote, all | city | dist, place | number | — | +commute | teach | n/a |
| `work.cowork` | Coworking or a café that tolerates laptops, within 10 minutes? | remote | hood | place, dist | map | — | walkable | teach | n/a |

`work.commute` needs one thing the profile does not have: where work is.
The You tab asks once ("Where's work?"), optional; until answered the
question ranks low and reads as the generic "drive to downtown / the big
employers" answer.

### 3.10 Money over time

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `money.catch` | Why is this house priced where it is — what's the catch? | all | home | market, mls, assessor, road | text | — | — | confidence | n/a |
| `money.tax` | Where are property taxes headed here? | all | city | assessor, civic | timeline | — | — | teach | n/a |
| `money.rent_out` | Could I rent out part of this house? Is an ADU allowed? | investor, multigen | home | zoning, photo | text | — | +value | teach | n/a |
| `money.resale` | Will this be easier or harder to sell than the average house here? | all | home | road, school, market | text | — | +value | confidence | n/a |
| `money.trend` | Is this neighbourhood peaking, rising, or drifting? | all | hood | market, civic, project | text | — | +value | teach | n/a |
| `money.insurance` | What will an insurer ask about this house? | first_time | home | assessor, hazard | checklist | — | move_in | teach | n/a |
| `money.utilities` | What does it cost to heat and cool this place? Electric, gas, oil? | all | home | utility, listing_text, assessor | text | Ask for 12 months of bills | — | teach | n/a |
| `money.hoa` | Does the HOA fee go up, and what does it actually cover? | all | home | listing_text, civic | text | Ask for the last 3 years of dues | — | teach | n/a |

### 3.11 Safety, honestly

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `safety.kind` | What kind of crime actually happens here — car prowls, or something worse? | all | city | crime | text | — | — | teach | care |
| `safety.dark` | Is it dark on this street at night? Sidewalks? | all | street | road, photo | text | Drive by at 10pm | quiet | confidence | n/a |
| `safety.speed` | How fast do cars go past the front door? | family, all | street | road, project | number | Stand out front at 5:30pm | quiet | confidence | n/a |
| `safety.response` | How far is the fire station? The ER? | all | city | place, dist | number | — | — | teach | n/a |
| `safety.ground` | Earthquake, flood, landslide, wildfire — what's the story for this lot? | all | home | hazard | checklist | — | — | teach | n/a |
| `safety.retrofit` | Has this house been bolted down? Does it need to be? | all | home | assessor, hazard | text | Ask the inspector | move_in | teach | n/a |

`safety.kind` is `care` because crime information is lawful but can be
presented in a steering way. The rule: department-published stats by type,
city or precinct level, never a block heatmap and never adjacent to any
people descriptor.

### 3.12 Daily logistics — the U-turn class

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `logistics.turn` | Can I turn left out of my street at 8am? | all | street | road, project | text | Stand at the corner, weekday 8:00am | quiet | confidence | n/a |
| `logistics.cutthrough` | Is my street a shortcut for other people? | all | street | road, project, civic | yes_no | — | quiet | teach | n/a |
| `logistics.guests` | Where do guests park? | all | street | road, photo, zoning | text | — | — | teach | n/a |
| `logistics.plow` | Do I get plowed? Can I get down the hill in snow? | all | street | climate, road, civic | text | — | — | teach | n/a |
| `logistics.trash` | Trash day, and where does the bin go? | all | home | utility | text | — | — | teach | n/a |
| `logistics.delivery` | Can a delivery driver find the door? Same-day Amazon here? | all | home | dist, photo | text | — | — | teach | n/a |
| `logistics.errands` | Gas, pharmacy, hardware, post office — on the way home or a separate trip? | all | hood | place, dist | map | — | walkable | teach | n/a |
| `logistics.24h` | Where's the nearest 24-hour anything? | all | city | place, dist | number | — | — | teach | n/a |
| `logistics.costco` | How do I get to Costco, and how bad is it on a Saturday? | all | city | place, dist, road | number | — | — | teach | n/a |

### 3.13 The house, lived in

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `house.noise_in` | Where does the noise get in — which room hears the road, the freeway, the planes? | all | home | road, dist, photo | text | Sit in each bedroom at 10pm with the window open | quiet | confidence | n/a |
| `house.water` | Where does the water go in a hard rain? | all | home | photo, assessor, hazard | text | Visit during rain; look at the basement corners | move_in | confidence | n/a |
| `house.era` | It was built in {year} — what does that mean I should inspect? | first_time, all | home | assessor | checklist | Give this list to the inspector | move_in | teach | n/a |
| `house.addition` | {sqft} sqft on a {year} house — was something added, and was it permitted? | all | home | assessor, mls | text | Ask for permit history | move_in | confidence | n/a |
| `house.ev` | Can I charge an EV here? Put up solar? | all | home | photo, utility, assessor | text | — | — | teach | n/a |
| `house.heat` | Will I survive a July heat wave in this house? | all | home | listing_text, photo, climate | text | — | — | teach | n/a |
| `house.parents` | Could my parents live downstairs with their own door? | multigen | home | photo, listing_text, zoning | text | — | +multigen | confidence | n/a |
| `house.signal` | Cell signal inside, by carrier? | remote, all | home | utility | text | Check your phone in the basement | — | teach | n/a |
| `house.groceries` | How far from the car to the kitchen with groceries? | downsizer, all | home | photo | number | — | — | teach | n/a |
| `house.storage` | Where does the stuff go — bikes, skis, the second fridge? | family | home | photo, listing_text | text | — | space | teach | n/a |
| `house.fibre` | Fibre to this address, or cable? | remote, all | home | utility | yes_no | — | — | teach | n/a |

`house.era` is a rule, not research: decade → checklist (1960s: panel brand,
galvanised supply, original side sewer, oil tank, asbestos ceilings; 1970s:
aluminium wiring, poly-B later; 1980s: LP siding, poly-B; 2000s: Chinese
drywall in some regions; …). It is the one question that never needs a
search and should ship in the first cut.

### 3.14 Sound & smell map

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `sound.planes` | Am I under a flight path? | all | home | dist, civic, social | text | Sit outside on a clear evening | quiet | confidence | n/a |
| `sound.freeway` | Will I hear the freeway at night? | all | home | dist, road | text | 10pm, windows open | quiet | confidence | n/a |
| `sound.events` | Friday night football, church bells, a school bell, a train horn — what's on the schedule? | all | hood | place, dist, social | text | — | quiet | teach | n/a |
| `sound.sirens` | Am I on the route to the hospital or the fire station? | all | street | road, place | yes_no | — | quiet | teach | n/a |
| `sound.smell` | Anything I'd smell — treatment plant, dairy, brewery, mill? | all | hood | place, social | text | — | — | teach | n/a |

### 3.15 Identity & future

| id | q | who | scope | basis | form | verify | dim | goal | fh |
|---|---|---|---|---|---|---|---|---|---|
| `identity.signal` | What does living here say — practical, quiet money, up-and-coming, retiree calm? | all | hood | market, civic, social | narrative | — | hip | confidence | care |
| `identity.first` | Would I be the first of my kind here, or one of many? | — | — | — | — | — | — | — | **never** |
| `future.construction` | What's under construction within a mile, and until when? | all | hood | project | timeline | — | — | teach | n/a |
| `future.transit` | Is transit coming? When? | all | hood | transit, project | timeline | — | walkable | teach | n/a |
| `future.nextdoor` | What's the zoning going to allow next door? | all | home | zoning, civic | text | — | — | teach | n/a |
| `future.plan` | What does the city say this neighbourhood becomes by 2044? | all | hood | civic | text | — | — | teach | n/a |

`identity.signal` is `care` and must be answered from price band, housing
stock, civic and market language ("1960s ranches, long tenure, a downtown
that's densifying fast") — never from who lives there. `identity.first` is
the question buyers most want answered and the one we cannot; it is listed as
reserved so that the honest answer — "we don't answer that" — is a decision,
not an omission.

## 4. Ranking

The list shows 4–5 questions first, then the theme browser, then "Ask your
own".

- **Cold start** (no profile): a fixed generic five, chosen to span themes and
  to be answerable for nearly every listing — `money.catch`, `logistics.turn`,
  `house.era`, `vibe.sunday`, `kids.zone`. These five also seed the profile
  fastest: opening any one of them is informative.
- **With a profile**: score = (this buyer's theme affinity from prior opens)
  × (the answer's decisiveness for *this* home, a generator-emitted 1–3) ×
  (audience tag match to whatever the profile already knows — commute
  present, saves dominated by 4-bed homes, …). Ties broken toward questions
  the buyer has *not* opened on a previous listing, so the page keeps
  teaching.
- **A question the buyer opened on three listings becomes a standing
  question**: it pins to the top of every subsequent explore page for them,
  with its answer, until they collapse it. This is the "you learned what I
  care about" moment (goal 4) without ever saying so.
- **Never rank by `who` alone.** Audience tags widen the pool; they do not
  gate. A `single` buyer who opens `kids.walk` gets more kids questions, and
  we do not second-guess why.

## 5. Events

Into `listing_explore_events`, same queue as the phase119 events:

| event | payload | signal |
|---|---|---|
| `question_open` | `question_id`, `rank_shown`, `dwell_ms` | theme affinity; the core signal |
| `question_verify_tap` | `question_id` | strongest intent signal we have — the buyer plans to go |
| `question_source_tap` | `question_id`, `basis_index` | which basis types buyers actually check; calibrates trust |
| `question_theme_browse` | `theme` | affinity, weaker than open |
| `question_pin` / `question_unpin` | `question_id` | standing questions (§4) |
| `question_ask_own` | free text length only, never the text at this layer | demand for the P1 Ask entry |

Silent learning holds: none of these change anything the buyer is told about
themselves. Their only echo is ordering.

## 6. Generation (sketch — implementation spec is a later phase)

- **Where**: an offline job per listing (and per neighbourhood for `hood` /
  `city` scoped questions), on the worker box behind the job-table boundary
  like tours. Never in the request path.
- **How**: a model with web search (the existing Gemini caller in
  `lib/ai/gemini.ts` with grounding; the Anthropic runtime path is broken on
  this host per CLAUDE.md §2.1 and is not the plan). Prompt = the Fair Housing
  rule verbatim + the entry's `basis` allow-list + the listing's known facts
  (address, year, sqft, price, description, photo tags, MLS history). Output
  is JSON per question: `{ id, answer, basis: [{ type, source_url|measured,
  note }], verify?, decisiveness: 1|2|3, form }`. Empty `basis` ⇒ dropped.
- **Cache**: `hood` / `city` answers keyed by neighbourhood, refreshed
  monthly; `home` / `street` answers keyed by listing, regenerated on price or
  status change.
- **Review**: first batch (≈20 listings) read by the owner to calibrate the
  prompt; thereafter Tier-1 answers publish without review, with an admin
  page to pull any answer. `house.era` and other pure-rule answers never need
  review.
- **Cost order of magnitude**: tens of searches per listing for the `home` /
  `street` set, one long structured output — well under $1 per listing;
  neighbourhood sets amortise across every listing in them.

## 7. What this is not

- Not a chatbot. The bank is fixed; "Ask your own" is the P1 Ask entry and
  a separate surface.
- Not a neighbourhood guide. No question here is answered at the level of
  "Bothell is a family-friendly suburb"; every answer is about *this* home
  or *this* street, or is cached at neighbourhood level but phrased for the
  home.
- Not a replacement for the tour request. The verify actions and the
  `people.this_house` / `house.addition` / `money.hoa` "ask the agent" lines
  should travel with a tour request in a later phase, so the agent receives a
  buyer with questions rather than "I'm interested" — but that is its own
  design.
- Not a place for demographics. See §1.3 and the two `never` rows.

## 8. Open questions for the owner

1. Are there questions missing from a buyer you know well? The bank is
   deliberately wide; it should be widened by real buyers, not narrowed by
   us.
2. Which of the proposed new dims (`+culture`, `+commute`, `+value`,
   `+pets`, `+multigen`) are worth adding to `DimKey`, and which should map
   onto existing dims for now? Adding a dim touches the profile, the trade-off
   cards and the feed reasons; it is not free.
3. The cold-start five — agree with the choice, or swap one?
4. "Where's work?" in the You tab: acceptable as the first explicit question
   we ask a buyer, or does it break the no-questionnaire stance?
5. The standing-question pin (§4): desirable, or too much machinery for v1?
