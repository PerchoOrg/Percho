-- ─── communities.profile — what the explore page says (phase339) ────────────
--
-- Owner 2026-11-15, on the community explore page: "要有信息量 要有real insights
-- 不要太多文字 多一点图表 … 可以有一些ranking … 也可以加一些events", then on the
-- eight-section draft: "太长了 没人会看这么多".
--
-- One researched document per community, the way `cities.profile` is one per
-- city: six verdict lines, where it ranks, home value, what the dues cover,
-- the words its residents use, what is coming up, and its links — every figure
-- with its source. Shape and limits live in
-- `apps/web/lib/zod/community-profile.ts`; a row is written only through that
-- schema (scripts/admin/upsert-community-profile.ts).
--
-- Nullable, and null on every row but the ones written by hand: a community
-- without a profile keeps the page it has.
--
-- No income, safety or crime field — the rule `communities.avg_income` and
-- `cities.profile` already follow.

alter table public.communities add column if not exists profile jsonb;
