-- backfill ON DELETE CASCADE on leads.listing_id.
--
-- Bug: deleting a listing that had ever received a lead raised a FK
-- violation (server-side exception, digest 881108286) because the
-- original 0001_init.sql declared `leads.listing_id` as a plain FK
-- without `on delete cascade`. Every other listing-child table
-- (listing_videos, listing_photos, photos, events, favorites,
-- saved_listings, saved_social_drafts) was already cascade-deleted —
-- leads was the only oversight.
--
-- Product semantics: leads belong to a listing. If the listing is
-- gone, the lead has no upstream context (buyer is messaging about
-- an entity that no longer exists). Cascade-delete matches the rest
-- of the schema and matches what the DangerZone copy on the edit
-- page already promises ("Videos, photos, leads and analytics will
-- be removed").

alter table public.leads
  drop constraint leads_listing_id_fkey;

alter table public.leads
  add constraint leads_listing_id_fkey
    foreign key (listing_id)
    references public.listings(id)
    on delete cascade;
