-- render_jobs queue for agent-generated home tour
-- videos. C2 architecture: EC2 render worker polls this table, generates
-- Ken Burns MP4 from listing photos, uploads to Cloudflare Stream, and
-- updates the linked `listing_videos` row. Trigger is manual (button on
-- the listing edit page). Client never writes to this table — the
-- `/generate-tour` API route inserts (via server-side createClient which
-- bypasses RLS through the authenticated agent's own listing ownership
-- check), and the worker uses the service role.

create table public.render_jobs (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  video_row_id  uuid not null references public.listing_videos(id) on delete cascade,
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'done', 'failed')),
  error         text,
  attempts      int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index render_jobs_status_created_idx
  on public.render_jobs (status, created_at);

create index render_jobs_listing_idx
  on public.render_jobs (listing_id);

create trigger render_jobs_touch before update on public.render_jobs
  for each row execute function public.touch_updated_at();

alter table public.render_jobs enable row level security;

-- Agents can SELECT their own jobs (via listing → agent chain). No client
-- insert/update/delete — the API route uses server-side supabase client
-- (still RLS-bound; see insert policy below), and the worker uses the
-- service role which bypasses RLS.
create policy "agent reads own render jobs" on public.render_jobs
  for select using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Allow the owning agent to INSERT a job for their own listing (the
-- generate-tour API route runs as the authenticated agent).
create policy "agent inserts own render jobs" on public.render_jobs
  for insert with check (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );
