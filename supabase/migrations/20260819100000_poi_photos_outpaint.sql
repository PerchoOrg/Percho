-- Outpainting: turn a landscape photo into a 9:16 one instead of cropping it.
--
-- A community tour renders 1080x1920. Measured across Aberdeen's 29 shots, the
-- centre crop was throwing away a median 63% of the frame — on the clubhouse
-- photo it cut out the stone tower and left a tree as the subject. Resolution
-- was never the problem (median source is 4000x3024); the aspect ratio was.
--
-- Mirrors the `enhanced_*` columns deliberately: same lifecycle, same review
-- vocabulary, and the render already knows how to prefer a derived file over
-- the original. The two stack — outpaint first to fix the framing, then
-- Real-ESRGAN to reach the canvas, since the model returns 768x1376.
--
-- 'skipped' is a real outcome, not a failure: a photo already close to 9:16
-- has nothing to gain and is left alone (owner 2026-08-19: "unless the
-- original photo is in a good shape already").

alter table public.poi_photos
  add column outpainted_path text,
  add column outpaint_status text not null default 'none'
    check (outpaint_status in ('none','queued','processing','ready','skipped','failed')),
  add column outpaint_meta jsonb,
  add column outpaint_error text,
  add column outpainted_at timestamptz;

-- The worker claims queued rows the same way it claims enhance jobs.
create index poi_photos_outpaint_queue_idx
  on public.poi_photos (outpaint_status)
  where outpaint_status = 'queued';
