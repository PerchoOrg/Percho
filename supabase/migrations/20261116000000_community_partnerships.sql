-- ─── Community partner billing (phase341) ────────────────────────────────
--
-- Owner 2026-11-15: "实现收费的后端功能 暂时不在app里显示". What is sold is the
-- Community Partner plan: an agent pays monthly to hold one of a community's
-- partner seats. Payment runs through Stripe Checkout; Stripe's webhook is the
-- only writer of a partnership's status. Nothing in the dashboard or the iOS
-- app reads these tables yet.
--
-- Both tables are readable by the agent they belong to and writable only by
-- the service role (the checkout route after it has authenticated the agent,
-- and the Stripe webhook after it has verified the signature). There are no
-- insert/update/delete policies on purpose.

-- One Stripe customer per agent.
create table public.billing_customers (
  agent_id           uuid primary key references public.agents on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
create policy "agent reads own billing customer" on public.billing_customers
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- One row per purchase attempt of a community seat.
--   pending  — checkout opened; the seat is held until hold_expires_at
--   active   — paid
--   past_due — a renewal failed; Stripe is retrying, the seat stays held
--   canceled — the subscription ended
--   expired  — checkout was abandoned; the seat was released
create table public.community_partnerships (
  id                     uuid primary key default gen_random_uuid(),
  agent_id               uuid not null references public.agents on delete cascade,
  community_id           uuid not null references public.communities on delete cascade,
  status                 text not null default 'pending'
                           check (status in ('pending', 'active', 'past_due', 'canceled', 'expired')),
  hold_expires_at        timestamptz,
  stripe_checkout_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  -- `created` of the last Stripe event applied. Stripe retries and reorders
  -- deliveries; an event older than this one is ignored, so a late
  -- "updated: active" can never undo a "deleted".
  last_event_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger community_partnerships_touch before update on public.community_partnerships
  for each row execute function public.touch_updated_at();

create index community_partnerships_community_idx
  on public.community_partnerships (community_id) where status in ('pending', 'active', 'past_due');
-- An agent holds at most one live seat per community.
create unique index community_partnerships_one_live_per_agent
  on public.community_partnerships (agent_id, community_id)
  where status in ('pending', 'active', 'past_due');

alter table public.community_partnerships enable row level security;
create policy "agent reads own partnerships" on public.community_partnerships
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- Hold a seat, or say why not. Serialised per community with an advisory lock
-- so two agents checking out at once cannot both take the last seat. Expired
-- holds are released first. Returns the new pending row's id and reason 'ok',
-- the agent's existing pending row and 'pending', or a null id and 'full' /
-- 'already_partner'.
create or replace function public.claim_partner_seat(
  p_agent_id uuid,
  p_community_id uuid,
  p_seats int,
  p_hold_until timestamptz
) returns table (partnership_id uuid, reason text)
language plpgsql
as $$
declare
  v_taken int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('partner_seat:' || p_community_id::text));

  update public.community_partnerships
     set status = 'expired'
   where community_id = p_community_id
     and status = 'pending'
     and hold_expires_at < now();

  -- The agent's own open checkout comes back as 'pending', so a second click
  -- resumes that checkout instead of holding a second seat.
  select id into v_id
    from public.community_partnerships
   where community_id = p_community_id
     and agent_id = p_agent_id
     and status = 'pending';
  if v_id is not null then
    return query select v_id, 'pending'::text;
    return;
  end if;

  if exists (
    select 1 from public.community_partnerships
     where community_id = p_community_id
       and agent_id = p_agent_id
       and status in ('active', 'past_due')
  ) then
    return query select null::uuid, 'already_partner'::text;
    return;
  end if;

  select count(*) into v_taken
    from public.community_partnerships
   where community_id = p_community_id
     and status in ('pending', 'active', 'past_due');

  if v_taken >= p_seats then
    return query select null::uuid, 'full'::text;
    return;
  end if;

  insert into public.community_partnerships (agent_id, community_id, status, hold_expires_at)
  values (p_agent_id, p_community_id, 'pending', p_hold_until)
  returning id into v_id;

  return query select v_id, 'ok'::text;
end;
$$;

-- Functions are executable by PUBLIC by default; this one is for the service
-- role only — a browser must not be able to hold seats.
revoke execute on function public.claim_partner_seat(uuid, uuid, int, timestamptz)
  from public, anon, authenticated;
