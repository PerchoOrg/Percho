-- KW Atlanta meetup 2026-07 — public agent waitlist landing page
--
-- Public /agents landing page collects email/phone from agents scanning a
-- QR code at the meetup. Inserts happen via the service-role key from the
-- POST /api/agents/waitlist route handler; there are no public policies.

create table if not exists public.agent_waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text not null,
  brokerage text not null,
  license_number text,
  mls_association text not null,
  source text not null default 'kw-atlanta-meetup-2026-07',
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists agent_waitlist_signups_created_at_idx
  on public.agent_waitlist_signups (created_at desc);

create index if not exists agent_waitlist_signups_email_idx
  on public.agent_waitlist_signups (email);

alter table public.agent_waitlist_signups enable row level security;

-- No public policies. Server-only inserts via service-role client.
