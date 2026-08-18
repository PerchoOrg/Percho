# Living-area coverage model

Status: initial product definition for community discovery, content acquisition,
tour selection, and listing fallback.

## Decision

Percho launches with exactly two coverage levels:

1. **Clear-boundary community** — the specific layer for a verified builder,
   master-planned, subdivision, or HOA community.
2. **City** — the universal fallback for every home that does not have a
   publishable clear-boundary community tour.

```text
home
├── belongs to a verified clear-boundary community
│   └── use its publishable community tour
└── otherwise
    └── use the city tour
```

Logical neighborhoods, directional city sectors, school-area communities, and
other inferred intermediate geographies are deferred. They may be added later
without changing this initial contract.

## Why two levels

The product needs useful coverage, not a complete cultural map of every metro.
City coverage is understandable, scalable, and available for every listing.
Builder and master-planned communities are worth a more specific layer because
they usually have defensible membership, recognizable identity, and internal
amenities that materially change the buyer story.

Product-defined sectors create boundary debates and duplicated POIs before we
have proved that city tours are insufficient. They are useful research
experiments, not a launch dependency.

## Coverage priority

Specific coverage wins only when it is verified and publishable. A community
database row alone does not displace the city tour.

```text
if listing belongs to a verified clear-boundary community
   and that community has a publishable current tour:
    select community tour
else:
    select city tour
```

A rejected, missing, incomplete, or stale community tour must fall back to the
city automatically. A home must never lose area content merely because a more
specific candidate exists.

## Level 1: city

### Purpose

The city tour answers: “What does living in this city provide?” It does not
pretend that every featured place is near every home.

The city is identified by canonical `(city, state)` and listing address data,
not by pretending a Nextdoor neighborhood row is the municipality. Postal-city
coverage may extend beyond incorporated limits; the UI should say “Suwanee”
rather than imply that every listing is inside the City of Suwanee government
boundary.

The current tour tables are community-keyed. City rollout therefore needs an
explicit city tour scope (or a typed generic coverage scope); it must not reuse
an arbitrary `communities.id` whose name happens to match the city.

A city tour should establish:

- the city's recognizable identity;
- its primary town center, downtown, or civic anchor;
- major parks, trails, water, or outdoor systems;
- school context at city scale, without claiming assignment;
- the strongest daily-life, cultural, dining, and commercial anchors;
- regional access or employment context when it is genuinely defining.

### Research

Run one coordinated research call per city, not one call per artificial area.
The prompt should seek a city-wide editorial plan and return an intentionally
ordered POI array.

Google Places then:

1. resolves every candidate once;
2. removes administrative/non-POI results and closed businesses;
3. deduplicates by `place_id` and normalized name;
4. rejects points outside the adopted city coverage boundary;
5. supplements thin categories with typed Nearby queries, without another LLM
   call;
6. sends only verified survivors to photo download and selection.

### Content target

Start with 10–16 final city POIs for a 45–60 second tour. More duration must
come from more information, not repeated storefronts or several similar photos
of one landmark.

The final set should normally cover at least five useful chapters:

1. identity/civic anchor;
2. school and family context;
3. parks, trails, recreation, or natural setting;
4. daily-life commercial and cultural anchors;
5. a warm or distinctive closing location.

One strong photo per POI is the default. A second is justified only when it
communicates a different fact, such as wide context followed by an informative
detail.

### Ordering

POI array order is a production instruction, not an incidental database sort.
The Scheduler should preserve the editorial arc, pin an appropriate opener and
closer, and treat all selected photos from one POI as an atomic unit. Bucket
balancing may move a whole POI group but must never interleave another location
between its wide/detail frames.

### City narration safety

Acceptable:

- “Suwanee is centered around...”
- “Across the city...”
- “The city includes...”
- “Families can verify the assigned school for each address...”

Not acceptable without listing-specific verification:

- “five minutes from this home”;
- “your children attend this school”;
- “this park is within walking distance”;
- “residents have access” when access requires private membership.

## Level 2: clear-boundary community

### Definition

A qualifying community is a named residential development or subdivision with
a coherent identity and verifiable membership or boundary. It may have been
created by one builder, several builders under a master developer, or an HOA
after buildout.

The following do not automatically qualify:

- every Nextdoor neighborhood;
- an informal neighborhood or school-area name;
- a directional part of a city;
- one apartment or condominium building;
- nearby homes with no shared development identity;
- an HOA name with no evidence that the listing belongs to it.

### Verification requirements

A publishable community should have:

- a stable name and aliases;
- an official, plat, MLS, HOA, builder, county, or manually verified source;
- a polygon boundary or authoritative member parcel/address set;
- a coherent development plan, housing character, or shared amenities;
- sufficient licensed or permissioned visual material;
- no unresolved contradiction between boundary and listing membership.

Roughly 50 or more homes is a useful discovery signal, not a hard definition.
Distinctive smaller developments may pass manual review.

### Internal-first content

For a clear-boundary community, the community itself is the product. Use
internal material before city context:

1. aerial/geographic overview or arrival;
2. entrance and representative streetscape;
3. representative housing and lot character;
4. clubhouse, pool, courts, playground, trails, lake, parks, or other real
   amenities;
5. distinctive documented community facts;
6. at most a few city anchors when needed for context;
7. return visually or verbally to the community for the ending.

A community tour should normally be 70–85% internal and 15–30% city context.
External POIs must not displace available amenity photos simply because Google
photos are easier to obtain.

### Readiness tiers

| Tier | Internal story beats | Output |
|---|---:|---|
| A | 8 or more | 45–60 second standalone community tour |
| B | 4–7 | 25–40 second tour with limited city context |
| C | Fewer than 4 | Do not publish; use the city tour |

An entrance sign plus similar house photos is not four different story beats.

### Candidate sources

- MLS subdivision, community, and HOA fields;
- builder and master-developer websites;
- HOA/community-association sites;
- county plats and parcel records;
- municipal planning records;
- listing descriptions;
- map/search providers;
- Nextdoor polygons as supporting evidence only.

Preserve source, fetch date, aliases, and review history. No single source is
authoritative for every community.

### Candidate workflow

1. normalize names without discarding originals;
2. reject informal groups, buildings, and city-scale areas;
3. resolve boundary or member addresses;
4. test known listings against membership;
5. inventory internal amenities and visual story beats;
6. verify image provenance and allowed use;
7. score readiness;
8. manually review ambiguity;
9. publish only when membership and content thresholds pass.

Suggested concepts to retain in data:

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

## POI and photo policy

For communities, select official internal amenity/environment photos first,
then residential context, then limited city anchors.

For cities, select defining views and landmarks, distinctive parks/culture,
useful daily-life infrastructure, and generic commercial places only when they
support a specific fact.

Generic interiors do not earn time by themselves. A supermarket, library,
classroom, or café interior is useful only when narration makes a verified,
buyer-relevant point.

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

AI animation may add camera motion but must not invent amenities, architecture,
people, signage, or geographic relationships. Retain source images and prompts
for reproducibility.

## Current database interpretation

The `communities` table is a candidate inventory, not a publication taxonomy.
Existing Nextdoor rows may support future research or identify builder-community
leads, but they must not automatically outrank the city tour.

Directional Suwanee sector records and their videos were created as inactive
experiments. Keep them unpublished for evaluation; do not use them in listing
selection.

## Initial rollout

1. Produce and review one city tour for Suwanee.
2. Use Aberdeen to establish the Tier A clear-boundary community standard.
3. Audit an initial set of builder/master-planned communities with official
   amenity photography.
4. Implement and verify the community → city fallback.
5. Expand city coverage and verified communities before revisiting inferred
   logical areas.

## Deferred extensions

Possible future intermediate layers include logical neighborhoods, school-area
guides, and directional city sectors. Add one only when real listing tests show
that the city tour is materially too broad and the proposed layer has stable
boundaries, enough distinctive POIs, and a non-duplicative story.
