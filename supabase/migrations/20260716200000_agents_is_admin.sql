-- admin flag for platform-ops surfaces.
--
-- Adds a simple boolean role bit to `agents`. Anyone with is_admin=true can
-- reach /admin/* and drive the automated photo/video pipeline (nearby POI
-- triage, bucket-video queue, POI library audit, worker health).
--
-- We deliberately avoid a full roles table for now — a single boolean covers
-- every current need and matches how the auth surface already keys off user_id.

alter table public.agents
  add column if not exists is_admin boolean not null default false;

-- Non-privileged clients can still read their own row via existing RLS.
-- No new policy needed: the admin check happens server-side using the
-- service-role client (see `lib/auth/require-admin.ts`).
comment on column public.agents.is_admin is
  'When true, this agent can access /admin/* platform-ops pages.';

-- Bootstrap note (run manually once):
--   update public.agents set is_admin = true where email = '<your-email>';
