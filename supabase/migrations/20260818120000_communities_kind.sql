-- Communities come in two kinds (owner decision 2026-08-18, phase55):
--   'neighborhood' — informal areas seeded from Nextdoor; no legal boundary.
--   'subdivision'  — builder / master-planned / gated / HOA communities with
--                    clear, verifiable boundaries; the curated content level.
alter table public.communities
  add column kind text not null default 'neighborhood'
    check (kind in ('neighborhood', 'subdivision'));

-- Aberdeen (Suwanee, GA) is the first subdivision. Matched by id because the
-- bare 'aberdeen' slug belongs to an unrelated Nextdoor neighborhood in
-- Stone Mountain. No-op on databases that don't have this row.
update public.communities
  set kind = 'subdivision'
  where id = 'cc9fc1da-0597-42ed-b71d-5b96b7965303';
