-- Phase 76 (2026-07-15): seed Atlanta communities from Nextdoor + agent claim flow
-- Idempotent: all ALTERs guarded, constraint adds wrapped in DO blocks.

-- ─── (1) Nextdoor provenance ───────────────────────────────────────
alter table public.communities
  add column if not exists source          text        default 'agent' not null,
  add column if not exists nextdoor_id     text,
  add column if not exists nextdoor_slug   text,
  add column if not exists nextdoor_url    text,
  add column if not exists seeded_at       timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='communities_source_chk') then
    alter table public.communities
      add constraint communities_source_chk
        check (source in ('agent', 'nextdoor')) not valid;
    alter table public.communities validate constraint communities_source_chk;
  end if;
end $$;

-- ─── (2) Geo + boundary ────────────────────────────────────────────
alter table public.communities
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  add column if not exists boundary        jsonb,
  add column if not exists boundary_source text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='communities_boundary_source_chk') then
    alter table public.communities
      add constraint communities_boundary_source_chk
        check (
          boundary_source is null
          or boundary_source in ('nextdoor', 'osm', 'zillow', 'manual', 'arcgis')
        ) not valid;
    alter table public.communities validate constraint communities_boundary_source_chk;
  end if;

  if not exists (select 1 from pg_constraint where conname='communities_boundary_type_chk') then
    alter table public.communities
      add constraint communities_boundary_type_chk
        check (
          boundary is null
          or (boundary->>'type') in ('MultiPolygon', 'Polygon')
        ) not valid;
    alter table public.communities validate constraint communities_boundary_type_chk;
  end if;
end $$;

-- ─── (3) Demographic seed fields ───────────────────────────────────
alter table public.communities
  add column if not exists residents_count      text,
  add column if not exists median_home_value    text,
  add column if not exists avg_income           text,
  add column if not exists avg_age              text,
  add column if not exists homeowners_pct       text,
  add column if not exists friendliness_score   integer,
  add column if not exists affordability_score  integer,
  add column if not exists attributes           text[],
  add column if not exists interests            text[],
  add column if not exists hero_image_url       text,
  add column if not exists nearby               jsonb;

-- ─── (4) Uniqueness on nextdoor_id (proper constraint for ON CONFLICT) ───
drop index if exists public.communities_nextdoor_id_uidx;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='communities_nextdoor_id_key') then
    alter table public.communities
      add constraint communities_nextdoor_id_key unique (nextdoor_id);
  end if;
end $$;

-- ─── (5) Unclaimed index ───────────────────────────────────────────
create index if not exists communities_unclaimed_idx
  on public.communities (state, city)
  where created_by is null;

-- ─── (6) claim_community RPC ───────────────────────────────────────
create or replace function public.claim_community(p_community_id uuid)
returns public.communities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_id uuid;
  v_row      public.communities;
begin
  select id into v_agent_id from public.agents where user_id = auth.uid();
  if v_agent_id is null then
    raise exception 'claim_community: caller is not an agent' using errcode = '42501';
  end if;

  update public.communities
     set created_by = v_agent_id
   where id = p_community_id
     and created_by is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'claim_community: community % is already claimed or does not exist', p_community_id
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.claim_community(uuid) from public;
grant execute on function public.claim_community(uuid) to authenticated;
