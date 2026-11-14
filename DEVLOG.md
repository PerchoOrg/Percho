# Percho — Development Log

> The product was renamed from **Vicinity** to **Percho** on **2026-07-11**.
> Historical entries below preserve the original name in-place — the DEVLOG is
> a record of what was worked on under the product's name at the time.


## Archive

Older entries are split by month so this file stays readable in one
sitting (it had grown to 1.0 MB / 14k lines, which no agent could load).
Same reverse-chronological format, same content.

The 2026-09 entries were condensed once, in phase184, when this file had
reached 861 KB. New entries are written at normal length; compress at
rotation, not on the way in.

- [`docs/devlog/2026-10.md`](docs/devlog/2026-10.md) — 10 entries
- [`docs/devlog/2026-09.md`](docs/devlog/2026-09.md) — 217 entries
- [`docs/devlog/2026-08.md`](docs/devlog/2026-08.md) — 208 entries
- [`docs/devlog/2026-07.md`](docs/devlog/2026-07.md) — 168 entries
- [`docs/devlog/2026-06.md`](docs/devlog/2026-06.md) — 54 entries

---

## 2026-11-14 09:20 UTC — phase309: /communities threw on a statement timeout

**Objective**: Owner opened https://www.percho.co/communities and got "Application error: a server-side exception has occurred", digest 1774318519.
**Actions**: Signed the Vercel CLI in (device login, owner approved) and searched production logs. Seven days held exactly two errors, both `GET /communities` at 08:57:52 and 08:58:10 UTC, both digest 1774318519: PostgREST `57014 canceling statement due to statement timeout`, thrown raw by `if (head.error) throw head.error` in `fetchActiveCommunitiesImpl` (`lib/communities/list.ts`). Added `supabase/migrations/20261114090000_communities_active_name_idx.sql` — partial index `communities (name) where status = 'active'`.
**Decisions**: The head read is `status = active, name not in stubs, order by name limit 1000` over ~22.7k active rows with no index on either column, so every request scans and sorts the table. Warm it takes ~150 ms; cold or under load it crossed the anon statement_timeout. The index lets the sort walk the index. Kept the throw — it exists so `unstable_cache` never holds an empty grid.
**Issues**: Could not reproduce afterwards — 21 curl requests and two headless-Chrome loads (direct + client nav from /browse) all returned 200 with 1000 cards. The page is 14 MB of HTML (7 MB RSC), ~6 MB of it logo-SVG data URLs for 691 boundary-only cards; the card set is over `unstable_cache`'s 2 MB limit, so the 60 s cache never stores and every hit re-queries the DB.
**Resolution**: Index migration; needs `pnpm db:push` after merge.
**Learnings**: `vercel logs --environment production --query <digest> --since 24h` finds a Next.js digest directly. `vercel link` writes the project's env into a `.env.local` in the linked dir — delete it.
**Next steps**: Separate task — shrink the grid payload (logo SVGs) so it fits the data cache and the page is not 14 MB.

