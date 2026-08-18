# Living-area coverage model

Status: product definition for community discovery, content acquisition, and
tour selection.

## Purpose

Percho needs a useful area tour for every home without first solving the much
harder problem of defining every neighborhood in the United States.

The initial coverage model has three levels, in priority order:

1. **Builder community** — the most specific and differentiated coverage.
2. **City sector** — the default coverage for homes outside a qualified builder
   community when a city is too large for one useful tour.
3. **City** — the fallback for smaller cities or sectors that are not ready.

```text
home
├── qualified builder community with a publishable tour
│   └── builder-community tour
├── city has publishable sectors
│   └── city-sector tour
└── city tour
```

A future logical-neighborhood layer may be inserted between builder community
and city sector. It is deliberately out of scope for the initial rollout.

## Product principles

### Coverage is not the same as geographic truth

The purpose of an area is to assign a relevant, honest, visually useful tour
to a home. Percho does not need to resolve every disputed neighborhood name or
create a perfect cultural map before it can provide coverage.

Every published area must nevertheless have:

- a stable name;
- a deterministic home-to-area assignment;
- a defensible boundary or membership source;
- enough distinct content to support its tour;
- narration whose geographic claims match the coverage level.

### Specific coverage wins only when it is good

A builder-community record alone does not outrank a city-sector tour. The
builder community must be verified and its tour must pass the publishing
threshold. Otherwise the home falls back to its sector or city.

### More duration comes from more information

A longer tour should contain more distinct places and story beats, not several
near-identical photos of the same place. One strong photo per external POI is
the default. A second photo is justified only when it communicates a genuinely
different fact.

Generic interiors do not earn screen time by themselves. A supermarket,
library, classroom, or coffee-shop interior is useful only when narration can
make a specific, verified point about it.

### Internal content comes before external context

For a builder community, the community itself is the product. Amenities,
streetscape, housing character, and internal open space must be exhausted
before the tour reaches outside the boundary.

### Relevance must not be overstated

Area-level narration must not imply an unverified distance, school assignment,
membership right, or availability to a specific home. Prefer language such as
"across North Atlanta" or "the sector includes" unless a listing-specific
calculation supports a stronger claim.

## Coverage level 1: builder community

### Definition

A builder community is a named residential development or subdivision with a
coherent residential identity and a verifiable membership or boundary. It may
have been created by one builder, several builders under a master developer,
or an HOA after buildout. The product definition is based on the development,
not on whether the original builder still sells homes there.

The following do not automatically qualify:

- every Nextdoor neighborhood;
- an informal neighborhood name;
- a single apartment or condominium building;
- a collection of nearby homes with no shared development identity;
- an HOA record with no evidence that the listing belongs to it.

Condominium and townhome developments can be supported later as an explicit
residential-development subtype. They should not be silently mixed into the
initial builder-community inventory.

### Verification requirements

A publishable builder community should have:

- a stable development or subdivision name;
- an official, plat, MLS, HOA, builder, county, or manually verified source;
- a polygon boundary or an authoritative set of member parcels/addresses;
- a coherent housing form, development plan, or shared amenities;
- sufficient licensed or permissioned visual material;
- no unresolved contradiction between the claimed boundary and listing
  addresses.

Community size is a signal rather than a hard definition. Roughly 50 or more
homes is a useful default, with manual exceptions for distinctive smaller
developments.

### Content tiers

| Tier | Internal story beats | Recommended output |
|---|---:|---|
| A | 8 or more | 45–60 second standalone tour |
| B | 4–7 | 25–40 second tour, optionally with limited sector context |
| C | Fewer than 4 | Do not publish; fall back to sector or city |

Internal story beats may include:

- aerial or geographic overview;
- entrance monument;
- representative streetscape;
- representative housing and lot character;
- clubhouse;
- pool;
- tennis or pickleball courts;
- playground;
- trail, lake, park, or other open space;
- a distinctive facility or documented community activity.

An entrance sign plus several similar home photos does not constitute four
different story beats.

### Tour composition

A builder-community tour should normally be 70–85% internal content and
15–30% external context.

Recommended sequence:

1. establish the community and its boundary or arrival;
2. show streetscape and representative housing;
3. show the strongest internal amenities;
4. explain distinctive community facts;
5. add at most a few nearby sector anchors;
6. return visually or verbally to the community for the ending.

External POIs must not displace available internal amenities merely because
their photos are easier to obtain.

## Coverage level 2: city sector

### Definition

A city sector is a broad, product-defined subdivision of a large city. It is
not presented as an official neighborhood. Its job is to keep a tour relevant
when a city-wide tour covers too much geography.

Directional names are preferred for the first version because they are easy to
understand and do not overclaim local identity:

- North;
- East;
- South;
- West;
- optionally Central when the urban core cannot be assigned honestly to one
  directional sector.

### When a city needs sectors

Create sectors when several of the following are true:

- crossing the city commonly takes more than 20–25 minutes;
- the city contains multiple distinct activity centers;
- highways, rivers, railways, parks, or land-use changes provide stable
  dividing lines;
- a city tour would routinely feature places irrelevant to homes on the other
  side of the city;
- the city has enough useful content to give each sector a distinct tour.

Do not force every city into four sectors. A compact city with limited POIs
should retain one city tour. Another city may support two, three, or five
sectors better than four.

### Boundary construction

Do not divide a city by drawing a north/south and east/west line through its
centroid. Start with understandable physical boundaries:

1. interstate and major-road corridors;
2. rivers, railways, large parks, and other barriers;
3. clusters of daily-life and cultural POIs;
4. drive-time coherence;
5. existing administrative areas as supporting evidence.

Every address must resolve deterministically to one sector. Small gaps and
overlaps must be removed before publication.

### Content requirements

A publishable city sector should have:

- 12–20 plausible candidate POIs or visual locations;
- 8–12 final story locations for a 45–60 second tour;
- at least five content categories;
- at least three visually or narratively distinctive locations;
- a clear difference from adjacent sector tours;
- a reasonable relationship between the chosen locations and homes throughout
  the sector.

Useful categories include:

- geographic context and arrival;
- parks, trails, and outdoor life;
- dining and social centers;
- shopping and daily convenience;
- culture, history, and landmarks;
- family infrastructure;
- employment and transportation access.

At least 60–70% of a sector's core visual locations should differ from adjacent
sectors. A small number of city-defining landmarks may be shared.

### Narration rules

Sector narration describes access and character at sector scale. It must not
promise that every place is close to every home.

Acceptable patterns:

- "Across East Atlanta..."
- "This part of the city includes..."
- "Residents in the sector have access to..."

Listing-specific phrases such as "five minutes from this home" require a
verified route calculation for that listing.

## Coverage level 3: city

### Definition and use

The city tour is the fallback for:

- compact cities that do not benefit from sectors;
- large cities before sector coverage is ready;
- homes that cannot yet be assigned confidently to a more specific published
  area.

The tour answers, "What does living in this city provide?" It should focus on
city-defining places rather than pretend to describe the home's immediate
surroundings.

City-level content may include a city overview, downtown or town center,
signature parks and trail systems, cultural or civic landmarks, major activity
centers, and regional transportation context.

## Home-to-tour selection

Selection is based on both geographic assignment and content readiness:

```text
if home belongs to a verified builder community
   and that community has a publishable tour:
    select builder-community tour
else if home belongs to a published city sector
   and that sector has a publishable tour:
    select city-sector tour
else:
    select city tour
```

The fallback must be automatic. A missing, rejected, stale, or incomplete
builder tour must never leave the home without area coverage.

## Fetching and defining builder communities

### Candidate sources

Candidate discovery may use:

- MLS subdivision and community names;
- listing descriptions and HOA fields;
- builder and master-developer websites;
- HOA or community-association websites;
- county subdivision plats and parcel records;
- municipal planning records;
- map and search providers;
- existing Nextdoor polygons as supporting evidence only.

No single source is authoritative for every community. Preserve provenance and
the date fetched for every important assertion.

### Candidate workflow

1. Normalize names and aliases without discarding the original names.
2. Identify likely development type and reject obvious informal groups,
   buildings, and city-scale areas.
3. resolve a boundary or member-address set;
4. test known listings against the proposed membership;
5. inventory internal amenities and visual story beats;
6. verify image provenance and allowed use;
7. score content readiness;
8. send ambiguous or conflicting candidates to manual review;
9. publish only when both membership and content thresholds pass.

### Suggested readiness fields

```text
community_type
verification_status
boundary_source
boundary_verified_at
home_count
internal_story_beat_count
photo_rights_status
content_tier
tour_status
review_notes
```

These names describe required concepts, not a committed database migration.

## Fetching and defining city sectors

### Candidate workflow

1. Select a city whose city-wide coverage is demonstrably too broad.
2. collect the city boundary, major barriers, travel-time structure, and POI
   distribution;
3. propose the smallest useful number of sectors;
4. produce non-overlapping candidate polygons;
5. assign a broad pool of candidate POIs to each polygon and nearby buffer;
6. remove generic, redundant, visually weak, or geographically misleading
   candidates;
7. measure category coverage and cross-sector content overlap;
8. draft one distinct narrative proposition per sector;
9. generate prototype tours;
10. validate boundaries, POI relevance, and narration using real home
    locations before publication.

### Sector readiness checks

A sector is not ready merely because its polygon exists. Publishing requires:

- complete address coverage with no gaps or overlaps;
- sufficient POIs and usable photos;
- a tour that is distinct from neighboring sectors;
- no misleading proximity or school claims;
- acceptable visual and narration quality after human review.

## POI and photo policy

### Selection order

For builder communities:

1. official internal amenity and environment photos;
2. additional verified internal residential context;
3. nearby external lifestyle anchors.

For sectors and cities:

1. geographically defining views and landmarks;
2. distinctive parks, culture, and activity centers;
3. useful daily-life infrastructure;
4. generic commercial places only when they support a specific fact.

### Visual acceptance

A usable image should be sufficiently large, relevant to the narration,
recognizable, current enough for the claim, and licensed or approved for the
intended use. A high-resolution image is not automatically a high-information
image.

Record at minimum:

```text
source_url
source_owner
fetched_at
rights_status
depicted_place
caption_or_claim_supported
quality_status
```

AI animation may add camera motion, but it must not invent amenities,
architecture, people, signage, or geographic relationships. Generated clips
must retain the source image and generation prompt for reproducibility.

## Quality scoring

Use scoring to prioritize review, not to replace it.

### Builder-community readiness

```text
25% membership and boundary confidence
25% internal visual coverage
20% residential distinctiveness
15% factual narrative coverage
15% photo provenance and technical quality
```

### City-sector readiness

```text
25% geographic coherence
25% POI and category coverage
20% distinction from adjacent sectors
15% visual quality and availability
15% narration safety and factual support
```

A score can recommend a candidate for review. Publication still requires all
hard safety, provenance, and geographic-assignment checks.

## Atlanta pilot

Atlanta should test the sector model before Percho attempts a national rollout.

Start with four directional candidates:

- North Atlanta;
- East Atlanta;
- South Atlanta;
- West Atlanta.

Use major transportation corridors and physical barriers as the starting
geometry, then adjust them using POI clusters, drive-time coherence, and real
home assignments. Downtown and Midtown are the main test of the four-sector
model. If assigning the core to a directional sector produces misleading or
duplicated tours, create a fifth Central Atlanta sector.

For each candidate:

1. gather 20–30 POI and visual candidates;
2. select roughly 10 distinct story locations across at least five categories;
3. measure overlap against the other candidates;
4. state the sector's narrative in one sentence;
5. generate a 45–60 second prototype;
6. test the result against homes across the polygon, including its edges;
7. keep, redraw, merge, or split the sector based on the prototype.

The video is part of the definition test. A polygon that looks reasonable on a
map but cannot produce a relevant and distinctive tour is not yet a useful
Percho coverage area.

## Current database assessment

The current `communities` table is a useful candidate inventory, not a ready
coverage taxonomy.

A read-only audit on 2026-08-17 found that rows with `city = Atlanta` and
`state = GA` contained:

- 731 communities, all sourced from Nextdoor;
- coordinates and Nextdoor boundaries for all 731;
- a median polygon area of approximately 0.159 square miles;
- 583 polygons smaller than 0.5 square miles;
- no `community_pois` associations for those communities;
- no Atlanta community tour runs or assemblies;
- only one listing with `city = Atlanta`.

The rows mix large neighborhoods, subdivisions, condominium or townhome
developments, buildings, and city-like areas. They should not be treated as 731
equivalent, production-ready communities.

Use them as evidence for future logical-neighborhood work and as possible
builder-community leads. Do not generate a tour for every row and do not delete
or destructively merge the source data.

## Initial rollout

1. Use Aberdeen to establish the Tier A builder-community standard, with an
   internal-first tour.
2. Audit and verify an initial set of builder communities with strong official
   amenity photography.
3. Prototype Atlanta's four directional sectors and decide whether Central is
   required.
4. Produce a city tour for at least one compact city, such as Suwanee, to test
   the final fallback.
5. implement and verify the builder → sector → city selection policy.
6. expand builder and sector coverage only after the prototypes pass real-home
   relevance tests.

## Deferred extension: logical communities

Logical neighborhoods remain a valid future layer for places where city sectors
are still too broad and no builder community exists:

```text
builder community
    ↓ unavailable
logical neighborhood
    ↓ unavailable
city sector
    ↓ unavailable
city
```

The current system should preserve source polygons and provenance so this layer
can be added later. It should not delay the initial builder-community and
city-sector coverage rollout.
