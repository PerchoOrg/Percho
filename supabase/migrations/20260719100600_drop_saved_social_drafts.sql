-- ─── 20260719100600_drop_saved_social_drafts ──────────────────────
-- Drop the entire `saved_social_drafts` surface.
--
-- The interactive AI generation feature (Generate description / Social copy
-- panel / Community marketing panel) was removed from the product — content
-- is generated automatically on the backend, not by user clicks. The 5 API
-- routes, 2 UI panels, and `lib/ai/{anthropic,rate-limit,social-cache}.ts`
-- were deleted in the code-cleanup phase (commit ca72346). This migration
-- closes phase B (§10.6): remove the DB objects the deleted code owned.
--
-- Scope — everything created by 0031-0034:
--   * table  public.saved_social_drafts
--   * triggers: saved_social_drafts_cap, saved_social_drafts_touch,
--               saved_social_drafts_invalidate_cache
--   * functions: enforce_saved_social_drafts_cap,
--                touch_saved_social_drafts_updated_at,
--                invalidate_saved_social_drafts_cache
--   * indexes: saved_social_drafts_listing_idx,
--              saved_social_drafts_input_hash_idx,
--              saved_social_drafts_community_idx
--   * policies: agent reads/saves/updates/deletes own social drafts,
--               agent reads/saves/updates own community social drafts
--
-- `drop table ... cascade` handles triggers + indexes + policies + the
-- constraints on this table. Trigger functions live in the `public` schema
-- and are dropped separately (they don't cascade from the table).
--
-- Blast radius (per §10.6.1 phase-B audit):
--   * FK inbound: none. `grep -rn "references public.saved_social_drafts"`
--     returned 0 hits at drop time.
--   * FK outbound: saved_social_drafts → listings, agents, communities.
--     These parent tables lose an orphan child; no cascade impact.
--   * RLS policies referencing this table from OTHER tables: none.
--   * App code readers: none. All 5 API routes + 2 UI components deleted
--     in commit ca72346.
--
-- Reversibility: this is a data-destructive drop of ~0 rows in production
-- (feature was never shipped past dev). If someone later reintroduces
-- interactive AI generation, re-create with a fresh schema — the 0031-0034
-- shape carried baggage (Chinese-market platforms, rednote/wechat,
-- language enum with zh) that we don't want back.

drop table if exists public.saved_social_drafts cascade;

drop function if exists public.enforce_saved_social_drafts_cap();
drop function if exists public.touch_saved_social_drafts_updated_at();
drop function if exists public.invalidate_saved_social_drafts_cache();
