-- Persist per-listing-photo AI vision tags.
--
-- The render worker's photo_tagger already runs Claude Sonnet 4.5 on every
-- listing photo before the shot planner picks clips, but the result
-- was previously thrown away after the render (only written to a temp
-- shot_plan.json in the job workdir). Every subsequent render re-billed the
-- same photos.
--
-- This migration mirrors what poi_photos already does (see
-- 20260714000000_poi_content_pipeline.sql lines 122-126 + tagger):
-- one jsonb column for the structured labels, plus quality score, model
-- name, and a tagged_at sentinel for idempotency.
--
-- ai_tags shape (populated by scripts/render-worker/photo_tagger.py):
--   {
--     caption:        "Bright kitchen with marble island and open floor plan",
--     room_type:      "kitchen",
--     is_master:      false,
--     subject_label:  "island" | null,
--     subject_bbox:   [x, y, w, h],       -- normalized 0..1, top-left origin
--     orientation_hint: "wide" | "tall" | "square",
--     time_of_day:   "day" | "dusk" | "night" | "indoor_neutral",
--     style_signals: ["marble", "open_plan", ...],
--     quality:       0.0-1.0,             -- photographic quality
--     hero_score:    0.0-1.0,             -- opening/closing potential
--     usable:        true|false,
--     notes:         "short factual"
--   }
--
-- ai_score = quality * hero_score, kept as a top-level numeric for cheap
-- ordering ("show me best photos first") without a jsonb path expression.
-- No GIN index — listing_photos queries always filter by listing_id first
-- and per-listing photo counts are small (<30 typical).

alter table public.listing_photos
  add column if not exists ai_tags   jsonb,
  add column if not exists ai_score  numeric(3,2),
  add column if not exists ai_model  text,
  add column if not exists tagged_at timestamptz;

comment on column public.listing_photos.ai_tags is
  'Claude Sonnet 4.5 vision labels: caption, room_type, style_signals, hero_score, subject_bbox, etc. Populated by scripts/render-worker/photo_tagger.py on the first video render and reused thereafter (tagged_at IS NOT NULL = already labeled, skip re-billing).';
comment on column public.listing_photos.tagged_at is
  'Idempotency sentinel. Non-null means ai_tags is populated and the tagger should skip this row on subsequent runs. Null means "needs tagging".';

-- Listing-level style aggregation. The tagger runs a second Claude call on
-- the top-6 hero photos to classify the listing's overall style
-- (luxury|modern|traditional|cozy|rural) which the shot planner consumes.
-- Cache it here so a re-render of a fully-tagged listing does zero vision
-- calls. Shape mirrors what photo_tagger.STYLE_SYSTEM returns:
--   {"style": "modern", "confidence": 0.82, "reason": "…"}
alter table public.listings
  add column if not exists ai_style jsonb;

