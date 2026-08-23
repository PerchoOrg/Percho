-- listing_tour_runs: allow status 'abandoned' (2026-08-23).
--
-- A run that stops mid-pipeline is indistinguishable from one still working:
-- `status` has no timeout and nothing reaps it. Two such runs sat in the admin
-- index as the newest attempt on homes that already had finished films, which
-- is what pushed the Stage column to report the furthest run rather than the
-- newest (phase96).
--
-- Marking rather than deleting, by owner decision 2026-08-23: `step_results`
-- holds the plan that run produced, and dropping the row would mean re-running
-- plan to get it back.
--
-- The original constraint was declared inline, so its name is whatever
-- Postgres generated. Look it up rather than guessing: dropping the wrong name
-- silently leaves the old check in place and every 'abandoned' write keeps
-- failing.
do $$
declare cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.listing_tour_runs'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.listing_tour_runs drop constraint %I', cname);
  end if;
end $$;

alter table public.listing_tour_runs
  add constraint listing_tour_runs_status_check
  check (status in (
    'tagging','review','planning','generating',
    'assembling','ready','failed','abandoned'
  ));
