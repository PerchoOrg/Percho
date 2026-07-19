-- community metadata typing pass.
--
-- The 0036 migration introduced free-text fields (`year_built_text`,
-- `hoa_fee_text`, `price_range_text`) for input flexibility. Owner feedback
-- (qiaoxux, 2026-06-22): "year_built — see how it is done in my listing, you
-- should do the same for my community. Be consistent with all inputs."
--
-- Listing schema treats these as typed numerics (`year_built integer`,
-- `hoa integer dollars/month` displayed with `$` + `/month` adornments).
-- For UI parity we replace the `_text` columns with the same shape on
-- `communities`, plus split price into a min/max pair so the editor can
-- render two `$`-adorned number inputs instead of a free-text range.
--
-- 0036 was applied to prod only minutes before this migration and no agent
-- has had time to populate the new columns, so a clean drop+add is safe.
-- The columns being dropped here are the three text fields from 0036; all
-- the other 0036 columns (zip, county, property_types, highlights, builder,
-- website, tagline) stay untouched.

alter table public.communities drop column if exists year_built_text;
alter table public.communities drop column if exists hoa_fee_text;
alter table public.communities drop column if exists price_range_text;

alter table public.communities
  add column if not exists year_built integer,
  add column if not exists hoa_fee_monthly integer,
  add column if not exists price_min integer,
  add column if not exists price_max integer;

-- Year ranges that should never be valid (catch typos before they hit the UI).
alter table public.communities
  add constraint communities_year_built_range_chk
    check (year_built is null or (year_built between 1800 and 2100)) not valid;
alter table public.communities validate constraint communities_year_built_range_chk;

alter table public.communities
  add constraint communities_hoa_fee_monthly_nonneg_chk
    check (hoa_fee_monthly is null or hoa_fee_monthly >= 0) not valid;
alter table public.communities validate constraint communities_hoa_fee_monthly_nonneg_chk;

alter table public.communities
  add constraint communities_price_nonneg_chk
    check (
      (price_min is null or price_min >= 0)
      and (price_max is null or price_max >= 0)
    ) not valid;
alter table public.communities validate constraint communities_price_nonneg_chk;

alter table public.communities
  add constraint communities_price_min_le_max_chk
    check (price_min is null or price_max is null or price_min <= price_max) not valid;
alter table public.communities validate constraint communities_price_min_le_max_chk;
