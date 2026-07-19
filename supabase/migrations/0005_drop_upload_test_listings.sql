-- cleanup — drop the upload-test seed listings.
--
-- created one listing per agent with slug='__upload_test__' so the
-- agent could exercise the video uploader on a real row before the listing
-- CRUD UI existed. makes that obsolete: agents now create real
-- listings via /dashboard/listings/new.
--
-- This deletes:
--   - all listings with slug='__upload_test__'
--   - their listing_videos (cascades via fk on listing_videos.listing_id)
--
-- Cloudflare Stream assets uploaded against these listings become orphans;
-- a reconcile job (out of V1 scope) will sweep them later. No code path
-- ever served these videos publicly, so no public URL breaks.

delete from public.listings where slug = '__upload_test__';
