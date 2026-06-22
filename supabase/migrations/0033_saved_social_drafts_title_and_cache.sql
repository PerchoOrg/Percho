-- ─── 0033_saved_social_drafts_title_and_cache ─────────────────────
-- Phase 48.5 (2026-06-22). Two adjacent product needs:
--
-- 1. Rename. Saved drafts get plenty of accumulation, and "Facebook ·
--    English · 6/22 7:42 PM" doesn't scale. Add an optional `title`
--    so agents can label drafts ("Open house — front yard angle").
--    Nullable, max 120 chars.
--
-- 2. Token-cache. Re-clicking Generate with the exact same inputs
--    used to call Claude every time. Add `input_hash` (sha256 hex of
--    normalized {platform, language, highlights}) so the API can
--    look up an existing draft and short-circuit the LLM call. Index
--    on (listing_id, input_hash) for the lookup. Hash is set by the
--    server, not the client — we trust the server's normalization.
--
-- Cache semantics:
--   * Insert sets input_hash from server-side normalization.
--   * On a generate request the API hashes the same way and selects
--     the most recent matching row for this listing → if found,
--     return its body, no LLM call. Refine ("previous_drafts" is
--     present) always bypasses the cache by intent.
--   * Edits update input_hash to NULL — once the agent has tweaked
--     the body, the row is no longer "the canonical answer for this
--     prompt", so a future identical prompt should re-generate
--     fresh rather than return a stale tweaked body. (See below for
--     the trigger that handles this.)

alter table public.saved_social_drafts
  add column if not exists title text,
  add column if not exists input_hash text;

alter table public.saved_social_drafts
  drop constraint if exists saved_social_drafts_title_len;
alter table public.saved_social_drafts
  add constraint saved_social_drafts_title_len
  check (title is null or char_length(title) between 1 and 120);

-- Lookup index: scoped per listing, sparse on hash so edited rows
-- (hash NULL) are excluded from cache hits.
create index if not exists saved_social_drafts_input_hash_idx
  on public.saved_social_drafts (listing_id, input_hash)
  where input_hash is not null;

-- When an edit changes body, drop input_hash so the row is no longer
-- a cache target. Title rename is fine — doesn't invalidate.
create or replace function public.invalidate_saved_social_drafts_cache()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body then
    new.input_hash := null;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_social_drafts_invalidate_cache
  on public.saved_social_drafts;
create trigger saved_social_drafts_invalidate_cache
  before update on public.saved_social_drafts
  for each row execute function public.invalidate_saved_social_drafts_cache();
