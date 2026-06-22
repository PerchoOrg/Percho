# Vicinity — Development Log

Institutional memory for the project. Updated incrementally, not at session end.

## Phase 49 — Leads + Analytics tab redesign (2026-06-22)

**Objective**: qiaoxux: drop the count from the Leads tab, redesign the
Leads and Analytics panels to be more concise and focused. Picked
**Leads B** (left status bar) + **Analytics A** (3 KPIs + funnel) from
prototype `/prototype/leads-analytics-redesign.html`.

**Changes**:
- `app/dashboard/listings/[id]/edit/page.tsx`:
  - Tab label hardcoded to `Leads` (was `Leads · ${openLeads}`).
  - Removed the open-leads SSR fetch that fed the badge — no consumer
    left, kills one Supabase round-trip per page load.
- `ListingLeadsPanel.tsx` — Leads B redesign:
  - Sage left bar (`#6b7a5a`) marks awaiting-follow-up rows; line-color
    bar marks followed-up. Replaces the "New" pill so status is readable
    at a glance without a chip.
  - Email + phone collapsed to one muted meta line.
  - `source` column dropped (agent already knows where they shared).
  - Message `line-clamp` reduced 2 → 1.
  - Section header still carries `N total · M awaiting follow-up`.
  - Sage color is inline (no Tailwind token — Vicinity has no `accent`
    that isn't aliased to ink).
- `AnalyticsPanel.tsx` — Analytics A redesign:
  - Six headline KPIs (Page views, Unique sessions, Card views, Video
    completes, Leads, Conv. %) collapsed to three: **Views · Leads ·
    Conv. %**. Conv. % is **hidden when leads = 0** (per owner: don't
    show a 0% number that's just "no data" — Leads card already says).
  - Grid auto-switches `grid-cols-3` ↔ `grid-cols-2` based on Conv. %
    visibility.
  - Top-cards section dropped (rarely actioned at the listing-agent
    level; still computable from `getListingStats` if a global rollup
    wants it later).
  - Engagement funnel kept verbatim — it's the one number set Vivian
    actually digs into.
  - Funnel header subtitle changed `% relative to N page views` →
    `% of step before` to match what the right column actually computes.

**Verification**:
- Prototype reviewed at `https://www.vicinities.cc/prototype/leads-analytics-redesign.html`.
  Owner picked Leads B + Analytics A explicitly with the
  hide-Conv%-when-leads=0 caveat.
- `npx tsc --noEmit` clean.
- `npx next build` clean.

**Decisions**:
- Sage color inlined as a single hex constant rather than adding a
  token. Single-purpose, single file. Tailwind JIT only emits classes
  that exist, and there's no broader theme need yet.
- Kept the "Conv. % hidden when leads=0" logic in the panel rather
  than a `lib/analytics/listing-stats.ts` shape change. The stat library
  still returns the full ListingStats; only the UI elides the card.
  This keeps `getRollupStats` (dashboard rollup) unchanged.

**Next steps**:
- Watch for owner pushback on the dropped Top cards / Unique sessions /
  Video completes / Card views KPIs. They're still present in
  `ListingStats`; we can resurface any of them as a secondary panel
  if Vivian asks.

## Phase 48.6 — Quiet cache + default heading (2026-06-22)

**Objective**: qiaoxux 48.5 follow-up. Two trims:
1. The green "cached" pill on the output card was ops/internal info
   leaking into agent UX — agents don't care whether we called Claude
   or returned a saved draft, only that the right text is in the box.
2. Saved-draft rows without a custom title showed empty heading +
   "Title" CTA, which read as a missing field instead of an optional
   one. Default the heading to `Platform · Language` and drop the
   redundant lower meta line.

**Changes**:
- `SocialCopyPanel`:
  - Removed the `outputCached` state, the green pill, and the cached
    detection in the response handler. Server still returns
    `cached: true` (kept for telemetry/debug); UI just ignores it.
  - `DraftRow` heading is now always rendered. Falls back to
    `Platform · Language` (e.g. "Facebook · English") when no custom
    title is set — styled `text-ink2` to telegraph "auto" — and
    bumps to `text-ink font-medium` once renamed.
  - Dropped the secondary platform + language pills below the
    heading; they were duplicate info now that the heading carries
    them by default.
  - Single button label: **Rename** (was conditionally "Title" /
    "Rename" depending on whether a custom title existed).
- API and DB unchanged — `cached` flag still set, `title` column
  still nullable, semantics intact.

## Phase 48.5 — Social drafts: cache + rename + tour-panel polish (2026-06-22)

**Objective**: qiaoxux follow-up on 48.4.
1. Tour panel teaser was ambiguous — needed "— coming soon." appended
   so agents know the disabled button isn't a bug.
2. Re-clicking Generate with identical inputs was hitting Claude every
   time, burning tokens for a result we already had on disk as a saved
   draft.
3. Saved drafts list quickly accumulated rows that were
   indistinguishable at a glance ("Facebook · English · 6/22 7:42 PM" ×
   12). Needed user-supplied titles for triage.

**Changes**:
- `GenerateTourPanel`: blurb extended to "Turn 10 listing photos into a
  30-second home tour video — coming soon."
- `lib/ai/social-cache.ts` (new): server-side input fingerprint.
  `socialDraftHash({platform, language, highlights})` normalizes
  highlights (trim → lowercase → dedupe → sort) then sha256 of the
  JSON payload. Server-only — clients never compute or send the hash,
  so a malicious client can't poison or flush the cache.
- `app/api/generate-social/route.ts`: before charging the rate limit
  and calling Claude, check `saved_social_drafts` for a row with
  matching `(listing_id, input_hash)`. Hit → return that body with
  `cached: true`. Skipped on refine (`previous_drafts` present) and on
  multi-cell calls (forward-compat, nobody uses it today).
- `app/api/listings/[id]/social-drafts/route.ts`:
  - POST stamps `input_hash` so the row becomes a cache target the
    next time the agent generates with identical inputs.
  - PATCH now accepts `title` (≤ 120 chars; empty string clears).
    `body`/`title`/`language` are all optional — refine zod requires
    at least one. Body edit invalidates `input_hash` via DB trigger
    (set NULL), so a stale tweaked body never serves as the cache
    answer for a future fresh prompt.
  - GET returns `title` alongside the existing fields.
- `supabase/migrations/0033_saved_social_drafts_title_and_cache.sql`:
  adds `title text` (with 1..120 char_length check) + `input_hash text`
  + sparse index on `(listing_id, input_hash) where input_hash is not
  null` + trigger that nulls `input_hash` on body change.
- `SocialCopyPanel`:
  - Output card shows a green **cached** pill when the response was
    served from a saved draft.
  - Saved-draft rows now show their title (when set) as the heading,
    with a **Title** / **Rename** button (`Tag` icon). Inline input,
    Save/Cancel, ≤ 120 chars, empty value clears.
  - Edit and rename are mutually exclusive (only one inline editor
    open per row at a time) so the actions row stays sane.

**Cache semantics deliberately chosen**:
- Cache key = `(listing_id, sha256(platform, language, sorted highlights))`.
  Listing facts (price, beds, etc.) are intentionally NOT in the key —
  they live on the listing and a listing facts change doesn't
  invalidate. Trade-off accepted: an agent who edits listing price and
  hits Generate gets the old cached body. Mitigation: the cached pill
  is visible, and the agent can click Refine to force a fresh call.
- Edits null out `input_hash` automatically — once a row diverges from
  "the canonical answer for this prompt", we never serve it as one.
- Refine path always bypasses the cache (intent is to regenerate).

**Migration**: 0033 to push to remote after merge.

## Phase 48.4 — Social drafts: editable + refine-from-edits (2026-06-22)

**Objective**: qiaoxux follow-up on 48.3. Two pain points after the
persistence ship:
1. The tour panel had a section `<h2>` that duplicated the button label
   and added visual chrome to a section that's currently just a teaser.
2. Saved drafts were immutable — a typo or polish required delete +
   re-save (lost the row's history). And worse, hitting **Regenerate**
   on an edited output threw away the agent's edits because the model
   had no idea they happened.

**Changes**:
- `GenerateTourPanel`: dropped the `<h2>` ("Create a home tour video from
  photos") and the "Coming soon" badge that lived next to it. The
  disabled CTA already says "Create a home tour video" with a tooltip,
  so the section is self-describing.
- `lib/ai/anthropic.ts` `generateSocialCopy`: new optional
  `previousDrafts` param shaped exactly like the output map. When a
  cell has a non-empty seed, the user payload carries `previous_drafts`
  + a `previous_drafts_note` instructing the model to treat that string
  as the agent-edited starting point — preserve voice, phrasing, and
  any specific facts the agent added; refine only to better match the
  platform brief and requested language. Each seed defensively trimmed
  to 8 KB (matches the `saved_social_drafts.body` column constraint).
- `app/api/generate-social/route.ts`: schema accepts
  `previous_drafts: Record<platform, Record<language, string>>` (≤ 8 KB
  each), forwards to `generateSocialCopy`.
- `SocialCopyPanel`:
  - Right-pane textarea is now editable. As soon as the agent types,
    `outputEdited` flips and the Generate button re-labels to **Refine
    from edits**, signaling that hitting it will *refine* not regen
    from scratch.
  - Live "edited" pill next to the platform tag while edits are
    pending.
  - When `outputEdited` is true, Generate sends
    `{ previous_drafts: { [platform]: { [language]: output } } }`
    alongside the usual fields; on a successful response the flag
    resets so the next click is a normal regen.
  - **Saved drafts** rows now have a **Refine** button (loads draft
    into the editor + sets platform/language + flips edited so the
    next Generate click refines from this body) and an **Edit**
    button (inline textarea + Save/Cancel). The "(edited)" suffix
    appears on rows where `updated_at != created_at`.
- `app/api/listings/[id]/social-drafts/route.ts`: new `PATCH` handler
  takes `{ draft_id, body, language? }`. Validates with the same zod
  enums and 8 KB cap. Hits the `social_copy` rate bucket so edit churn
  can't bypass the rate limit. Filtered by `id` + `listing_id` to pin
  the row; RLS update policy gates by agent → user. GET response now
  includes `updated_at` and orders by `updated_at desc` so freshly
  edited drafts float to the top.
- `supabase/migrations/0032_saved_social_drafts_update.sql`: adds
  `updated_at` column + auto-touch trigger + RLS update policy
  mirroring the select policy.

**Why edits feed back as "refine seed" (not just plain regen)**: the
agent has insider knowledge — exact street names, neighborhood
shorthand, school references, language-specific idioms. Throwing that
away every regen click trains them to never click Regenerate. Treating
their edits as the seed turns Regenerate into an iterative polish loop
instead of a destructive lottery.

**Why edit + refine on saved drafts (not just on the live output)**:
saved drafts are the durable artifact — they survive a refresh, a tab
close, a teammate handoff. Mutating them in place keeps the row
identity (and timestamp lineage) stable; the alternative (delete +
re-save) loses the original `created_at` and counts toward the 50-row
cap twice during the brief window before optimistic delete settles.

**Migration target**: 0032 deployed to remote via `supabase db push`.

## Phase 48.3 — Social drafts: persistence + tour panel polish (2026-06-22)

**Objective**: qiaoxux follow-up on Phase 48.1. Tour panel still had
dated "Q4 2026" text and a paragraph promising provider eval; selling
points hint was a paragraph; platform/language dropdowns each carried a
hint; generated copy was lost on refresh; save surface had no abuse
controls.

**Changes**:
- `GenerateTourPanel`: dropped "Q4 2026" badge text → just "Coming
  soon". Removed the "We'll evaluate the best provider this fall…"
  blurb. Renamed CTA "Generate AI tour video" → "Create a home tour
  video". Section title unchanged ("Create a home tour video from
  photos"). Tooltip + button now say the same thing for consistency.
- `SocialCopyPanel`:
  - Selling points hint trimmed to a bare word counter:
    "Up to 50 words (N/50)" — turns red when over. Generate disabled
    while over the cap.
  - Removed all hints from Platform / Language selects (no more target
    length under platform; languages never had one).
  - **Save** button next to Copy on the output card. Persists the
    generated body + platform + language + highlights to a new
    `saved_social_drafts` table.
  - **Saved drafts** card below the L/R split, listing every saved
    draft for this listing (newest first) with copy + delete actions.
    Optimistic delete; rollback on failure.
- `supabase/migrations/0031_saved_social_drafts.sql`: new table with
  RLS scoped agent → listing → drafts. Body length capped at 8 KB at
  the column level; per-listing 50-row cap enforced by trigger
  (`enforce_saved_social_drafts_cap`). Insert policy joins through
  listings → agents → user_id (defense-in-depth alongside the route
  handler ownership check). No update policy — drafts are immutable;
  edit means delete + re-save.
- `app/api/listings/[id]/social-drafts/route.ts`: GET / POST / DELETE.
  - All three require an authenticated agent.
  - Listing ownership verified explicitly even though RLS would catch
    it (fail-fast 404 vs. silent empty result).
  - POST validates platform/language enums + body ≤ 8 KB; double-up
    with DB constraints.
  - POST shares the `social_copy` rate-limit bucket (10/min/agent) so
    saving can't be abused as a free unbounded write surface.
  - 409 cap_reached when the trigger fires.
  - DELETE is RLS-gated; agent can't pass another agent's draft id.

**Verification**: `npx tsc --noEmit` clean, `npx next build --no-lint`
succeeds.

**Decisions**:
- 50 drafts per listing is plenty: 9 platforms × 5 languages = 45 cells
  if an agent saved every variant once. Soft cap with surfaced error
  beats silent eviction.
- 8 KB body cap: longest legitimate single-cell output is ~2 KB
  (Facebook long-form post in zh). 8 KB allows generous over-shoot
  without enabling abuse.
- Reuse `social_copy` rate bucket on save: keeps the abuse surface to
  one knob. If a user saves at 10 req/min legitimately, they're also
  generating, so the bucket is already warm — no UX regression.
- Drafts stored as plain rows, not jsonb blobs, so we can later index
  by platform/language for analytics without migration churn.

## Phase 48.1 — Marketing tab layout cleanup + tour script relocation (2026-06-22)

**Objective**: qiaoxux follow-up on Phase 48. Layout was cluttered: tour
generator card sat above the social copy in the Marketing tab; copy panel
had a redundant "Facebook + Instagram drafts" header from before Phase 48
that the checkbox grid replaced; checkbox grid felt like overkill when
agents typically generate one cell at a time and pick the next platform
manually.

**Changes**:
- `GenerateTourPanel`: relocated from Marketing tab into Media tab as a
  standalone bottom section. Renamed "AI tour video" → "Create a home
  tour video from photos" so the affordance is self-describing.
- `MarketingPanel.tsx`: deleted. The Marketing tab's `marketing` slot
  now renders `<SocialCopyPanel>` directly — no wrapper title, no
  sub-tabs, no redundant chrome.
- `SocialCopyPanel`: rebuilt as a 2-column L/R split.
  - Left: Selling points input (with an upper-limit hint instead of a
    descriptive blurb), Platform dropdown (9 options, each with its
    target-length hint surfaced under the select), Language dropdown
    (5 options), single Generate button.
  - Right: single output card with Copy button. Empty state shows
    "Generated copy will appear here."
  - Lost the Phase 48 checkbox grid + per-platform card list. The API
    still accepts platforms/languages arrays for forward compat — we
    just send 1-element arrays.

**Verification**: `npx tsc --noEmit` clean, `npx next build --no-lint`
succeeds. MarketingPanel.tsx removed; only DEVLOG history references it
now.

**Reasoning for single-cell**: with 9 platforms × 5 languages, the
checkbox grid encouraged spraying; agents reported reading one cell at a
time anyway. Dropdown + Regenerate is fewer clicks for the common case
(one platform, regenerate until happy, switch platform, repeat) and
keeps the right column readable instead of scrolling through a stack of
half-read cards. If batching becomes important again the API contract
hasn't changed.

## Phase 48 — Marketing tab: multi-platform × multi-language social copy (2026-06-22)

**Objective**: qiaoxux — agent hub Marketing tab is poorly organised, only 3
platforms (Facebook / Instagram / Email), English only. Add Rednote (小红书)
plus the popular US homebuyer languages, and ground the generator in actual
listing content (description text, photo captions, video titles) instead of
hallucinating from address + price alone.

**Positioning pivot** (CLAUDE.md §1): the US homebuyer pool is multilingual.
Non-English buyers are part of the target audience, not a separate
Chinese-community spinoff. Buyer-facing marketing copy generators may now
emit multiple languages on agent opt-in; Rednote / WeChat Moments are
allowed there for the same reason. Schema, dashboard chrome, and buyer-
facing UI strings stay English-only — the change is scoped to the social
copy generator. CLAUDE.md §1 rewritten to reflect this.

**Actions**:

- `lib/ai/anthropic.ts`: rebuilt `generateSocialCopy` to take `platforms[]`
  and `languages[]` arrays and return a 2-D `{ [platform]: { [language]: string } }`
  map. Added platform briefs for the 9 supported platforms (facebook,
  instagram, email, tiktok, x, linkedin, threads, rednote, wechat) so the
  prompt encodes platform-specific norms (URL conventions, hashtag
  conventions, character caps for X, "no link in TikTok caption", "no
  hashtags on WeChat Moments", etc.). Languages: en, zh, es, vi, ko.
  `maxTokens` scales with `platforms × languages` (capped at 8000).
- `app/api/generate-social/route.ts`: schema accepts `platforms` (1..6) and
  `languages` (1..4) per call. Backend now also pulls `listings.description`,
  `listing_photos.alt_text` (≤12 in sort order), and `listing_videos.title`
  (≤12) and passes them to the model as grounding. Pure text — no vision
  tokens. Empty values are dropped before the prompt.
- `app/dashboard/listings/[id]/edit/SocialCopyPanel.tsx`: rebuilt UI from
  fixed 3-tab to a checkbox grid — two side-by-side fieldsets (Platforms /
  Languages) with pill toggles, then a Generate button that produces every
  selected (platform, language) cell in one Anthropic call. Output renders
  as one card per platform with a language sub-tab strip + per-cell Copy
  button. Counter on each fieldset shows N/cap; the Generate button is
  disabled and explains why if 0 selected or over the cap.
- `CLAUDE.md` §1 rewritten — see "Positioning pivot" above.

**Decisions**:

- 6×4 caps. Hard cap is the model's max_tokens budget (8000) and the
  agent's signal-to-noise ratio — generating 9 platforms × 5 languages = 45
  cells per click is wasteful and produces output the agent will never
  read. 6×4 lets the common Bay Area case (Facebook/Instagram/Email/Rednote
  × EN/ZH/ES) fit comfortably with headroom for one more.
- Single round-trip rather than per-cell parallel calls. Cost and consistency
  win — same listing facts in the same prompt → consistent angle across
  cells. Failure mode: one model hiccup loses everything; the rate limit
  bucket charges the same regardless, so retry is cheap.
- Light grounding (text only) per qiaoxux's call. Vision-block per cover
  photo is a 5× token bump for marginal copy quality given that listing
  descriptions usually already encode what's interesting about the
  property.

**Verification**: `npx tsc --noEmit` clean. Manual UI verification pending
after Vercel preview build.

## Phase 47.18 — Drop "Content" title from Media tab (2026-06-22)

**Objective**: qiaoxux — "Rename context title from agent hub media tab" → "remove it". Drop the "Content" `<h2>` from `MediaPanel`.

**Actions**: removed the title `<h2>` and surrounding flex wrapper in `app/dashboard/listings/[id]/edit/MediaPanel.tsx`; kept the helper line. tsc clean.

**Decisions**: tab is already labelled "Media" — the card title was redundant.

## Phase 47.17 — Agent hub Details panel cleanup (2026-06-22)

User asked for a "cleanup" of the listing /edit Details panel — explicitly *"do
not remove any sections or features, just delete hints if the input is
self-explained"*. Plus three concrete additions: units for **Square feet**,
units for **HOA**, and a **Year built** dropdown that also accepts free typing
(same pattern as Beds/Baths).

Changes (all in `app/dashboard/listings/[id]/edit/EditListingForm.tsx`):

- **Hints removed** (every input is self-evident from its label/placeholder):
  - Top legend `* = required to publish` → row collapses to just the
    `<SaveBadge>` aligned right.
  - Bedrooms `0 = studio. Pick 7 or more for larger homes.`
  - Bathrooms `Half baths count as 0.5. Pick more than 5 for custom.`
  - HOA `Leave blank if none.`
  - Community `Links this listing to a shared community for school + POI data…`
  - Description `One paragraph per blank line. Up to 10 paragraphs, English only.`
  - `<SaveBadge>` `idle` state (`"Auto-save on"` pill) → returns `null`. Pill
    only shows for the meaningful states: `pending` / `saving` / `saved` / `error`.
- **Square feet** input: gray `sq ft` suffix inside the right edge of the field
  (`pointer-events-none absolute inset-y-0 right-3`).
- **HOA** input: type changed from free `text` to `number`. Gray `$` prefix on
  the left, gray `/month` suffix on the right. Schema column `listings.hoa`
  stays `text` (legacy callers + buyer-facing renderers untouched). New helpers
  `parseHoaAmount` (read: extract first integer from any stored string like
  `"$120/mo"` or `"None"` → `"120"`) and `composeHoa` (write: `"$<n>/month"`)
  bridge the UI ↔ DB. Old free-text values that have no digit become an empty
  input — agent re-enters once.
- **Year built** input: number input → hybrid select↔custom, mirroring the
  Beds/Baths pattern. Default mode is `<select>` showing current year → 1900
  (reverse chronological) plus a `Type a year…` option that switches to a
  number input with a `Use list` revert button. Initial mode picks `custom`
  if the stored value falls outside 1900..currentYear, else `list`.

Did **not** touch:

- `NewListingForm.tsx` (the create page) — request was scoped to the agent
  hub Details tab.
- Any schema, server action validator, buyer-facing renderer, or autosave
  behavior.
- The `description` field, AI generate button, community dropdown options,
  required-field red `*` markers — only their *hint* text was deleted.

Verification:

- `npx tsc --noEmit` clean.
- Manual UI verification pending after Vercel preview build.

Concerns surfaced before patching:

- `* = required` legend removal: required fields still carry a red `*` next
  to the label — the legend was redundant. Server-side publish errors should
  still name the missing field; if not, follow-up work needed.
- HOA schema mismatch (text vs number) handled by the `parseHoaAmount`/
  `composeHoa` adapter; explicit DEVLOG entry here so the next person doesn't
  silently switch `listings.hoa` to integer and break legacy rows.
- User flagged that eventually these data should be **prepopulated from MLS**.
  That's a separate phase (ATTOM Data Property API is the cheapest first step
  — $0.15-0.30/lookup, no MLS-board approval needed; full RESO Web API
  integration is V2). Not in scope here.

## Phase 47.16 — Media tab: unified upload (B2) (2026-06-21)

User asked to merge the upload UI for photos and videos on the listing /edit
Media tab — *"at end of the day they are just content"*. Picked B2 from the
sign-off prototype (`public/prototype/media-tab-merge-v2.html`): one
**Click to upload** button accepting both `image/*` and `video/*`, files fan
out by MIME after pick. The existing per-video pick→title→tus pipeline and
per-photo Supabase batch pipeline are untouched — only the entry point is
unified.

Changes:

- `app/dashboard/listings/[id]/edit/MediaPanel.tsx` (new) — wrapper panel
  rendering one `<input accept="image/*,video/*" multiple>` button.
  - `image/*` files → forwarded to `PhotoPanel.addFiles()` via imperative
    handle (existing `handleFiles` → Supabase upload + `recordListingPhoto`).
  - `video/*` files → spawn one `<VideoUploader>` instance per file with
    `initialFile` prefilled, so the agent skips the picker but still
    confirms the title before bytes leave the device. On success,
    `VideoPanel.pushUploaded()` registers the row optimistically.
  - Absorbs the `?prefill=<id>` URL handling from
    `PhotoPanelPrefillBridge` and now also routes prefilled video files
    (previously dropped with a `console.warn`).
- `app/dashboard/listings/[id]/edit/PhotoPanel.tsx` —
  `forwardRef<PhotoPanelHandle>` exposes `addFiles`. New `hideUploadButton`
  prop hides the local "Add photos" button when MediaPanel owns the entry.
- `app/dashboard/listings/[id]/edit/VideoPanel.tsx` —
  `forwardRef<VideoPanelHandle>` exposes `pushUploaded`. New `hideUploader`
  prop hides the embedded `<VideoUploader>` when MediaPanel owns the entry.
- `app/dashboard/listings/[id]/edit/page.tsx` — two stacked `<section>`s
  ("Videos" + "Photos") collapse to one `<MediaPanel>`. Inside MediaPanel
  the panels still render as stacked sub-sections "Videos (N)" /
  "Photos (N)" with a hairline separator, so existing reorder/cover/delete
  affordances are untouched.
- `app/dashboard/listings/[id]/edit/PhotoPanelPrefillBridge.tsx` — deleted
  (functionality absorbed by MediaPanel).

Out of scope (deferred until asked): community hub `/dashboard/communities/[id]`
where Videos and Photos are top-level tabs — not merged in this pass.

Verification:

- `npx tsc --noEmit` clean.
- `npx next build` succeeds, no new pages affected.

Pitfalls / things to watch:

- VideoUploader's `initialFile` path is the Phase 45.16 codepath (FAB
  prefill); this is the second consumer. If we ever change that contract
  the unified upload breaks silently — the file would still be rendered
  in the picker UI but the agent has to re-pick.
- Files with non-image/non-video MIME types are skipped with an inline
  notice listing the first three names, instead of failing silently.
- StrictMode double-mount safe: prefill consume is lazy-init, video
  pending-list registration is gated by a ref flag.

## Phase 47.15 — Delete consolidated to Details tab (2026-06-21)

User feedback after 47.11/47.12: on community detail the Delete affordance lived
in the hero ⋯ menu *and* inline in the Details tab — confusing, asymmetric vs
listing detail (which had moved to a bottom DangerZone in 47.12). User asked to
align both: **Delete only inside the Details tab, identical rose DangerZone
block, never on the hero**.

Changes:

- `app/dashboard/listings/[id]/edit/page.tsx` — `<DangerZone>` moved from
  outside `<HubTabs>` into the `details:` panel (wrapped with the form in a
  `space-y-6` flex column). Dropped now-unused `HeroDeleteButton` import.
- `app/dashboard/listings/[id]/edit/DangerZone.tsx` — outer `mx-auto mt-12
  max-w-6xl px-4 pb-16` shell stripped (HubTabs panel already provides the
  6xl/padding container).
- `app/dashboard/communities/[id]/page.tsx` — removed `<CommunityDetailMenu>`
  from the hero `rightOverlay`; `CommunityStatusPill` is the only hero pill
  again.
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — inline `<DangerZone>`
  upgraded to match listing's rose 2xl block (rose-300/60 border, rose-50/40
  bg, rose-600 solid CTA). Same prose, same `confirm()`.

Orphans removed:
- `app/dashboard/listings/[id]/edit/ListingDetailMenu.tsx`
- `app/dashboard/communities/[id]/CommunityDetailMenu.tsx`
- `app/dashboard/_components/HeroDeleteButton.tsx`

Verification: `npx tsc --noEmit` clean.

Result: both detail pages now have one Delete affordance, in the same place
(Details tab, bottom of form), with identical visual weight. Other tabs (Media,
Marketing, Leads, Analytics, Videos, Photos, Cover) no longer carry the Delete
block — it is genuinely tied to "this is the master record for this listing/
community".


## Phase 47.11 — AgentHub mylisting hero polish (2026-06-21)

Agent feedback after Phase 47.10 ship surfaced four UX papercuts:

1. **Dashboard `/dashboard` filter+sort feels two-island'd** → merged into one
   natural row: `Show: [All N] [Active N] [Inactive N] | Sort by: dotted-underline select`.
   Removed the right-aligned bordered pill around the sort; underline-only
   feels lighter and reads as one sentence with the filter chips.
2. **Hero Preview button "not responsive" (looked unclickable)** → kept
   chromeless base but added `border-white/35 bg-white/15 backdrop-blur-md`
   default state + ↗ arrow glyph. Now it visibly invites a click on bright
   covers without losing the chromeless aesthetic.
3. **Active/Inactive popover felt like a 2-step "deactivate" gesture** →
   new `InstantStatusToggle` replaces hero `StatusPill`. Active→Inactive is
   silent and instant (no popover, no "→ deactivate" hint). Inactive→Active
   still surfaces the missing-fields popover when validation fails (that's
   genuinely useful). One click, no chrome.
4. **Delete hidden behind ⋯ menu** → new `HeroDeleteButton` is a visible
   chromeless rose-tinted control on the hero. `confirm()` still gates the
   destructive call. The old `ListingDetailMenu` stays in-tree (used by
   nothing on the hero now) — left for any future overflow needs.
5. **Stats removed from hero** → hero is back to "hero pic". The detailed
   funnel + breakdowns already live in the Analytics tab; the open-leads
   tab badge (`Leads · N`) carries the only number the agent really needs
   at a glance. HeroHeader simplified from 3-section grid (`auto · 1fr · auto`)
   to 2-section (`auto · 1fr`); zero-overlap guarantee preserved.

### Code

- New `app/dashboard/_components/InstantStatusToggle.tsx` (5,620 B) —
  client, calls `publishListing` / `unpublishListing`, uses `flushPending`
  from edit flush-registry, portals validation popover to `document.body`
  to escape stacking contexts (per phase 45.33 lesson).
- New `app/dashboard/_components/HeroDeleteButton.tsx` (1,820 B) — client,
  rose-tinted chromeless variant matching HeroControl pattern.
- `app/dashboard/_components/HeroHeader.tsx` — dropped `stats` prop and
  `HeroStat` type; grid template `auto 1fr auto` → `auto 1fr`. The home
  info column moved from `justify-center` to `justify-end pb-2` so the
  title sits naturally near the bottom of the hero plate.
- `app/dashboard/listings/[id]/edit/page.tsx` — removed the 3-promise
  parallel SSR fetch for views/saves/leads counts. Kept a single
  lightweight leads fetch just to compute `openLeads` for the tab badge.
  Swapped `StatusPill` → `InstantStatusToggle`, `ListingDetailMenu` →
  `HeroDeleteButton`. Preview link now carries explicit visible chrome.
- `app/dashboard/_components/DashboardListingGrid.tsx` — flat single-row
  layout: `Show <chips>  |  Sort by <underlined select>`.

### Verification

- `npx tsc --noEmit` → exit 0
- `npx next build` → success. `/dashboard` 2.23 kB / 98.2 kB,
  `/dashboard/listings/[id]/edit` 28.9 kB / 205 kB (-0.4 kB vs phase 47.10
  thanks to dropped stat-fetch path).

### Pitfalls captured

- Existing helper `flushPending` lives at
  `@/app/dashboard/listings/[id]/edit/flush-registry` — there is no
  `@/lib/forms/pending` module. Wrong import compiles via path alias but
  fails TS resolution.
- After dropping a `HeroHeader` prop, must read **then** rewrite the
  caller block, not just patch the prop line — leftover usage caused TS
  errors until the `stats={...}` line was removed.

### Files changed

- `app/dashboard/_components/HeroHeader.tsx` (modified, simpler)
- `app/dashboard/_components/InstantStatusToggle.tsx` (new)
- `app/dashboard/_components/HeroDeleteButton.tsx` (new)
- `app/dashboard/_components/DashboardListingGrid.tsx` (modified)
- `app/dashboard/listings/[id]/edit/page.tsx` (modified)

`StatusPill.tsx` and `ListingDetailMenu.tsx` remain in-tree but are not
referenced from the hero. Other dashboard surfaces (community detail
hub) still use `StatusPill` via its `variant="community"` path.

---

## Phase 47.5–47.10 — AgentHub mylisting redesign (2026-06-21)

Owner ask: "关于agenthub里的mylisting 的子页面们 你有什么建议吗 增加或改动或布局".
Iterated 6 HTML prototypes (`public/prototype/agenthub-mylisting{,-v2…v6}.html`)
to lock visual + interaction direction, then shipped the full redesign in
one batch: hero rebuilt as a 3-section CSS grid, sub-tabs reorganised to
5 tabs, Analytics inlined, per-listing Leads tab added, and the dashboard
grid gained filter chips + sort.

**Hero (Phase 47.5).** New `app/dashboard/_components/HeroHeader.tsx` —
CSS grid `auto · 1fr · auto` with three explicit rows: §1 right-aligned
controls, §2 left-aligned title/subtitle filling the middle, §3 three
frosted-glass stat tiles (Views / Saves / Leads + delta). No
`position:absolute` anywhere — physical separation, zero overlap risk on
arbitrary-length addresses (we tested with "1247 Peachtree Ridge Manor
Crossing Lane" in the prototype). Companion `HeroControl.tsx` provides
the chromeless button: transparent + text-shadow at rest, frosted-glass
surface on hover (160ms transition, scale(0.97) on active), focus ring
on `focus-visible`.

**5 tabs (Phase 47.6).** Order: `Details · Media · Marketing · Leads ·
Analytics`. Marketing replaces the old Social + Tour tabs — sibling tab
count down from 6 to 5 to keep mobile from horizontally scrolling. The
Leads tab label appends `· N` when there are unfollowed-up leads, so
the agent sees actionable count without opening the tab.

**Marketing merge (Phase 47.6).** New
`app/dashboard/listings/[id]/edit/MarketingPanel.tsx` — pill sub-tabs
(Social copy / Home tour script) over plain `useState`, no URL
persistence. Hosts the existing `SocialCopyPanel` and `GenerateTourPanel`
unchanged; the merge is purely a routing/structural change.

**Per-listing Leads (Phase 47.7).** New
`app/dashboard/listings/[id]/edit/ListingLeadsPanel.tsx` — server
component that selects from `public.leads` filtered by `listing_id`
(RLS already gates to agent-owned listings). Renders a compact list with
the same mailto/sms affordances as the global `/dashboard/leads` inbox,
plus a "See all leads →" backlink. Empty state copy:
"No leads on this listing yet. Leads from the public listing page will
appear here in real time." — uses the listing context to set agent
expectation. No realtime subscription here; per-page-view freshness is
fine for the inline tab. If we need it later, swap to `LeadsLive` with
a `listing_id` filter.

**Analytics inline + redirect (Phase 47.8).** New
`app/dashboard/listings/[id]/edit/AnalyticsPanel.tsx` — lifted from the
old standalone `app/dashboard/listings/[id]/analytics/page.tsx`. Same
data shape (Stat tiles + Funnel + TopCards) but now scoped to a tab; the
crumbs / H1 are dropped because the hero already shows them. The old
route now `permanentRedirect`s to `/dashboard/listings/[id]/edit?tab=analytics`
so existing bookmarks survive. Replaced `from-gold/80 to-gold/40` funnel
gradient with `from-ink/40 to-ink/20` to match the burgundy-free Aman
direction (the gold alias still resolves to ink, but explicit is clearer).

**Hero stats SSR (Phase 47.5).** Edit page now runs three count queries
in parallel after the listing fetch:
- `events` count where `event_type='page_view'` (Views)
- `saved_listings` count by `listing_id` (Saves)
- `leads` count + `followed_up_at` rows (Leads + open delta)
Three counts hit different tables with `head: true` on the first two;
leads needs the rows to compute the open count (no `is null` count
shortcut on the supabase-js client we use). Total cost: 3 round-trips,
well under the page's existing video/photo/community fetches.

**Dashboard grid (Phase 47.10).** New
`app/dashboard/_components/DashboardListingGrid.tsx` — client wrapper
around the existing `ListingGrid`. Adds filter chips (All / Active /
Inactive with inline counts) and a sort dropdown (Recently updated /
Newest / Most viewed). Filtering and sorting are pure client-side over
the SSR-hydrated rows — agent portfolios are bounded enough that we
don't need server pagination. View counts are aggregated in one
`events.select('listing_id').in('listing_id', ids)` query, then folded
into a Map in JS.

**Files created** (8): `HeroHeader.tsx`, `HeroControl.tsx`,
`DashboardListingGrid.tsx`, `MarketingPanel.tsx`, `ListingLeadsPanel.tsx`,
`AnalyticsPanel.tsx`. **Modified** (3): `app/dashboard/page.tsx`,
`app/dashboard/listings/[id]/edit/page.tsx`,
`app/dashboard/listings/[id]/analytics/page.tsx`.

**Verification.** `npx tsc --noEmit` clean; `npx next build` succeeded
(edit page first-load JS 29.3 kB / 206 kB total, dashboard grid 2.23 kB /
98.2 kB total).

**Process note.** Plan was 6 phases originally laid out as
`Phase A: hero → B: 5-tab → C: marketing → D: leads → E: redirect →
F: dashboard grid`. Per the memory pattern about the 50-call subagent
cap, this phase was mechanical (8 file creates + 3 modifies, ~12 patches
total, no nontrivial reasoning), so the parent agent handled it directly
in ~22 tool calls. No subagent dispatch needed.

## Phase 47.4 — Portfolio internal rhythm (2026-06-21)

Owner feedback after Phase 47.3 ship: "可以放大一点 并且同一个页面内各处间距尽量保持一致 这里是 agent profile 不需要和 grid view 里的设置一样 但是自己页面内要协调."

The dense feed grid (3/4 aspect, 8px inset, 15px price, 11px sub) is correct
for `/browse` and friends because cards are small. The portfolio's 4:5 cards
are much larger, so the same overlay sizes felt visually under-weighted, and
the page mixed several spacing scales (`pt-16 pb-10 md:pt-24 md:pb-14`,
`mb-10`, `mb-12`, `gap-x-8 gap-y-14`, `py-10`) that didn't read as one
coherent surface.

Changes:
- `app/_components/GridCard.tsx`: added optional `captionInsetClass` prop
  (default `inset-x-2 bottom-2` — every other grid is unaffected).
- `app/(public)/a/[agentSlug]/page.tsx`:
  - Hero & listings sections unified to `py-20 md:py-28`.
  - Headers `mb-8`, hero flex `gap-8`, grid `gap-8` (square rhythm — was
    `gap-x-8 gap-y-14`), bio `mt-8`, footer `py-8`.
  - Card overlay inset `inset-x-2 bottom-2` → `inset-x-5 bottom-5` (20px).
  - Card caption: price `text-[15px]` → `font-serif text-[22px] md:text-[26px]`
    (serif to echo the page's `display-md` heading); sub-lines `text-[11px]`
    → `text-[13px] md:text-[14px]`.
  - Replaced shared `GridCardCaption` with inline custom caption so the
    portfolio can carry its own typography without affecting feed cards.

Result: `/a/[agentSlug]` reads on a single 8px spacing scale with overlay
text sized in proportion to its larger image. `/browse`, `/communities`,
`/dashboard`, `/saved`, `/search`, `/nearby`, `/c/[slug]` unchanged.

Files: 2 modified.
Verification: tsc clean, biome clean (1 auto-fixed), next build success.

## 2026-06-21 — Phase 47.3: portfolio text format unified

**Objective**: qiaoxux follow-up after phase47.2 — agent portfolio
page (`/a/[agentSlug]`) keeps its editorial 1/2/3-column 4:5 layout
with wide gaps (different visual family from feed grids), but the
card text format + placement should match every other grid: price /
specs / address overlaid on the bottom-left of the image with the
shared font, size, and gradient.

**Approach**:
- Added optional `aspectClass` prop to `GridCard` (default
  `aspect-[3/4]`) so portfolio cards can pass `aspect-[4/5]` while
  still using the shared overlay caption + gradient + hover.
- Replaced inline `ListingCardView` markup in
  `app/(public)/a/[agentSlug]/page.tsx` with `<GridCard>` +
  `<GridCardCaption>` + `<GridCardBadgeDark>` (for the Stock pill).
- Removed the "No. 01" eyebrow + "City, State" tracked-caps pair
  and the post-image text block — text now reads price → specs →
  address as an overlay on the cover image, identical to every
  other grid surface.

**Verification**: tsc 0, biome clean, next build success.
## 2026-06-21 — Phase 47.2: unify all remaining grid surfaces + flush gutters

**Objective**: qiaoxux follow-up after phase47.1 — (a) make the page's
left/right padding equal to the inter-card gap so the visual rhythm
matches all the way to the screen edge; (b) extend the unified grid
(GridPageShell + GridFrame + GridCard / ListingGrid / CommunityGrid)
to *every* page that renders a card grid, not just the four already
done in phase47.

**Surfaces unified in this pass**:
- `/saved` (SavedClient — buyer favorites, listings + communities)
- `/search` (site-wide search results — listings + communities)
- `/nearby` (geolocation feed; distance pill now routes through
  `ListingGridItem.distanceMi` → `GridCard topLeft`)
- `/c/[slug]` (community detail; both VideosGrid and ListingsGrid
  rebuilt on top of GridFrame + GridCard / ListingGrid)
- 5 corresponding `loading.tsx` skeletons

**Gutter alignment**: GridPageShell padding changed from
`px-3 sm:px-6` to `px-1 md:px-1.5` — i.e. exactly the gap value.
The whole grid now reads as a continuous rhythm of equal whitespace
from edge to edge with no special margin around the page.

**API extension**: `ListingGridItem` gained an optional `distanceMi`
field; `ListingGrid` renders it as a top-left dark badge so /nearby
no longer needs its own card markup.

**Decisions**:
- `app/(public)/a/[agentSlug]` (agent portfolio page) intentionally
  left alone — it uses an editorial 1/2/3-column layout with large
  gaps and a different card design; that's a separate visual family,
  not a feed/search/list grid. Will revisit if owner asks.
- Inline `formatPrice` and `ListingCard` helpers deleted from
  /search and /nearby; price formatting lives in GridCardPrice.

**Verification**:
- `npx tsc --noEmit` → 0 errors
- `npx biome check` → clean
- `npx next build` → success, all routes built
- Manual: every grid page now shares the same px-1 md:px-1.5
  outer padding, gap-1 md:gap-1.5 inter-card gutters, aspect-[3/4]
  cards, and identical caption / badge typography.

**Files changed**: 11 (1 modified primitive + 4 page refactors +
5 loading skeletons + 1 ListingGrid extension).

## 2026-06-21 — Phase 47.1: equal grid gaps

**Objective**: qiaoxux follow-up — wanted horizontal + vertical gaps in
the grid to be the same (the phase45.26 density used `gap-x-1 gap-y-2`,
which made cards read as horizontal stripes rather than a uniform mesh).

**Change**: `app/_components/GridFrame.tsx` — `gap-x-1 gap-y-2
md:gap-x-1.5 md:gap-y-3` → `gap-1 md:gap-1.5`. One line, lands across
all four grid pages (`/browse`, `/communities`, `/dashboard`,
`/dashboard/communities`) because they all share `<GridFrame>` from
phase 47.

**Verification**: tsc clean, biome clean (after auto-format).

## 2026-06-21 — Phase 47: shared grid primitives (GridPageShell / GridCard)

**Objective**: qiaoxux flagged that the My Listings + My Communities grids
"looked different" from the buyer-side For You + Communities grids. Asked
to unify them and refactor so the same change wouldn't have to be made in
two places again.

**Root cause**: container chrome was authored 4 different ways. `/browse`
and `/communities` used `mx-auto max-w-6xl px-3 pb-6 sm:px-6`, while
`dashboard/layout.tsx` wrapped its children in `mx-auto max-w-6xl px-6 py-8`
(no `px-3`, extra `py-8`), and `/dashboard/communities` doubled up
(layout's px-6 + page's own px-3 sm:px-6). On top of that the listing-card
markup was duplicated between `/browse/page.tsx` and
`app/dashboard/_components/ListingsTabbedList.tsx`.

**Changes**:
- New `app/_components/GridPageShell.tsx` — single source of truth for the
  grid-page horizontal padding + max width.
- New `app/_components/GridFrame.tsx` — single source of truth for the
  2/4-up grid wrapper (cols + gaps).
- New `app/_components/GridCard.tsx` — slot-based 3:4 cover card with
  helpers `GridCardCaption`, `GridCardBadgeDark`, `GridCardBadgeLight`.
  Caller supplies cover URL, fallback, optional top-left/top-right badges,
  caption, and a `dimmed` flag.
- New `app/_components/ListingGrid.tsx` — buyer-facing listing grid
  mapper. Takes a normalized `ListingGridItem[]` (id/href/cover/price/
  beds/baths/sqft/address/badge/dimmed); composes GridCard + GridFrame.
- Refactored `app/_components/CommunityGrid.tsx` on top of GridCard so
  community + listing grids share frame, aspect, hover, gradient.
- `app/(public)/browse/page.tsx` — collapsed inline grid markup into a
  short mapper that calls `<GridPageShell><ListingGrid items={…} /></…>`.
- `app/dashboard/page.tsx` (My Listings) — same pattern. Inactive
  listings render with `dimmed` + a light `Inactive` badge.
- `app/(public)/communities/page.tsx` and `app/dashboard/communities/page.tsx`
  — wrap CommunityGrid in `<GridPageShell>`; dashboard variant passes a
  custom `hrefBuilder` to send agents to their editor.
- Deleted `app/dashboard/_components/ListingsTabbedList.tsx` (logic
  absorbed into the page above).
- `app/dashboard/layout.tsx` — dropped the `mx-auto max-w-6xl px-6 py-8`
  inner `<main>` wrapper. Each child page now owns its own container.
  The outer `<main>` keeps `pb-24 md:pb-8` so the mobile BottomNav
  doesn't overlap content.
- Added `px-4 sm:px-6` to the form/detail pages that previously relied
  on the dashboard layout's chrome (`listings/new`, `communities/new`,
  `listings/[id]/edit` empty state, `communities/[id]` empty state,
  `communities/[id]/upload`).
- Updated the explanatory comment in `listings/[id]/preview/page.tsx`
  (the file uses `fixed inset-0` so the dashboard chrome change doesn't
  affect it; comment was lying about the why).

**Decisions**:
- *Why a slot-based GridCard instead of two near-identical grids?* The
  card frame (column rules, aspect 3:4, bg-surface, hover scale, bottom
  gradient, caption typography, badge corner pinning) was 100% identical
  between listings and communities. Only the data fields differed. Slot
  composition costs one layer of indirection but means a designer can
  retune the cover hover or the caption type ramp in one file.
- *Why keep two mappers (`ListingGrid`, `CommunityGrid`) instead of
  letting pages call `<GridCard>` directly?* Type-safety on the page side.
  Pages pass a normalized item array; mappers handle field formatting
  (price, ½-bath, distance pill, "Inactive" badge). Future divergence
  (e.g. community gets a video count, listing gets a mini map) only
  touches the mapper, not the pages.
- *Why drop the dashboard layout's `<main>` chrome rather than make the
  buyer-side grids match it?* The dashboard chrome was the outlier
  (px-6 not px-3, extra py-8). Moving padding ownership to each page
  also means form pages and grid pages can have different paddings without
  fighting the layout.

**Verification**: `tsc --noEmit` clean, `biome check` clean on all 10
touched files, `next build` succeeded with all four grid routes
present (`/browse`, `/communities`, `/dashboard`, `/dashboard/communities`).
Pre-existing test failures in `lib/analytics/__tests__/listing-stats.test.ts`
and `app/api/.../route.test.ts` are unrelated (verified via stash + rerun
on main: same 2 failed / 41 passed).

**Files touched**: 4 new (`GridPageShell.tsx`, `GridFrame.tsx`,
`GridCard.tsx`, `ListingGrid.tsx`) + 1 rewrite (`CommunityGrid.tsx`) +
4 grid page rewrites + 1 layout rewrite + 5 form/detail page padding
patches + 1 deletion (`ListingsTabbedList.tsx`).

**Next steps**: push branch, verify Vercel preview, ask qiaoxux to
side-by-side `/browse` vs `/dashboard` and `/communities` vs
`/dashboard/communities` on the preview before merging to main.

## 2026-06-21 — Phase 46 follow-up: inline Photos tab + buyer-side active gating

**Objective**: qiaoxux follow-up after phase46 merge — (1) inline the
community Photos panel inside the new HubDetailShell instead of linking
out to /upload, (2) buyer surfaces only show `status='active'` communities.

**Changes**:
- `app/dashboard/communities/[id]/CommunityPhotosTab.tsx` — new client
  wrapper: CategoryPicker + CommunityPhotoPanel, mirroring the photo
  half of /upload (same shared category drives uploads).
- `app/dashboard/communities/[id]/page.tsx` — load `community_photos`
  rows + sign URLs server-side (same loader path as /upload), pass to
  CommunityPhotosTab. Photos tab is now in-place editable.
- `lib/communities/list.ts` — `fetchCommunityListCards()` now takes
  `{ includeInactive?: boolean }`. Default false (buyer surfaces:
  /communities, /browse?tab=communities). Dashboard's
  /dashboard/communities passes `includeInactive: true` so the agent
  can still see and reactivate her own inactive communities.
- `lib/feed/browse-cards.ts` — both community fetches gate
  `status='active'`: the listing-feed slug lookup
  (fetchBrowseCardsForCommunity) and the inline community-sheet hydration.
- `app/(public)/c/[slug]/page.tsx` — selects `status` and `notFound()`
  on non-active. Inactive communities now 404 for buyers; the creating
  agent still sees them in /dashboard/communities.

Build green; tsc clean.

## 2026-06-21 — Phase 46: agent hub rebuild (HubDetailShell + status simplification)

**Objective**: qiaoxux —「let's rebuild the agent hub now」, two acceptance criteria:
1. My-listings & my-communities reuse the same buyer-facing grid (kill the
   empty-spaces gripe on /dashboard).
2. Click → unified detail shell: hero cover with status pill top-right,
   sticky sub-tabs underneath, inline switching, auto-saved edits.

Plus a status-model simplification: collapse listing's `draft|published|archived`
three-state into Active/Inactive only. Communities gain the same two-state
field. No more PublishPanel block, no more separate publish/archive flows.

**Schema migration (0030_simplify_status.sql)**:
- `listings.status`: backfill `published → active`, `draft|archived → inactive`,
  rewrite check constraint to `('active','inactive')`, default `'inactive'`.
- `communities.status`: new column added, default `'active'`, all existing
  rows backfilled. Buyer-facing RLS unchanged this phase (full visibility
  preserved; future phase can gate `/c/<slug>` on status if owner asks).
- Applied to remote DB via `supabase db push --include-all`.

**Status literal collapse across app/lib (18 files)**:
- `lib/zod/schemas.ts` ListingStatus enum simplified.
- `publish-actions.ts`: `publishListing()` activates, `unpublishListing()`
  deactivates. Names preserved for stable imports.
- `archive-actions.ts`: archive helpers gone — only `deleteListing()` /
  `deleteListingAndRedirect()` remain.
- All buyer-facing reads (browse-cards, communities/list, listing-feed,
  saved-listings, leads/route, search, agent profile, community feed,
  buyer/likes) gate on `status='active'`.
- New listings default to `'inactive'`.
- PublishPanel.tsx deleted (dead after detail-page rebuild).

**New shared components**:
- `app/dashboard/_components/HubDetailShell.tsx` — server component.
  Hero (`max-w-6xl aspect-[5/2] md:aspect-[5/1] sm:rounded-b-xl`, matches
  the canonical community public-page hero from phase 45.28) with optional
  title/subtitle gradient and right-overlay slot. Renders `<HubTabs />`
  underneath.
- `app/dashboard/_components/HubTabs.tsx` — client island. Sticky pill row;
  tab switch is `router.replace('?tab=...', { scroll: false })` so
  there's no server nav and no scroll jump. Active tab shows underline.
- `app/dashboard/_components/StatusPill.tsx` — generic Active/Inactive
  toggle. For listings calls publishListing/unpublishListing; for
  communities takes a `setCommunityStatus` action prop. Calls
  `flushPending()` before activate so EditListingForm debounce can't
  spuriously fail the publish gate. Error popover portalled to
  `document.body` (stacking-context guard, per phase 45.33 lesson).
- `ListingDetailMenu.tsx` / `CommunityDetailMenu.tsx` — three-dot
  overflow with Delete only. Menu sheet portalled to body for the same
  z-40 reason.

**Listing detail rebuild (`/dashboard/listings/[id]/edit`)**:
- Old: long-scroll page with header → PublishPanel → Details → Videos →
  Photos → Social → Tour. Six fully-rendered sections + a status panel
  taking up vertical real estate.
- New: HubDetailShell hero with cover (cover_url → first ready video
  thumb → first photo URL fallback), StatusPill + ⋮ menu top-right.
  Sticky tabs: Details · Media · Social · Tour. Media tab merges Videos
  and Photos panels stacked vertically (no sub-sub-tab — phase 46 design
  decision: less friction beats finer granularity).

**Community detail rebuild (`/dashboard/communities/[id]`)**:
- Same shell. Hero uses the public page's cover-resolution helper
  (`resolveCommunityCoverWithCfIds` + `demoCoverFor`) so the dashboard
  hero exactly matches what the buyer sees on `/c/<slug>`.
- Tabs: Details · Videos · Photos · Cover (Cover only for the creating
  agent). Defaults to Videos because that's why agents come here.
- StatusPill + ⋮ menu only render for the creating agent. Non-creators
  see a read-only Details panel explaining the metadata is owned, but
  can still manage their own videos/photos.
- New `status-actions.ts`: `setCommunityStatus()` and
  `deleteCommunityAction()` server actions, both gated to creator.

**Grid parity with buyer-facing surfaces**:
- `/dashboard` (my listings): removed `max-w-6xl px-3 sm:px-6 py-6 sm:py-8`
  wrapper; `ListingsTabbedList` gutted from 322 → 130 lines (status tabs
  and list view dropped). Single grid matches `/browse`:
  `grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3`,
  `aspect-[3/4]` cards, bottom-gradient overlay, opacity-60 + small
  "Inactive" pill on inactive cards.
- `/dashboard/communities`: already used `CommunityGrid`; just dropped
  the extra `py-*` padding to match `/communities` (`pb-6`).

**Verification**:
- `npx tsc --noEmit` — clean.
- `npx next build` — green; new dashboard listing detail bundle
  26.3kB (was ~12kB pre-46 because we now ship StatusPill/HubTabs
  client-side, but old PublishPanel was bigger).
- Migration applied to remote DB; `supabase migration list --linked`
  shows 0030 present.

**Pitfalls navigated**:
- `flushPending()` before activate — per existing EditListingForm
  contract; without it a fresh price typed seconds ago gets eaten by
  the publish gate.
- StatusPill error popover and detail menus portalled to body. Anything
  rendered inside the hero header sits in BottomNav's z-40 stacking
  context on mobile — without portal escape the menu/popover would be
  capped under feed cards. (Phase 45.33 lesson, codified in
  `references/stacking-context-modal-portal.md`.)
- New listings default to `inactive` — back-compat callers that read
  status===`'published'` were already migrated by 46.2's mechanical
  pass.

## 2026-06-21 — Phase 45.33: fix scrim z-index escape + redesign source picker

**Objective**: qiaoxux 测试 45.32 实装后报两个 bug:
1. 「点击别的地方并没有取消 sheet,并且打开了另一个窗口」— 点 listing
   card 区域的「取消」实际触发了卡片导航
2. 上一版 sheet 视觉太平,4 个白矩形(被 45.32 收敛到 3 个但仍是平按钮)

**Root cause**: `UploadSheet` 的 portal JSX 渲染在 `<UploadFAB>` 内部,而
`<UploadFAB>` 嵌在 `<BottomNav>`(`fixed z-40`)里。`fixed` + `z-index` 会
创建新的 stacking context,所以 sheet 自己的 `z-50` 只在 BottomNav 这个 z-40
盒子内部生效,**全局上整个 sheet 被封顶在 z-40 层**。页面上的 listing card
(在 BottomNav 的 stacking context 之外)即使是 z-auto 也排在 sheet 之上,
点击事件实际命中卡片本身,不是 scrim button。

**Actions**:
- `app/_components/UploadSheet.tsx`:
  - 改用 `createPortal(sheetUI, document.body)` 把 sheet 渲染到 body,
    彻底逃出 BottomNav 的 stacking context。Hidden file inputs 留在原
    组件树(refs 必须共享同一 React tree)。
  - SSR-safe:`useEffect` mount flag + `mounted ?? null` 守门,避免
    `document is undefined` 的 server render 报错。
  - 提升 z-index 到 `z-[80]`(超过现有 LeadModal 的 z-[70]),给上传流
    一个全局最高优先级。
  - Source picker 视觉重做:从 3 行平按钮换成 2 个 icon tile(Album /
    Camera),inline SVG icon + label + hint。删除 Cancel 按钮,改成底
    部 hint「Tap outside to cancel」+ 加深 scrim(`bg-ink/50` + 弱
    blur)+ 入场动画(fade-in scrim + slide-in-from-bottom sheet)。
  - Type-picker(第二步)保留 Listing/Community 两行 + 同样的 hint。

**Decisions**:
- 不改 BottomNav 的 z-40 自己 — 那会影响 sticky/safe-area 行为。Portal
  逃逸是更隔离的修法。
- 不用 `event.stopPropagation` 拦底层卡片 click:scrim 是 `<button>`,
  click event 的 target 就是 button 本身,不存在「穿透」语义,问题
  纯粹是 stacking context 把 scrim 物理排到了卡片之后。修 z-index/
  portal 才是根因修复。

**Verification**:
- `npx tsc --noEmit` clean
- `npm run build` green
- 待 qiaoxux 手机端验证:点击外部 → 只关 sheet,不进卡片;sheet
  视觉是否顺眼

## 2026-06-21 — Phase 45.32: revert fan, simplify to album/camera/cancel

**Objective**: qiaoxux 看完 fan-out 实装后改主意 — "改成之前的 sheet 只
留 Choose from album and Camera and Cancel, 并且点击别的区域会取消,
注意,只是取消但是不会进入别的界面". Two requirements:
1. 退回 bottom sheet 形态(扇形不要)
2. 选项收敛成 3 个:Album / Camera / Cancel(Photo+Video 合并成 Camera)
3. 点击 sheet 外区域只关 sheet,不能触发底层 listing/video 元素

**Actions**:
- `app/_components/UploadSheet.tsx` 重写回 sheet 形态。`open` 重新变成
  `() => void`(扇形 mode 参数移除)。Source picker 3 行:
  `Choose from album` / `Camera` / `Cancel`。
- Photo + Video 合并成 Camera:相机 input 改为 `accept="image/*,video/*"
  capture="environment"`,iOS Safari 在打开相机时让用户选拍照或录像,
  减一个分支。
- `UploadFAB.tsx` / `DesktopSidebar.tsx` 把 `onClick={() => open('xxx')}`
  改回 `onClick={open}`。
- Scrim 行为没变:`<button type="button" onClick={close}>` 全屏 z-50,
  DOM click event 不会穿透到底层元素 — 用户的"点视频不开视频"需求
  已经被原结构满足,不需要额外的 stopPropagation。

**Decisions**:
- Photo + Video → Camera:用户原话只列了 album 和 camera 两个 source,
  说明她要的就是 2 选 1。把 capture input 的 accept 同时收 image+video
  最贴近她的语言。
- 没把扇形 prototype/v2 文件删除 — `public/prototype/` 是 throwaway
  目录,留作历史快照(future "为啥当时没用扇形" 的查询)。
- LSP 报 phantom error 因为缓存了旧 union type;实际 tsc 通过,build
  绿。

**Issues**: 无。Build first try green.

**Verification**: `npm run build` green. Push to main 后人肉验证手机
端 sheet 渲染 + 点击外部不触发底层。

## 2026-06-21 — Phase 45.31: upload source-picker — fan-out radial menu

**Objective**: qiaoxux complaint — the existing 4-button vertical sheet
(Choose from album / Video / Photo / Cancel) "太难看了 而且必须点 Cancel
才能取消". Two issues: visually flat (4 identical rectangles), and the
backdrop tap-to-close worked but had no visual hint so users felt
trapped into hitting Cancel.

**Actions**:
- Wrote `public/prototype/upload-sheet.html` (Current vs A/B/C — iOS
  grouped / icon grid / inline pillbar). User: 都不好.
- Wrote `public/prototype/upload-sheet-v2.html` (3 fan-spread angles:
  180° / 120° / 160° upward arcs). User picked **C** (160° wide upward).
- Reworked `app/_components/UploadSheet.tsx`:
  - Added `open(mode: 'fan' | 'sheet')` parameter.
  - `'fan'` mode renders 3 satellite buttons (Album / Photo / Video)
    fanning out from the FAB at angles 160° / 90° / 20° (offsets
    `(-99,-36)`, `(0,-105)`, `(99,-36)`). Center FAB rotates to ✕ —
    tap ✕ OR scrim closes. No more Cancel row.
  - Stagger animation: each satellite 220ms cubic-bezier ease-out with
    0/60/120ms delays.
  - `'sheet'` mode keeps the original bottom-sheet for desktop sidebar
    "+ New" (no FAB to fan around) and for the type-picker confirmation
    step (Listing / Community after files chosen — a confirmation flow
    with metadata, not suited for radial layout).
- `app/_components/UploadFAB.tsx` — call `open('fan')`.
- `app/_components/DesktopSidebar.tsx` — call `open('sheet')`.

**Decisions**:
- Type-picker stays as bottom sheet, not fan. Reason: it shows
  "N files selected" metadata and is a confirmation step. Fan is for
  source choice (3 equal-weight branches). Mixing layouts per step is
  fine; reuse forces a worse fit.
- Desktop sidebar keeps sheet. Fan-around-FAB pattern doesn't translate
  to a sidebar button.
- Animation uses cubic-bezier(0.34, 1.4, 0.5, 1) for a tiny overshoot
  ("pop" feel) — matches the playful spirit of fan menus.

**Issues**: TypeScript caught two stale `onClick={open}` callsites
(UploadFAB + DesktopSidebar) — handler signature changed from `() =>
void` to `(mode?: 'fan' | 'sheet') => void`, React mouse event signature
incompatible. Fixed with arrow wrappers.

**Verification**: `npm run build` green first try after type fixes.
Will verify Vercel preview before claiming shipped.

**Next steps**: deploy + visual check on phone (Vivian / qiaoxux).
Possible follow-up: swipe-to-dismiss the satellites individually, or
subtle haptic feedback on iOS.

## 2026-06-21 — Phase 45.30: dot + icon + text chip, dropped to 25vh

**Objective**: qiaoxux follow-up on 45.29 — banner cut-edge was too
sharp; final form should be **status-dot + emoji + text** in a soft
squircle (10px radius — "rounded but not too rounded"), and moved
**down to ~1/4 of viewport height** to breathe away from the top
search/title chrome.

**Changes** (both surfaces, identical pattern):
- Position: `top-16` → `top: 25vh` (≈ 25% down the screen).
- Shape: `rounded-md` + clip-path banner-cut → `rounded-[10px]` plain
  squircle. Drops the diagonal cut entirely.
- Prepended a 6px emerald status dot (`bg-emerald-400` + soft glow
  via boxShadow) before the existing emoji + text — reads as a "live
  / active" indicator, gives the chip a wayfinding feel without extra
  text weight.
- Sibling 45.28.6 hero CTA pass landed on these files concurrently
  (sibling subagent `20260621_080328_d88a62`) — re-read before
  patching to avoid stomping each other.

Files: `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx`,
`app/(public)/browse/_components/BrowseFeed.tsx`.

## 2026-06-21 — Phase 45.29: top-left "Live here" banner-cut chip (shape #3)

**Objective**: qiaoxux flagged the top-left community pill on the
community video feed reads chip-y and breaks immersion against the
right-rail circular icons (Like / Save / Contact). Round pill +
round icons = no contrast, but switching the pill to a hard rectangle
felt too abrupt. Wanted a shape that asserts itself differently from
the surrounding chrome without shouting.

**Decision**: ran a 6-shape prototype shootout in
`public/prototype/community-pill-v4.html` (squircle-10, asymmetric tag,
banner cut-edge, half-pill bleeding off-screen, underline-only,
squircle-14 + status dot). qiaoxux picked **shape #3 — banner with
right-side cut-edge** (clip-path polygon, arrow-tip on the right,
6px corner radius). Reads editorial / wayfinding rather than UI chip,
and the diagonal cut visually keys against round icon buttons without
collision.

**Surfaces unified** (same shape on both, only text changes):
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx`: "🏠 N homes
  here ›" → "🏠 Live here" (banner cut, no chevron, no border).
- `app/(public)/browse/_components/BrowseFeed.tsx`: dual-line
  community chip with video count → single-line community name only,
  banner cut applied.

**Material kept**: `bg-ink/65 backdrop-blur-md`, removed the cream
border (was reading as a label outline against the new shape).
Middle title pill (community name · city) and back/share buttons
not touched per scope.

**Prototype lineage**: v1 glass material → v2 rect (rejected: too
square) → v3 immersive title pill (mis-scoped, owner clarified left
button is separate) → v4 shape shootout → shape #3 wins.

## 2026-06-21 — Phase 45.28: community hero immersion pass

**Objective**: qiaoxux owner pass on `/c/[slug]` — reduce friction, make
the page feel as immersive as possible. Three asks: (1) shrink hero
height further, (2) drop the [Community Videos | Active Listings] pill
toggle row since videos are the default, (3) move the active-listings
entry point into the hero itself, bottom-right, renamed from "Active
Listings" to a softer "see homes here…"-style CTA. Owner picked
**"Live here →"** from a 10-option shortlist.
**Actions**:
- New client island `app/(public)/c/[slug]/_components/CommunityBody.tsx`
  takes ownership of both the hero and the body grid (so the CTA can sit
  absolute inside the hero and drive the videos↔listings tab state
  without a route round-trip). Old `CommunityTabs.tsx` deleted.
- Hero aspect: `aspect-[16/7] md:aspect-[21/5]` → `aspect-[5/2]
  md:aspect-[5/1]` (~9% shorter mobile, ~16% shorter desktop).
- Pill toggle row removed. Videos render by default; the grid now butts
  directly against the hero's bottom edge.
- CTA pill `Live here →` placed `absolute right-3 bottom-3 sm:right-4
  sm:bottom-4`, cream background / ink text / shadow-md, only visible
  on the videos tab. Switching to listings hides the CTA and reveals a
  lightweight `← Community videos` text link above the listings grid as
  the return path.
- `page.tsx` reduced to data fetching + prop forwarding (computes
  `heroCoverUrl` once on the server with `demoCoverFor`, passes the
  resolved string in to the client island so we don't ship the
  `resolveCommunityCoverWithCfIds` machinery to the browser).
**Decisions**:
- Considered keeping the hero in `page.tsx` and hosting only the CTA
  inside a tiny client island, but the CTA needs to mutate the same
  state that drives the body's videos/listings switch — splitting the
  hero from that state would force either a URL param round-trip or
  cross-island state plumbing. Folding the hero into the same client
  component is the surgical option.
- "Live here" picked over "See homes here →" / data-driven "N homes
  available →" — the double meaning ("reside here" + "active/live
  listings") fit the immersive-not-utilitarian framing the owner asked
  for, and 4 chars stays out of the way of the hero text on the left.
- Kept `← Community videos` as a plain text link, not a pill — once the
  user has flipped to listings, a second pill in the same place as the
  CTA they just clicked would feel like a tab strip we just deleted.
**Issues / Resolution**: None. tsc clean on first try.
**Learnings**: When a CTA's job is to drive state that lives inside a
sibling component, the cheapest fix is usually to merge the two into
one client island — not to invent a state-sharing layer. The
`page.tsx` stays as a thin server wrapper that just gathers data.
**Next steps**: qiaoxux verifies on Vercel preview. If the CTA's
contrast feels off against light hero photos, drop to ink/cream
inversion or add a stronger backdrop-blur ring.

## 2026-06-21 — Phase 45.27.1: nearby geolocation diagnostics + retry

**Objective**: qiaoxux clicked "Enable location" in the soft prompt and
still landed on the "Enable location access in your browser…" empty
state. Need to (a) figure out *why* — was it timeout, hard deny, or
sticky-deny from a prior test session? — and (b) give a retry path so
the user isn't stuck.
**Actions**: `app/(public)/nearby/NearbyClient.tsx` —
- Added `geoError` state holding `denied | timeout | unavailable | unsupported | unknown`.
- `getCurrentPosition` error handler now reads `err.code` (1/2/3) and
  records the reason instead of dropping it.
- Bumped timeout 8s → 30s, added `maximumAge: 60_000` so a recent fix
  is reused inside a minute (avoids a second permission round-trip
  during dev iteration).
- Empty state now branches per reason: hard `denied` tells the user to
  open lock-icon site settings (no Try again button — browser permission
  is sticky and re-firing `getCurrentPosition` does nothing); `timeout`
  / `unavailable` / `unknown` get a Try again button that re-fires the
  request from a user gesture.
**Decisions**: Did not switch to the Permissions API to pre-check state.
The native dialog only fires from a user gesture (the "Enable" button
click), so a passive permission check would just duplicate logic.
The localStorage `nearby_geo_prompted` flag stays set on the first
"Enable" click — we don't re-show the soft prompt on retry, only the
inline empty-state retry button.
**Issues**: Hit Rules of Hooks again — initial patch put
`handleRetryGeolocation = useCallback(...)` between the showSoftPrompt
early-return and the geoDenied early-return. Moved it next to the other
handlers above all returns; tsc clean.
**Learnings**: Geolocation fail modes are user-actionable but only if
the UI tells them which one happened. "Click Enable, get told to
'enable location' anyway" is the worst possible loop — silent
swallowing of `err.code` is what produced it.
**Next steps**: qiaoxux re-tests on Vercel preview. If the retry button
still leaves her stuck, the message will at least show `denied` /
`timeout` / `unavailable` so we can debug.

## 2026-06-21 — Phase 45.27: First-visit geolocation soft prompt on /nearby

**Objective**: Stop the bare browser geolocation dialog from appearing the
moment someone opens /nearby. Without context, qiaoxux flagged that users
reflexively deny.
**Actions**: `app/(public)/nearby/NearbyClient.tsx` — added
`vicinity:nearby_geo_prompted` localStorage flag, `showSoftPrompt` state,
extracted `requestGeolocation` into a `useCallback` so it can be invoked
both on mount and from the dialog's "Enable location" button. Added a
modal (`role="dialog"`, `bg-surface` card, ink/ink2 typography) explaining
why we ask and what we do with the data. Two actions: "Enable location"
(sets flag, calls `getCurrentPosition` → native prompt fires from a user
gesture) and "Not now" (sets flag, falls through to existing geoDenied
empty state).
**Decisions**: Soft prompt fires once per browser (flag set on either
action). Subsequent visits skip the modal and call geolocation directly
— the OS/browser remembers the actual permission, so re-asking would be
nagware. Kept the existing geoDenied copy unchanged. Did NOT add a "ask
again" button — if the user wants to re-grant, they do it via the
browser's site permissions UI.
**Issues**: First patch put the modal early-return between hooks, breaking
Rules of Hooks. Moved it after every useCallback/useEffect; tsc clean.
**Learnings**: Conditional early returns in client components have to live
*after* every hook declaration. `replace_all` on a duplicated block is
not a substitute for re-reading the file.
**Next steps**: Push, verify on Vercel preview that (a) fresh incognito
shows the soft prompt before the OS dialog, (b) clicking "Enable" still
triggers the native geolocation prompt as a user gesture, (c) reload
after either choice goes straight to results / empty state.

## 2026-06-21 — Phase 45.26: TikTok-density grid view (overlay variant D)

**Objective**: owner referenced TikTok's Community feed and asked for grid pages to feel more immersive — cover takes more space, less empty whitespace between feeds, all caption text on one line so a touch over 2 rows fits per screen (gesture affordance for swipe). Two prototype rounds: v1 (A/B/C) cut fields and was rejected ("保留 价 房型 大小 和 地址"); v2 (D/E/F) kept all 4 fields with three cover-density gradients. Owner picked **D** (cover 100% with bottom gradient scrim and overlaid caption).

**Actions**:

- `app/(public)/browse/page.tsx` — replaced caption-below-cover layout with overlay D. Cover is full card; gradient scrim `bg-gradient-to-t from-black/80 via-black/40 to-transparent` covers the bottom 60%; price (15px serif), specs (`X bd · Y ba · Z sqft` joined into one line via `[...].filter(Boolean).join(' · ')`), and address sit on the scrim. Grid gap dropped from `gap-x-3 gap-y-8 md:gap-x-5 md:gap-y-12` (12/32px → 20/48px) to `gap-x-1 gap-y-2 md:gap-x-1.5 md:gap-y-3` (4/8px → 6/12px).
- `app/(public)/nearby/NearbyClient.tsx` — same edit + the existing distance pill stays at top-left (above the bottom scrim).
- `app/(public)/saved/_components/SavedClient.tsx` — both the listings sub-grid and the communities sub-grid get the overlay; community variant shows `name` + `city, state`.
- `app/_components/CommunityGrid.tsx` (shared by Explore + saved + community-search results) — overlay with name + location.
- `app/(public)/c/[slug]/_components/CommunityTabs.tsx` — both `aspect-square` sub-grids (videos with category label/blurb, listings with price/specs/address) migrated.
- `app/(public)/search/page.tsx` ListingCard — same overlay; the wrapping grid `<div>` also got the new gap classes.
- `app/dashboard/_components/ListingsTabbedList.tsx` — agent-facing dashboard grid; the `StatusBadge` (top-right) gets `z-10` so it stays above the gradient scrim.
- Skeletons: `app/(public)/c/[slug]/loading.tsx` (already 3:4) and the four `9/16` rounded skeletons (`browse/saved/nearby/communities` `loading.tsx`) updated to `aspect-[3/4]` with the new gap and no text-bar children — caption is now overlaid so the skeleton-vs-loaded transition has no layout shift.
- `public/prototype/grid-tiktok.html` (v1 A/B/C) and `public/prototype/grid-tiktok-v2.html` (v2 D/E/F) used for the two sign-off rounds; left in `public/prototype/` per visual-prototype-workflow ("don't delete after merge — they double as institutional memory").

**Decisions**:

- **Overlay over caption-below.** Owner explicitly asked for "more immersive" + "all text in one line" — D maximises cover real estate (100%) and lets the caption sit on the image like TikTok. v1's options that dropped fields were rejected; the constraint was always "keep all 4 fields", and overlay was the only way to keep them while expanding the cover.
- **Specs on one line via `filter(Boolean).join(' · ')`.** The previous `<span> · ` chain produced inconsistent leading dots when `beds` was null and `baths` wasn't. The join idiom keeps the separator clean regardless of which fields are present, and matches the prototype.
- **Did not extract a shared `ListingCard` component.** Each grid has slightly different fields (community vs listing vs video, distance pill vs status badge vs nothing) and a shared component would need a half-dozen optional props. Same overlay markup is now repeated in ~6 places; if drift becomes a problem next phase the consolidation is mechanical (overlay block is identical text-byte-for-byte across files now).
- **Kept `aspect-square` for community videos.** The 1:1 frame is intentional — videos are recorded portrait but the category cards on `/c/[slug]` are a square mosaic by design (phase 45.10 decision). Only the gap / overlay changed.

**Verification**: `npx tsc --noEmit` clean. Visual sign-off via the v2 prototype on Vercel; D selected.

**Learnings**:

- When a redesign touches N grid pages that share a class string but not a component, doing the prototype round in `public/prototype/*.html` pays off twice: once for the design pick (D vs E vs F) and once as a literal copy-paste reference while editing the N call sites — the prototype's overlay block became the canonical snippet pasted into all 6 grids.
- Skeletons need to match the new layout, not just the new gap. Leaving the old `text-bar` children in skeletons would produce a layout shift when the real grid (which now has zero below-image content) replaces them.

**Next steps**: Owner to test on the Vercel deploy. If overlay legibility on light-cover photos is a problem, the scrim opacity (`from-black/80`) is the single knob to bump.

## 2026-06-21 — Phase 45.25: Drop manual lat/lng input fallback on geolocation deny

**Objective**: owner reported that when a user blocks browser geolocation, both `/browse/nearby` and `/communities/nearby` rendered an input box asking the user to type their latitude/longitude. Owner: "it is very stupid" — show empty result instead.

**Actions**:

- `app/(public)/nearby/NearbyClient.tsx` — removed `manualLat`, `manualLng`, `needsManual` state + the `applyManual()` handler + the input-box JSX block. Renamed remaining flag to `geoDenied`. On geo denied / unavailable, render a single-line empty state: "Enable location access in your browser to see listings near you."
- `app/(public)/communities/nearby/CommunitiesNearbyClient.tsx` — same edits applied; copy reads "…communities near you."

**Decisions**:

- Did NOT add a `/profile`-Preferences-style fallback location picker. Owner's request was specifically to show empty, not to migrate the input elsewhere. Out of scope.
- Kept `geoDenied` as a separate boolean (not folded into the no-coords branch) so the "Reading your location…" loading state still wins when geolocation is genuinely in-flight; only after the API errors out do we switch to the empty CTA.

**Verification**: `npx tsc --noEmit` clean. Visual sign-off via Vercel preview on `phase45.25/nearby-empty-on-deny`.

## 2026-06-21 — Phase 45.24: Full-screen feed on mobile Safari + remove swipe hints

**Objective**: owner reported (with iPhone screenshot of `/v/<agent>/<listing>`) that the feed wasn't using the full screen and asked to remove the "Swipe up for more" copy on the listing/explore feed and the "← swipe →" hint on community-videos carousels.

**Actions**:

- `app/(public)/_components/feed/constants.ts` — `FEED_FRAME_CLASS` switched from `h-screen` / `100vh` to `h-[100dvh]` and the desktop 9:16 column math from `100vh*9/16` to `100dvh*9/16`. Updated comment on `FEED_VSCROLL_CLASS` to note children should also be `h-[100dvh]`.
- `app/(public)/browse/_components/BrowseFeed.tsx` — both card containers (PhotoCard `<section>` and Card `<section>`) switched from `h-screen` to `h-[100dvh]`. Removed the `activeIndex === 0 && activeSource === 'hero'` "Swipe up for more" overlay (replaced with a comment block).
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx` — card `<section>` switched from `h-screen` to `h-[100dvh]`.
- `app/(public)/browse/_components/CommunityCarousel.tsx` — removed "← swipe →" hint pill on the community-videos horizontal carousel.
- `app/(public)/c/[slug]/feed/_components/CommunityListingCarousel.tsx` — removed "← swipe →" hint pill on the community → listing carousel.

**Decisions**:

