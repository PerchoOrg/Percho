-- ─── cities.profile — the city's fundamentals (phase322) ────────────────────
--
-- Owner 2026-11-15, on the first city film (a reel of places): "看完我对这个城市
-- 没有基本的了解 … 城市卡要侧重基本面 … 历史介绍和数据 便利 教育 发展 规划".
--
-- One sourced document per city: rankings, at-a-glance figures, the city
-- against its state, history, growth, schools, getting around, planning —
-- and the city film's Act 1 data frames and narration, which are drawn from
-- the same facts. Shape and limits live in `apps/web/lib/zod/city-profile.ts`;
-- a row is written only through that schema (scripts/admin/upsert-city-profile.ts).
--
-- No safety or crime figures: owner, same day — "安全数据先不放".

alter table public.cities add column if not exists profile jsonb;
