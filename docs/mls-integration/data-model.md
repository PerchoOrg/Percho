# MLS data model

Four mirror tables + one sync-state table. Only the RESO fields Vicinity
actually needs are mirrored — full RESO Data Dictionary has hundreds of
fields; adding them later is a non-breaking migration.

Migration source of truth: `supabase/migrations/*_mls_tables.sql`.

## Conventions

- **PK**: synthetic `uuid` (`gen_random_uuid()`).
- **Natural key**: `(source_system, <vendor_key>)` unique constraint.
  `source_system = 'fmls_bridge'` is the only value today.
- **Column style**: snake_case, matching the rest of Vicinity's schema.
  RESO PascalCase is only used at the transport boundary (see
  `lib/mls/reso-types.ts`).
- **Nullability**: nearly every field is nullable. Bridge routinely
  returns partial records — the DB should not reject them.
- **RLS**: enabled with zero policies on all five tables. Access is
  service-role only. Public consumption always goes through app code
  that applies IDX filters (see `compliance-checklist.md`).

## Tables

### `mls_listings` — the /Property mirror

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| source_system | text | e.g. `fmls_bridge` |
| listing_key | text | RESO `ListingKey` |
| list_price | numeric | |
| standard_status | text | RESO enum: Active, Pending, Closed, … |
| property_type | text | Residential, ResidentialLease, Land, … |
| property_sub_type | text | SingleFamilyResidence, Condominium, … |
| street_number | text | |
| street_name | text | includes suffix + directional in FMLS |
| street_suffix | text | separate field when Bridge splits it |
| city | text | |
| state_or_province | text | 2-letter |
| postal_code | text | |
| latitude | double precision | |
| longitude | double precision | |
| bedrooms_total | integer | |
| bathrooms_total_integer | integer | RESO integer variant |
| living_area | numeric | sqft |
| lot_size_acres | numeric | |
| year_built | integer | |
| public_remarks | text | free-form description |
| list_office_name | text | required for IDX attribution |
| list_agent_full_name | text | |
| list_agent_mls_id | text | |
| days_on_market | integer | |
| modification_timestamp | timestamptz | drives incremental sync |
| internet_entire_listing_display_yn | boolean | IDX opt-out flag |
| our_listing_id | uuid | FK → `listings.id`, nullable |
| mirrored_at | timestamptz | wall-clock of the last upsert |

Unique: `(source_system, listing_key)`.
Indexes:
- `modification_timestamp desc` — incremental sync + freshness sort
- `city` — city-scoped lookups
- `standard_status` — filter Active/Pending
- `(latitude, longitude)` — placeholder for geo lookups (btree, not
  PostGIS; see README §"Judgment calls")

### `mls_media` — the /Media mirror

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| source_system | text | |
| media_key | text | RESO `MediaKey` |
| listing_key | text | RESO `ResourceRecordKey` |
| media_url | text | Bridge CDN URL — hotlinked, not mirrored (MVP) |
| display_order | integer | RESO `Order` |
| media_category | text | Photo, VirtualTour, Video, Document, … |
| short_description | text | caption |
| modification_timestamp | timestamptz | |
| mirrored_at | timestamptz | |

Unique: `(source_system, media_key)`.
Index: `(source_system, listing_key)` for per-listing photo lookup.

### `mls_offices` — the /Office mirror

| Column | Type |
|---|---|
| office_key, office_name, office_phone, office_mls_id | text |
| modification_timestamp, mirrored_at | timestamptz |

Unique: `(source_system, office_key)`.

### `mls_members` — the /Member mirror

| Column | Type |
|---|---|
| member_key, member_full_name, member_mls_id, member_email, member_office_key | text |
| modification_timestamp, mirrored_at | timestamptz |

Unique: `(source_system, member_key)`.

### `mls_sync_state` — sync watermark

| Column | Type |
|---|---|
| source_system | text (PK) |
| last_modification_timestamp | timestamptz |
| updated_at | timestamptz |

Single row per source. On successful incremental sync, we update
`last_modification_timestamp` to the max `ModificationTimestamp` seen
in the batch. On failure we do NOT advance it, so the next run
re-processes the same window (idempotent via unique constraint).

## Field selection rationale

Fields NOT mirrored (deliberately):

- Financial: taxes, HOA fees, association details — not needed for
  address autofill; add later if we surface a full listing detail page.
- Showings / private remarks — private data, off-limits for IDX display.
- Room-by-room descriptors — dozens of fields, low signal for MVP.
- Buyer-agent commission fields — legally sensitive post-NAR settlement,
  and we shouldn't display them.

Add a follow-up migration when a real product need appears. Do not
speculatively expand this schema.
