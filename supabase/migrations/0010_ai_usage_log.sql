-- ─── 0010_ai_usage_log ─────────────────────────────────────────────
-- Per-agent rate-limit ledger for AI copy generation.
--
-- Why a table (vs Redis/in-memory):
--   * V1 stack is locked to Supabase Postgres + Vercel — no Redis dep.
--   * Vercel serverless instances don't share memory; in-process counters
--     leak across cold starts. A row-level ledger is the simplest correct
--     answer at our volume (~10s of generations/day during internal beta).
-- * Bonus: persisted history doubles as a cost-audit trail. + can
--     query "tokens billed per agent per month" without new infra.
--
-- The route handler queries last-minute count(*) per (agent_id, kind),
-- rejects when >= 10. Index is tuned for that exact query.
--
-- RLS: agent reads own rows (transparency); inserts go through the route
-- handler with service role (the rate-limit decision is a trust boundary,
-- not something we want clients writing directly).

create table public.ai_usage_log (
  id          bigserial primary key,
  agent_id    uuid not null references public.agents on delete cascade,
  kind        text not null check (kind in ('listing_copy', 'social_copy')),
  created_at  timestamptz not null default now()
);

-- Supports `where agent_id = ? and kind = ? and created_at > now() - interval '1 minute'`.
create index ai_usage_log_agent_kind_idx
  on public.ai_usage_log (agent_id, kind, created_at desc);

alter table public.ai_usage_log enable row level security;

create policy "agent reads own ai usage" on public.ai_usage_log
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
-- No insert/update/delete policies for anon/authenticated — service role only.
