-- Phase 94 (2026-07-17): External listings (FMLS import).
--
-- Motivation: seed 250 real FMLS listings (Alpharetta/Johns Creek/Sandy Springs/
-- Duluth/Suwanee) for demo + ken-burns video pipeline development.  These are
-- NOT owned by any Percho agent — the "listing agent" is the real FMLS agent
-- whose name/phone/office we display verbatim.  We do NOT want to fabricate
-- fake Percho agent rows for them.
--
-- Shape:
--   * agent_id becomes nullable.  External listings have NULL agent_id.
--   * external_agent_name / phone / office carry FMLS attribution.
--   * source / source_id identify provenance ('fmls', remineId).
--   * RLS: `admin manages external listings` gated on agents.is_admin.
--
-- Public read continues to use status='active' (migration 0030), unchanged.
--
-- URL routing:  `/v/fmls/{source_id}` for external listings (see route added
-- in same phase).  Internal listings keep `/v/{agent_slug}/{listing_slug}`.

-- ─── columns ─────────────────────────────────────────────────────────
alter table public.listings
  alter column agent_id drop not null;

alter table public.listings
  add column if not exists external_agent_name  text,
  add column if not exists external_agent_phone text,
  add column if not exists external_office      text,
  add column if not exists source               text,
  add column if not exists source_id            text;

-- ─── constraints ─────────────────────────────────────────────────────
-- XOR: either owned by a Percho agent OR carries external attribution + source.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'listings_owner_chk') then
    alter table public.listings
      add constraint listings_owner_chk
      check (
        (agent_id is not null and source is null)
        or (agent_id is null and source is not null and external_agent_name is not null)
      ) not valid;
    alter table public.listings validate constraint listings_owner_chk;
  end if;
end $$;

-- Unique (source, source_id) — supports PostgREST on_conflict=source,source_id.
-- Real UNIQUE constraint (not partial index) so REST upsert works (§3 of
-- supabase-migration-workflow).  Postgres allows multiple NULLs by default,
-- so internal (source IS NULL) rows are unaffected.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'listings_source_uniq') then
    alter table public.listings
      add constraint listings_source_uniq unique (source, source_id);
  end if;
end $$;

-- Drop existing (agent_id, slug) UNIQUE — can't work with nullable agent_id.
-- Replace with partial: unique per agent, only when agent_id IS NOT NULL.
-- External listings' slug uniqueness is covered by (source, source_id).
alter table public.listings drop constraint if exists listings_agent_id_slug_key;

create unique index if not exists listings_agent_slug_uidx
  on public.listings (agent_id, slug)
  where agent_id is not null;

-- ─── RLS: admin manages external listings ───────────────────────────
-- Internal listings retain the existing "agent manages own listings" policy
-- (agent_id = agents.id where agents.user_id = auth.uid()).
-- External listings (agent_id IS NULL) are admin-only for CRUD.
-- Public read continues via "public reads active listings" (status='active').
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='listings'
      and policyname='admin manages external listings'
  ) then
    create policy "admin manages external listings" on public.listings
      for all
      using (
        agent_id is null
        and exists (
          select 1 from public.agents a
          where a.user_id = auth.uid() and a.is_admin = true
        )
      )
      with check (
        agent_id is null
        and exists (
          select 1 from public.agents a
          where a.user_id = auth.uid() and a.is_admin = true
        )
      );
  end if;
end $$;

-- Helpful index for source lookups (route /v/fmls/{source_id}).
create index if not exists listings_source_lookup_idx
  on public.listings (source, source_id)
  where source is not null;
