-- communities.narration_voice — the voice this community's film is read in.
--
-- A pool of five voices has existed since 2026-08-20 and every community got
-- the same one. `voiceForCommunity` tried to pick on character and its FIRST
-- rule was "has an outdoor place → the calm voice"; every community tour
-- visits a park, so that rule won every time and the other four voices, plus
-- the hash fallback behind them, were unreachable code. Aberdeen, Bellmoore
-- Park and Apremont - Highcroft were all read by Aoede (owner 2026-08-23:
-- "voice is same for all videos - we need to have a pool of different voices
-- that we can choose from").
--
-- Automatic selection is fixed separately. This column is the OVERRIDE: the
-- owner's own choice for one community, which no re-run may overwrite.
-- NULL means "pick for me".
--
-- On the community rather than the run, because a narrator that changed
-- between takes would read as a different product — the same reason the
-- automatic pick is seeded rather than random.

alter table public.communities
  add column if not exists narration_voice text;

comment on column public.communities.narration_voice is
  'Gemini TTS prebuilt voice name for this community''s tour narration. NULL = chosen automatically (lib/poi/tour-orchestrator/narration.ts).';
