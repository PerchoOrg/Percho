-- enable Realtime broadcasts on video tables.
--
-- Cloudflare Stream webhook flips listing_videos.status processing → ready.
-- Subscribers (currently /dashboard/upload-test, later the agent dashboard
-- and the feed builder) listen on the supabase_realtime publication
-- to render that transition without a page refresh.
--
-- RLS still applies to Realtime — clients only see UPDATE events for rows
-- their RLS policies permit them to SELECT.

alter publication supabase_realtime add table public.listing_videos;
alter publication supabase_realtime add table public.community_videos;
