# Percho — Development Log

> The product was renamed from **Vicinity** to **Percho** on **2026-07-11**.
> Historical entries below preserve the original name in-place — the DEVLOG is
> a record of what was worked on under the product's name at the time.


## Archive

Older entries are split by month so this file stays readable in one
sitting (it had grown to 1.0 MB / 14k lines, which no agent could load).
Same reverse-chronological format, same content.

The current month's entries were condensed once, in phase184, when this file
had reached 861 KB. New entries are written at normal length; compress at
rotation, not on the way in.

- [`docs/devlog/2026-09.md`](docs/devlog/2026-09.md) — 217 entries
- [`docs/devlog/2026-08.md`](docs/devlog/2026-08.md) — 208 entries
- [`docs/devlog/2026-07.md`](docs/devlog/2026-07.md) — 168 entries
- [`docs/devlog/2026-06.md`](docs/devlog/2026-06.md) — 54 entries

---

## 2026-10-18 23:40 UTC — phase307: FMLS IDX disclosures on web and mobile; listings carry the FMLS number

**Objective**: FMLS Data Services (licence thread, 2026-10-12) listed the IDX
rules Percho must show before the licence is approved — 13.7.b the FMLS
listing number with each listing, the 13.7(d)/(e) disclosures, 13.8 the
Technical Entity. On 10-15 they refused "we'll add them at launch": "In order
to be approved, we must see this implemented." Owner picked (e), "only FMLS
IDX content", approved the backfill of the six sandbox rows, "开始做吧".

**Actions**:
- `20261018120000_listings_mls_number.sql`: `listings.mls_number text` plus a
  backfill of the six phase304 Bridge rows by id — five ListingIds from their
  slugs, Fairmount (slug predates the number) = 5893300 from the phase304
  import log. `database.types.ts` hand-edited (`db:types` is stale-local).
  `import-bridge-listings.ts` now writes `mls_number = ListingId`.
- `packages/shared/src/fmls.ts`: FMLS's (e) text verbatim, split around
  "click here"; DMCA URL; Technical Entity statement; `fmlsNumberLabel`.
  Pinned word-for-word by `apps/web/lib/mls/fmls-display-rules.test.ts`.
- Web: `app/_components/FmlsDisclosure.tsx` (results | detail).
  `ListingGrid` — /browse, /nearby, /saved, /search, community listings tab —
  prints "FMLS #…" as a fourth caption line (`GridCardCaption` `sub3`) and puts
  the results disclosure under the grid when any card has a number.
  `CaptionCard` (swipe feed, every `/v/*` page): number on the overlay and in
  More, detail disclosure closing More. Community feed sheet + carousel: number,
  results disclosure in the sheet. `SiteFooter`: Technical Entity line.
- Mobile API: `mlsNumber` on `PoolListingDTO`, `SearchListingDTO`,
  `ListingSummaryDTO`. `ListingDetailDTO.mlsNumber` now comes from
  `listings.mls_number` — it was `mls_listings.listing_key`, Bridge's record
  hash, never the number — plus new `listAgentName` / `listOfficeName`.
- Mobile: number on the feed card face, Saved shelf cards, Search rows,
  Compare headers; Saved / Search / Compare end with the results disclosure;
  the listing screen shows the number and "Listed by agent · office" under the
  address and closes with the detail disclosure; You tab footer carries the
  Technical Entity line. New `components/FmlsDisclosure.tsx`.
- DEVLOG rotated: September's 217 entries → `docs/devlog/2026-09.md`.

**Issues found on the way (fixed)**:
- `feed-load.ts` `buildListingCards` video branch dropped `source`,
  `sourceId`, `office` and `isExternal`. Every Bridge listing has a film, so
  the head card of every `/v/fmls/<key>` page rendered "Listed by Mark
  Stewart ›" as a link to `/a/` (empty slug) with no brokerage. The live HTML
  showed `isExternal:true` on the five tail cards only.
- `/search` sent FMLS hits (no agent slug) to `/browse`; now `linkForCard` →
  `/v/fmls/<key>`.
- `lib/docs/devlog-order.test.ts` read DEVLOG.md alone, so this rotation left
  it one entry and "has entries to check" failed on the merge result. It now
  reads DEVLOG.md plus every archive the index lists, newest first, so the
  month boundary is checked too.

**Decisions**:
- The swipe feed is one listing per screen, so it is treated as a detail view:
  number on the card face, the full detail disclosure in More — not the
  ~250-character results text laid over every card. An interpretation; say so
  in the FMLS reply and change it if they disagree.
- DMCA link: FMLS's email says "false.com/dmca", a broken placeholder;
  https://www.fmls.com/dmca is the live policy page. Ask FMLS to confirm.
- Technical Entity = "Percho, Inc." + hello@percho.co; no mailing address,
  because the contact page publishes none.
- Everything gates on `mlsNumber` being present — only FMLS rows have one.
- Mobile facts row "MLS · FMLS n" kept; until now it never rendered for these
  rows because the mirror is empty for them.
- Release order: the migration merges and is pushed BEFORE the code, because
  `browse-cards.ts` selects `mls_number` and a missing column 500s the feed.

**Not covered (owner call)**:
- Mobile trade-off "door" cards show FMLS listing photos as style imagery with
  no listing identity; the You-tab recent strip shows FMLS homes without the
  number. Whether photos may be used outside their listing at all is a licence
  question, not a label.
- Web fullscreen video mode hides `CaptionCard` (pre-existing), so nothing is
  shown there; OG/Twitter descriptions unchanged.
- `origin/phase306/audit-and-refactor` (12 commits, 2026-10-05, unmerged)
  writes October DEVLOG entries and will conflict with this rotation.

**Verification (branch)**: typecheck 0; lint 0 errors (mobile 8 / web 181
warnings, none new); web 1209 / mobile 809 tests (on the merge result); `next build` compiles and
type-checks (prerender of `/communities` logs "supabaseUrl is required" — no
`.env.local` in this worktree).

**Release**: `4c7a2e3f` (phase307.1, migration only) on main →
`echo | pnpm db:push` from the reference worktree: "Applying migration
20261018120000_listings_mls_number.sql... Finished supabase db push." Then
`2dc582e2` (phase307.2–4) on main; gates re-run on that merge result; reference
worktree fast-forwarded + `pnpm install`, so Metro serves the mobile changes.

**Verification (live, Vercel ~100 s after push)**:
- `/api/mobile/feed?stage=4`: all six listings carry `mlsNumber` — 6755168,
  5303661, 7049147, 6826677, 7404568, 5893300 (Fairmount), each matching its
  slug. `/api/mobile/listing/90871e1e…`: `mlsNumber` 5893300, `listAgentName`
  Mark Stewart, `listOfficeName` FIRST MULTIPLE LISTING SERVICE.
  `/api/mobile/search?q=cookaburra` → 5303661.
- Headless Chrome, 390×844: `/browse` 6 × "FMLS #…", one results disclosure +
  Technical Entity line below the grid (clear of the tab bar at full scroll),
  "click here" → https://www.fmls.com/dmca. `/v/fmls/d9e2c4cd…`: "FMLS
  #5893300" on the overlay; More shows "Listed by Mark Stewart · FIRST
  MULTIPLE LISTING SERVICE" as plain text (0 links to `/a/`) and closes with
  the detail disclosure. `/search?q=lost mountain`: the hit links to
  `/v/fmls/d9e2c4cd…`, number + disclosure present. `/about` footer carries
  the Technical Entity line.
- Mobile not device-checked here — owner's phone (Metro / next build).

**Finding — licence §4.11 / §4.4 (owner call, nothing changed)**: the
phase304 home-tour run put the FMLS sandbox photos through the `tag` step,
which is `scripts/render-worker/photo_tagger.py` — Gemini 2.5 Flash vision.
So FMLS photos went to a third-party AI model, and `listing_photos.ai_tags` /
`listings.ai_style` on those rows are AI output from Licensed Data. The 10-08
reply to FMLS said Licensed Data "will not be shared with any third party or
used with any AI tools". Before the FMLS reply goes out: decide whether to
purge those columns for `fmls_bridge` rows, make the tour pipeline skip the
tagger (and any AI planning) for FMLS listings, and re-cut the six films.

**Next steps**: settle the §4.11 finding first, then the FMLS reply — answer
(e), the URLs to check, the swipe-feed interpretation, the DMCA link, the two
blank contract fields (Authorized Purpose, Vendor System), and the 401 on the
`fmls` test dataset.
