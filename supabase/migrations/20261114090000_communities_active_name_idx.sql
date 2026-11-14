-- ─── communities: index the grid's alphabetical read ────────────────────
--
-- `/communities` (lib/communities/list.ts) reads the first 1000 active
-- communities by name. With no index on `name` or `status`, Postgres scans
-- and sorts all ~22.7k active rows on every request. Warm, that is ~150 ms;
-- on a cold cache it ran past the anon role's statement_timeout (57014) on
-- 2026-11-14 08:57 UTC and the page threw "Application error".
--
-- A partial index on `name` for active rows lets the ORDER BY name LIMIT
-- walk the index instead. No data or policy change.
-- ─────────────────────────────────────────────────────────────────────

create index if not exists communities_active_name_idx
  on public.communities (name)
  where status = 'active';
