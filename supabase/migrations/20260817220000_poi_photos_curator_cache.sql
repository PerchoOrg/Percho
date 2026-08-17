-- Cache the Curator's annotation per photo (2026-08-17).
--
-- Re-running the photos step re-annotated every photo, at ~25 MB of upload and
-- ~50s per run, even when the change being tested was deterministic (a
-- resolution filter, a threshold). The annotation describes the PHOTO — what is
-- in it, whether anything moves, whether text is stamped on it — so it is
-- stable as long as the photo and the prompt are.
--
--   curator_tags     the annotation object (lib/poi/tour-orchestrator/types.ts)
--   curator_version  the prompt/schema generation it was produced under. The
--                    code bumps CURATOR_VERSION whenever Prompt A or the field
--                    set changes, which invalidates every cached row without
--                    anyone having to remember to clear a table.
--   curated_at       when it was written; null means never curated.
--
-- Batch-level fields (narrative_role, poi_pair_with, emotional_weight) are
-- cached too, and re-normalised against the current batch on every read —
-- normalizeAnnotations re-enforces "one opener, one closer, pairs must be
-- mutual", so a cached role that no longer fits the set is corrected in code
-- rather than by paying for a new call.

alter table public.poi_photos
  add column if not exists curator_tags    jsonb,
  add column if not exists curator_version integer,
  add column if not exists curated_at      timestamptz;

-- The photos step looks up "which of these are already curated at the current
-- version", per POI set.
create index if not exists poi_photos_curated_idx
  on public.poi_photos (curator_version, curated_at)
  where curator_tags is not null;

comment on column public.poi_photos.curator_tags is
  'Tour Curator annotation for this photo (tour-orchestrator/types.ts annotationSchema).';
comment on column public.poi_photos.curator_version is
  'CURATOR_VERSION the annotation was produced under; a mismatch forces re-annotation.';
comment on column public.poi_photos.curated_at is
  'When curator_tags was written. Null = never annotated.';
