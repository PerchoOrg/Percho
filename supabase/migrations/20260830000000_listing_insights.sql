-- listing_insights — the "After you move in" cards, per listing (phase130,
-- replacing phase126's listing_questions).
--
-- phase126 stored answers to a fixed question bank. The owner reviewed the
-- result on a demo (2026-08-29) and rejected the shape: no pre-designed
-- questions, no Q&A to read through — a research job decides per home what
-- is worth a card, and the card carries its own short detail. The old table
-- never held a row outside a dry run, so it is dropped rather than migrated.
--
-- `basis` is the "sources" line as data: a non-empty array of
-- `{ note, url }`. It is what makes a card publishable — the parser refuses
-- a card with no source and this constraint refuses to store one.
--
-- `status` is the review gate. The generation script writes `draft`; buyers
-- read `approved` only. Writes are service-role only — no agent policy on
-- purpose, this is not the agent's copy.

drop table if exists public.listing_questions;

create table if not exists public.listing_insights (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings on delete cascade,
  headline      text not null,
  detail        text not null,
  kind          text not null check (kind in ('watch', 'plus', 'know')),
  theme         text not null,
  verify        text,
  basis         jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(basis) = 'array' and jsonb_array_length(basis) > 0),
  decisiveness  smallint not null default 2 check (decisiveness between 1 and 3),
  status        text not null default 'draft'
                  check (status in ('draft', 'approved', 'rejected')),
  model         text,
  generated_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);

create index if not exists listing_insights_listing_status_idx
  on public.listing_insights (listing_id, status);

alter table public.listing_insights enable row level security;

-- Buyers (anon) read approved cards for any listing they can already see.
create policy "public reads approved listing insights" on public.listing_insights
  for select using (status = 'approved');

comment on table public.listing_insights is
  'The explore page''s "After you move in" cards. Written by scripts/admin/generate-move-in-insights.ts (Codex research job) as draft; buyers see approved rows only.';
comment on column public.listing_insights.basis is
  'Non-empty array of { note, url } — the pages the card rests on. A card with no source is not storable.';
