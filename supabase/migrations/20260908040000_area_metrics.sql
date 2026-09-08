-- Area metrics — the numbers behind the search tab's lenses.
--
-- One row per (area, metric). LONG format on purpose: the metrics we want are
-- not known in advance and arrive from unrelated scrapers on unrelated
-- schedules (a county millage sheet, a state proficiency file, a utility rate
-- card). In wide format each new metric is a migration and each scraper writes
-- a column it does not own; here a scraper upserts its own rows and touches
-- nothing else.
--
-- Every value carries where it came from and when. A buyer is being told what
-- a house will cost them per month — a figure with no provenance is one we
-- cannot defend, and the buyer study's #1 post-move regret was exactly the
-- costs nobody could show them up front. `source_url` is the page a skeptical
-- buyer (or the owner) can open; `as_of` is the period the figure describes,
-- not the day we fetched it.
--
-- `area_kind` starts as 'county' because tax and sanitation are set at that
-- level. It is not a county table: school proficiency belongs to a district
-- and electricity to a service territory, and those get their own kinds
-- rather than being averaged up to a county they do not align with.

create type public.area_kind as enum ('county', 'city', 'school_district', 'utility_territory');

create table if not exists public.area_metrics (
  id uuid primary key default gen_random_uuid(),

  -- Which area. `area_key` is the stable join key (slugified name, unique
  -- within a kind + state); `area_name` is what we show.
  area_kind public.area_kind not null,
  state text not null check (char_length(state) = 2),
  area_key text not null,
  area_name text not null,

  -- Which number. `metric` is a stable machine key ('property_tax_rate_pct',
  -- 'school_proficiency_pct', 'electric_monthly_usd', …); `unit` says how to
  -- read the value so a renderer never has to hardcode it per metric.
  metric text not null,
  value numeric not null,
  unit text not null,

  -- Where it came from. `estimated` marks a figure we have not yet sourced —
  -- it renders with a disclosure and must never be presented as measured.
  source text not null,
  source_url text,
  as_of date not null,
  estimated boolean not null default false,

  -- Free-form, for anything a scraper needs to carry that is not a number
  -- (the provider's name for a utility rate, the millage components).
  detail jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (area_kind, state, area_key, metric)
);

create index area_metrics_lookup_idx
  on public.area_metrics (area_kind, state, metric);

comment on table public.area_metrics is
  'One row per (area, metric). Every value carries source + as_of; `estimated` marks an unsourced placeholder.';

-- Read-only to the world: these are public-record figures and the search tab
-- renders them before a buyer signs in. Writes are service-role only (the
-- scrapers in scripts/admin), which is the default when no policy grants them.
alter table public.area_metrics enable row level security;

create policy "area metrics are public"
  on public.area_metrics for select
  using (true);

grant select on public.area_metrics to anon, authenticated;
