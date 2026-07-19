-- ─── 0029_leads_community ───────────────────────────────────────────
-- --
-- Extend `leads` to accept community-targeted contacts. Owner rule:
-- "if exploring community directly, contact community owner". The
-- direct `/c/[slug]/feed` Contact button needs a place to land its
-- row when the buyer is interested in the neighborhood at large
-- (no listing context). agent_id is still required (NOT NULL), but
-- now derived from `communities.created_by` instead of `listing.agent_id`.
--
-- Additive: existing listing-leads keep working unchanged.
-- ────────────────────────────────────────────────────────────────────

alter table public.leads alter column listing_id drop not null;
alter table public.leads add column community_id uuid references public.communities on delete set null;

-- Exactly one of listing_id / community_id must be set (a lead is
-- about a specific home OR a specific community, never both, never
-- neither).
alter table public.leads
  add constraint leads_target_chk check (
    (listing_id is not null and community_id is null)
    or (listing_id is null and community_id is not null)
  );

create index leads_community_idx on public.leads (community_id, created_at desc);
