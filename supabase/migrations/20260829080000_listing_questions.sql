-- listing_questions — answers to the move-in question bank, per listing
-- (phase126, docs/design/move-in-questions.md).
--
-- One row per (listing, question). The question itself is NOT stored: the
-- bank lives in code (`packages/shared/src/questions.ts`) and `question_id`
-- references it, so a wording change never has to touch the database and a
-- retired question simply stops being rendered.
--
-- `basis` is the "Based on" line as data — an array of
-- `{ type, note, url? }`. It is what makes an answer publishable: the
-- generator refuses to emit a row with an empty basis, and the constraint
-- below refuses to store one, because an answer that cannot say what it
-- rests on is exactly the fabricated editorial the explore page bans.
--
-- `status` is the review gate. Rows are written as `draft` by the generation
-- script and read by buyers only once `approved`; the first batch is read by
-- the owner to calibrate the prompt. Writes are service-role only — there is
-- no agent-facing policy on purpose, this is not the agent's copy.

create table if not exists public.listing_questions (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings on delete cascade,
  question_id   text not null,
  answer        text not null,
  basis         jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(basis) = 'array' and jsonb_array_length(basis) > 0),
  verify        text,
  form          text not null default 'text',
  decisiveness  smallint not null default 2 check (decisiveness between 1 and 3),
  scope         text not null default 'home'
                  check (scope in ('home', 'street', 'hood', 'city')),
  status        text not null default 'draft'
                  check (status in ('draft', 'approved', 'rejected')),
  model         text,
  generated_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  unique (listing_id, question_id)
);

create index if not exists listing_questions_listing_status_idx
  on public.listing_questions (listing_id, status);

alter table public.listing_questions enable row level security;

-- Buyers (anon) read approved answers for any listing they can already see.
create policy "public reads approved listing questions" on public.listing_questions
  for select using (status = 'approved');

comment on table public.listing_questions is
  'Answers to the move-in question bank (packages/shared/src/questions.ts), one row per listing x question. Written by scripts/admin/generate-move-in-questions.ts as draft; buyers see approved rows only.';
comment on column public.listing_questions.basis is
  'Non-empty array of { type, note, url? } — the answer''s "Based on" line. An answer with no basis is not storable.';
