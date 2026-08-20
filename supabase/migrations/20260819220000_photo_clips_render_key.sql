-- photo_clips.render_key — the render inputs a clip's FILE was produced from.
--
-- A clip is a function of more than its photo: the canvas, the engine, the
-- camera move and the duration all change the pixels. Staleness was detected by
-- comparing the clip's updated_at against the photo's outpainted_at/enhanced_at,
-- which sees photo edits and nothing else. Three plan-only changes shipped
-- undetected on 2026-08-19 — the canvas going 1080x1920 -> 1080x1576, the render
-- read-path preferring originals over reframes, and the moves shifting toward
-- orbit. Each time `generate` reported "0 requeued" and the film came out
-- unchanged, and each time the clips had to be requeued by hand.
--
-- Nullable with no backfill: an existing row has an unknown key, which the
-- comparison treats as "does not match", so every clip re-renders once on the
-- next generate and is correct from then on. That is the intended migration
-- path — the re-render is local and free for Ken Burns and DepthFlow, and
-- Seedance is exempt from automatic re-render entirely (see generate.ts).

alter table public.photo_clips
  add column if not exists render_key text;

comment on column public.photo_clips.render_key is
  'Fingerprint of the inputs this clip was rendered from (canvas, engine, move, duration, photo version). Mismatch => re-render. Seedance rows are never auto-requeued.';
