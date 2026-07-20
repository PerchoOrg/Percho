-- backfill ON DELETE CASCADE on leads.community_id.
--
-- Bug: deleting a community that had ever received a community-scoped lead
-- (via /c/[slug]/feed Contact) raised a check-constraint violation:
--
--     23514  new row for relation "leads" violates check constraint "leads_target_chk"
--
-- Root cause: migration 0029_leads_community.sql declared
--   leads.community_id  references communities on delete set null
-- but leads_target_chk requires exactly one of (listing_id, community_id)
-- to be non-null. Cascading a community delete → set community_id null →
-- both target columns null → check violates → whole tx rolls back → user
-- cannot delete the community.
--
-- (migration 0041) already fixed the mirror case for
-- leads.listing_id. This is the last missing cascade — every other
-- child-of-community FK (community_photos, community_videos, saved_communities,
-- favorites, events, saved_social_drafts, community_video_extra_links) is
-- already `on delete cascade`. leads.community_id was the only oversight.
--
-- Product semantics: a lead is about a specific community. If the community
-- is gone, the lead has no target (buyer messaged about an entity that no
-- longer exists). Cascade-delete matches the rest of the schema and matches
-- what the DangerZone copy on the community edit page promises.

alter table public.leads
  drop constraint leads_community_id_fkey;

alter table public.leads
  add constraint leads_community_id_fkey
    foreign key (community_id)
    references public.communities(id)
    on delete cascade;
