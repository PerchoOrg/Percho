-- research_responses — answers to the customer-study questionnaires (phase135).
--
-- One row per submitted questionnaire. `answers` is the raw answer object
-- keyed by question id (q1_area, q3_sources, q7_video …) exactly as the form
-- posted it, so a study's shape can change without a migration; `study`
-- names the questionnaire version the row belongs to.
--
-- Anonymous buyers submit these, so the ONE policy is an insert for `anon`.
-- There is deliberately no select policy: reads go through the admin export
-- route with the service role. Nothing here is PII except the optional
-- `contact` (a WeChat name or phone the respondent gives to receive the
-- thank-you red packet), which is why the export is admin-gated.

create table if not exists public.research_responses (
  id           uuid primary key default gen_random_uuid(),
  study        text not null check (char_length(study) between 1 and 64),
  lang         text not null default 'zh' check (lang in ('zh', 'en')),
  answers      jsonb not null check (jsonb_typeof(answers) = 'object'),
  contact      text check (contact is null or char_length(contact) <= 120),
  duration_ms  integer check (duration_ms is null or duration_ms >= 0),
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists research_responses_study_created_idx
  on public.research_responses (study, created_at desc);

alter table public.research_responses enable row level security;

create policy "anyone can submit a questionnaire"
  on public.research_responses
  for insert
  to anon
  with check (true);
