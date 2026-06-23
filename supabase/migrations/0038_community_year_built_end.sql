-- Phase 50.6 (2026-06-22): year_built_end for phased-delivery communities.
--
-- Owner feedback after 50.5: "range makes sense for some fields in a
-- community, I agree, but make them easy to use, less friction as possible."
-- Translation: agents shouldn't be forced to drop community age into the
-- description because the schema only takes one int. NoVA / metro Atlanta
-- new-builds routinely deliver in phases (e.g. 2019–2024).
--
-- Friction-minimization: end year is opt-in in the UI (collapsed behind
-- a "+ Add end year" button), so 80% of communities still fill in one box.
-- The DB column is nullable to match.

alter table public.communities
  add column if not exists year_built_end integer;

alter table public.communities
  add constraint communities_year_built_end_range_chk
    check (year_built_end is null or (year_built_end between 1800 and 2100)) not valid;
alter table public.communities validate constraint communities_year_built_end_range_chk;

-- end year, when present, must be >= start year. NULLs on either side
-- mean "no constraint" — the agent only filled in the one they care about.
alter table public.communities
  add constraint communities_year_built_end_ge_start_chk
    check (
      year_built_end is null
      or year_built is null
      or year_built_end >= year_built
    ) not valid;
alter table public.communities validate constraint communities_year_built_end_ge_start_chk;
