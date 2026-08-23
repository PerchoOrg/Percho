-- community_photo_sources — the pages the ingest step is allowed to read.
--
-- "Fetch & Tag" was one step doing four things; it is now four, and the second
-- of them fetches photos from web pages. That step needs to know WHICH pages,
-- and the answer has to survive a re-run of `research` — which starts a new
-- `community_tour_runs` row and would take a selection stored in `step_results`
-- down with it.
--
-- Owner 2026-08-23, defining the rule this table encodes: "the default main
-- website for the community if it exists, should always be selected as
-- default, and its sibling and child subpages. other webpages are optional
-- unless I manually selected them for fetching."
--
-- So `origin` is not decoration — it is what decides the default of `enabled`:
--
--   community_site  the community's own site, and the same-origin pages one
--                   click from it. enabled = true, written by the ingest step.
--   research        a POI's own site, found by the research agent (a school, a
--                   county park). enabled = FALSE — the owner opts in.
--   manual          a URL he pasted. enabled = true; pasting IS the opt-in.
--
-- Photo licensing is unresolved for anything that is not the community's own
-- site, which is the other half of why `research` defaults to off.

create table if not exists public.community_photo_sources (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid not null references public.communities(id) on delete cascade,
  url            text not null,
  -- What the page shows ("Pool", "Clubhouse"). Becomes part of the synthetic
  -- POI name in ingest-page-photos.ts, which is how one page's photos stay
  -- separable from another's in the tour.
  label          text,
  origin         text not null check (origin in ('community_site', 'research', 'manual')),
  enabled        boolean not null default false,
  -- Set once the depth-1 link harvest has run on this page. Only
  -- `community_site` rows are ever expanded, and the children they produce are
  -- born already stamped — that, and nothing else, is what keeps the crawl at
  -- depth 1 instead of walking the whole internet.
  expanded_at    timestamptz,
  -- Non-null means the ingest step has read this page. It skips those, so a
  -- second click continues the batch rather than re-downloading it; the manual
  -- box in the panel is the escape hatch for a deliberate re-fetch.
  last_ingested_at timestamptz,
  -- {found, added, skipped} from the last ingest, so the panel can say what a
  -- page actually yielded without re-reading it.
  last_result    jsonb,
  created_at     timestamptz not null default now(),
  unique (community_id, url)
);

create index if not exists community_photo_sources_community_idx
  on public.community_photo_sources (community_id, enabled);

alter table public.community_photo_sources enable row level security;

-- Admin read only, same shape as listing_tour_runs: the whole community-tour
-- surface is admin-gated, and every write here comes from a service-role
-- route (the sources API and the ingest step).
drop policy if exists "admin reads community_photo_sources" on public.community_photo_sources;
create policy "admin reads community_photo_sources" on public.community_photo_sources
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

comment on table public.community_photo_sources is
  'Web pages the community-tour ingest step may fetch photos from. origin decides the default of enabled; see the migration header.';
