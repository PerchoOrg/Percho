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

- [`docs/devlog/2026-09.md`](docs/devlog/2026-09.md) — 217 entries
- [`docs/devlog/2026-08.md`](docs/devlog/2026-08.md) — 208 entries
- [`docs/devlog/2026-07.md`](docs/devlog/2026-07.md) — 168 entries
- [`docs/devlog/2026-06.md`](docs/devlog/2026-06.md) — 54 entries

---

## 2026-10-05 15:16 UTC — phase306: repo-wide audit and refactor — an admin self-grant closed, eleven live bugs, 170 `any` casts gone

**Objective**: owner — "Go through the Percho code base and do an audit and
refactoring", then "You have permission to fix and refactored".

**Actions**: five read-only audit agents (API/security, web lib, web app,
mobile + shared, scripts), every finding re-read before acting; knip for dead
code. Ten commits, `a1255e72`…`7052f6a4`:
- 306.1 — September rotated out of `DEVLOG.md` (572 KB, 217 entries) into
  `docs/devlog/2026-09.md`, byte-identical. `devlog-order.test.ts` now reads
  the archives too; it failed on the rotation itself.
- 306.2 — security. Migration `20261005000000_tighten_admin_flag_and_anon_writes`
  (only removes capability): a trigger stops anon/authenticated changing
  `agents.is_admin`; communities DELETE/UPDATE scoped `to authenticated`; the
  anon `leads` INSERT policy dropped. Code: POI server actions no longer
  forward a client `actor` or Places options; waitlist page requires admin;
  `admin-nearby-photos` is not a server action; `safeRedirectPath`; CSV
  formula guard on the leads export.
- 306.3 — seedance worker off `dotenv`, never re-submits a paid clip; bgm
  sync fails closed; two maintenance scripts' `.env.local` path.
- 306.4 — deleted what the monorepo merge resurrected: five AI routes,
  `lib/ai/gemini.ts`, `social-cache.ts`, `lib/log.ts`; plus the broken
  `generate-nearby` route + `scripts/pipelines/`, phase212 scratch files.
- 306.5 / 306.6 — eleven live bugs (below); `createClient()` returns
  `TypedClient`, 170 `noExplicitAny` suppressions removed (205 → 35, the rest
  are dynamic table names and test fakes).
- 306.7 — `attachHls` (4 copies), uncached clients (6), haversine (3).
- 306.8 — mobile: event-queue hot loop, identity-based drain, poison chunks,
  set-password timer.
- 306.9 / 306.10 — `relink-listings` paging, Gemini key as a header;
  ARCHITECTURE.md rows for five undocumented lib folders and the scripts
  drift; `.env.example` drops `ANTHROPIC_*`.

**Findings — security** (verified against the migrations, not production):
1. **Any signup could make itself admin.** "agent updates own profile" has
   no column list, `is_admin` was added later unguarded, and every signup —
   every app user — gets an `agents` row. One PostgREST PATCH with the anon
   key, and `requireAdmin()` reads the column back.
2. **Anonymous DELETE of unclaimed communities** — the `created_by is null`
   branch had no `to` clause; cascades take videos, tours, leads.
3. `fetchPhotosForCommunityPoi` accepted `{ actor: 'service' }` from the
   browser and ran on the service role with no session.
4. `/dashboard/agents/waitlist` showed every waitlist name/email/phone/licence
   to any signed-in user; `?redirect=/\evil.com` passed the login guard.

**Findings — live bugs the `as any` casts hid**:
- `community_photos.poi_id` / `community_videos.poi_id` were dropped on
  2026-07-14 and still named in five places: community photo upload and
  list, **community video upload** (`/api/video/create-upload` — failed after
  reserving the Cloudflare slot), `/api/video/list?community_id`, and the
  browse/listing-page community-video reads (Nearby pool always empty).
- Dashboard fallback covers ordered by a column `ord` that never existed.
- 23,773 active communities behind one 1000-row read: `/communities`,
  `/search` and `/api/communities/nearby` saw only the front of the
  alphabet. Relevant ones are now fetched explicitly; search runs `ilike`.
- Stub communities named "Untitled neighborhood" since phase66; every gate
  checked "Untitled community".
- The listing editor's publish flusher was registered once at mount and
  saved the mount-time form over the agent's edits.
- `startAsyncTransition` dropped the promise; the bundled React canary has
  `enableAsyncActions = true`, so `isPending` now covers the work.
- `cleanup/refs.ts` read six tables unpaged — a short read would have
  offered live videos for deletion.
- Seedance: a crash after the paid submit put the row back to `pending`.

**Decisions**:
- Typed the ssr client with ONE assertion in `server.ts` rather than
  bumping `@supabase/ssr` 0.5.2 → 0.12.7: no runtime change on the auth path.
  This was decision 4 of phase252, deferred in phase184; the owner's
  "permission to fix" this round is what it was waiting on.
- A select naming a missing column does not fail `tsc` (it types as
  `SelectQueryError`), so every select string in apps/ and scripts/ was
  checked against `database.types.ts` by script: none left.
- Seedance stale rows FAIL with "check OpenRouter before regenerating"
  rather than retrying — the never-auto-regenerate rule.
- Not done, owner's call: ZIP on mobile cards (the server never sent it; the
  card would read "· 30144"); hiding agents' own untitled stubs on the
  dashboard; scope sheet / area cards (unreachable since 09-09).

**Issues**: the harness classifier refused the first deletion batch, then
`git status`, reads and formatting until the owner granted permission.

**Verification**: typecheck 0; lint 0 errors (web 179 warnings, was 181;
mobile 5, was 8); web 1206 + mobile 812 tests (+12 new); render-worker
pytest 129.

**Next steps**:
- **Owner: merge, then `pnpm db:push`** — the admin self-grant stays open
  until the migration is applied. Then `select email from agents where
  is_admin` in production to see whether anyone used it.
- Restart `com.percho.seedance-worker` after merge — it is the Aug 30 process
  and still has the removed `dotenv` loaded in memory.
- Still open: `agents` is publicly readable (every app user's email);
  community_pois / generated_videos writes open to any signed-in user;
  `notify-lead` never emails for community leads; `/api/leads` unrate-limited;
  render-worker `generate.py` has no subprocess timeout; CI runs neither
  `scripts/` typecheck nor the Python tests; ~100 hand-written row types.
