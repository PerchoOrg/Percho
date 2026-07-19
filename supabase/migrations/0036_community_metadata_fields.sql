-- community metadata expansion.
--
-- Adds 10 nullable fields to `communities` so agents can capture more useful
-- community context directly on the editor form. All optional — existing rows
-- stay valid. No new RLS needed; existing creator-only update policy covers
-- these columns.
--
-- Tier 1 (high-ROI buyer questions):
--   zip, county, hoa_fee_text, year_built_text, price_range_text,
--   property_types
--
-- Tier 2 (nice-to-have):
--   highlights, builder, website, tagline
--
-- Free-text "_text" suffix on numeric-ish fields is intentional: agents
-- routinely write things like "$450k–$1.2M", "2018–2024", "$220/mo +
-- one-time initiation" and forcing strict numeric types creates more
-- friction than it saves. We trade off filterability for input ergonomics.

alter table public.communities
  add column if not exists zip text,
  add column if not exists county text,
  add column if not exists hoa_fee_text text,
  add column if not exists year_built_text text,
  add column if not exists price_range_text text,
  add column if not exists property_types text[],
  add column if not exists highlights text[],
  add column if not exists builder text,
  add column if not exists website text,
  add column if not exists tagline text;

-- Keep arrays NULL when unset (not empty array) so the editor can distinguish
-- "agent never touched this" from "agent cleared it". updateCommunity() in
-- app/dashboard/communities/actions.ts maps `[]` -> NULL on save.
