-- tour_assemblies.bgm — the music the plan step chose.
--
-- The worker used to call pick_bgm() and take a uniform random pick from a
-- folder, which is how the loudest and most dynamic track in the library ended
-- up under the first narrated cut (owner 2026-08-20: "the background music is
-- too big"). The choice now happens in `plan`, beside the shot order and the
-- narration, and travels here so the render uses the reviewed decision rather
-- than rolling again.
--
-- Shape: {"path": "warm-acoustic/ai-warm-porch-light-4f2a.mp3",
--         "title": "Porch Light", "vibe": "warm-acoustic", "role": "bed"}
--
-- Nullable. Null means "worker's choice", which is what every assembly written
-- before this column did, so old rows re-render exactly as they used to.

alter table public.tour_assemblies
  add column if not exists bgm jsonb;

comment on column public.tour_assemblies.bgm is
  'Music chosen by the plan step: {path, title, vibe, role}. Path is relative to the `bgm` storage bucket. Null falls back to the worker picking at random from the approved library.';
