# Percho ReelEstate UI rewrite — progress summary

**Branch**: `feat/reelestate-ui-rewrite` (unmerged, awaiting owner review)
**Spec**: `docs/design/reelestate-teardown/README.md` (single source of truth)
**Plan / audit log**: `.cron-plan.md` (per-tick history)
**Screenshots**: `progress/` — 22 PNGs, 11 routes × 2 viewports (iPhone SE 390×844 + Pro Max 430×932)
**Positioning**: US agent-only, GA/Atlanta seed market, community = neighborhood vibe, photo→video pipeline (memory wins vs CLAUDE.md, per plan rule §9)

All changes are UI-only under `app/(mobile)/`, `components/reelestate/`, `lib/mobile/`, and `tailwind.config.ts`. No schema changes, no writes to `render-worker/`, `scripts/poi-*.py`, or `content-pipeline/`. No mock/seed/demo data — every list, tile, header, and CTA reads real Supabase rows via `createAnonClient` + `unstable_cache` per the `supabase-rsc-perf-playbook` skill.

---

## What is shipped (mergeable as-is, pending review)

### Phase 0 — Foundation
- **P0.1** — `tailwind.config.ts` extended with the dark palette (bg/surface, cyan/blue/magenta/purple accents, status colors), gradients, glow shadow utilities, radii, and chip letter-spacing. Legacy Aman aliases preserved so existing `app/` chrome doesn't regress. — ref: README §1.
- **P0.2** — `app/(mobile)/` route group with a dark shell, safe-area insets, and a no-op bottom-nav placeholder (later replaced by Z7.1). — ref: README §1.

### Phase 1 — Reel Feed hero (`/feed`)
- **F1.1** — `<ReelFeed>` container with full-viewport vertical scroll-snap, Suspense skeleton, and a real Supabase active-listings fetch (limit 5, newest first). — ref: README §2.1.
- **F1.2** — `<ReelCard>` layout: `object-contain` cover, price chip top-left, agent chip top-right, address block bottom-left, action-rail slot on the right. — ref: README §2.1.
- **F1.3** — `<ReelActionRail>` (like / comment / share / save) wired to real Supabase toggles (`toggleLike`, `saveListing`) with `listing_like_counts` / `saved_listing_counts` aggregates and device-id hydrate on mount; comment slot is a reserved no-op (see "Stubbed" below). — ref: README §2.1.
- **F1.4** — Canonical 26/13/13/13 caption line-heights, memory §74.14 preferred over the README 19/15/14 sketch (plan rule §9 — memory wins). — ref: README §2.1.

### Phase 2 — Property Detail (`/listings/[id]`)
- **D2.1** — RSC page + `fetchMobileListing` (`unstable_cache` 60s, `MOBILE_LISTING_TAG`, active listing + agent join + ordered `listing_photos`). — ref: README §2.3.
- **D2.2** — `<PhotoGallery>` client: snap-x mandatory strip, IntersectionObserver dot indicator, `object-contain` letterbox, single-photo and zero-photo paths self-guard. — ref: README §2.3.
- **D2.3** — Shared `formatPrice` K/M helper in `lib/format/price.ts`; canonical `{street}, {city}, {state}${zip?' '+zip:''}` address format. — ref: README §2.3.
- **D2.4** — `<SpecsAndDescription>` client: dot-separated bd/ba/sqft row + 3-line clamped description with Read more / Read less accordion, empty-state self-guarding. — ref: README §2.3.
- **D2.5** — `<AgentCard>`: gradient-ring avatar, name + brokerage, Message / Call / Save CTA row with real save wiring. — ref: README §2.3.

### Phase 3 — Properties List (`/listings`)
- **L3.1** — 2-col grid, real `fetchMobileListings` (`unstable_cache` 60s, active RLS, limit 30). Rounded surface cards, 4:5 cover, cyan K/M price, canonical address, empty-state string (no seed). — ref: README §2.2.
- **L3.2** — `<ListingsFilterBar>` sticky Price / Beds / Community pill chips (visual only; inert server-component buttons, no popovers). — ref: README §2.2.
- **L3.3** — Grid caption typography adopts the 15/11/11 canonical rig (memory §74.14). — ref: README §2.2.

### Phase 4 — Agent Profile (`/agents/[handle]`)
- **A4.1** — RSC page + `fetchMobileAgent` (`unstable_cache` 60s, `MOBILE_AGENT_TAG`, public agent RLS). 88px gradient-ring avatar (initial fallback), name, brokerage, bio. — ref: README §2.5.
- **A4.2** — `<AgentProfileTabs>` client: Reels | Properties tab bar, 2-col grid per tab, canonical 15/11/11 caption rig, cyan Reel badge on video-backed covers. — ref: README §2.5.
- **A4.3** — `<AgentContactCTAs>` client: Message / Call / Website 3-pill row (disabled-pill when `phone` / `website` null) + inline `<VerifiedBadge>`. `website` and `verified` columns are absent on `agents` today — added as optional `MobileAgent` fields but not `SELECT`ed and no mock defaults, so both stay dormant until owner ships the schema change (CLAUDE.md §8). — ref: README §2.5.

### Phase 6 — Create flows (`/create`)
- **C6.1** — Create Reel step 1: source picker (auto-generate from listing photos [cyan default per Percho photo→video pipeline] / upload custom video). Next pill disabled until a source is picked. No upload wiring. — ref: README §2.8.
- **C6.2** — Create Reel step 2: caption + tag chips (Enter/comma commit, 8-tag cap) + inert Original-audio music slot placeholder. Publish pill enabled once caption is non-whitespace, but non-functional. — ref: README §2.8.
- **C6.3** — Create Property step 1: MLS Import card (orange accent per README §2.9, inline arbitrary-value shadow — one-off, no shared token) + "Enter manually" secondary link. — ref: README §2.9.
- **C6.4** — Create Property steps 2–5 stub screens (details / photos / description / review-publish), each via `<CreatePropertyStepStub>` + `<CreatePropertyWizardHeader>` (Back chevron, Reel|Property sub-tabs, 5-step tracker). `?mode=mls|manual` threads through so Back round-trips. — ref: README §2.9.

### Phase 7 — Polish + Deploy prep
- **Z7.1** — Global `<MobileBottomNav>`: 4 slots (Feed / Explore / Messages / Profile) with lucide icons, uppercase tracking-chip labels, `usePathname()` prefix-match active state (cyan-300 glow). Only Feed is a real Link today — Explore / Messages / Profile render as `aria-disabled` inert spans until their routes ship, so no 404 traps in dev. — ref: README §1 + §2 nav.
- **Z7.2** — 22 screenshots captured via Playwright chromium against `pnpm dev` on `:3123`, using a real active listing + agent slug. Both viewports (iPhone SE 390×844, Pro Max 430×932). Skipped `/messages` (blocked). Files under `progress/`.
- **Z7.3** — This document.

---

## What is blocked (needs owner input before UI can land)

### Messages inbox — Phase 5 (M5.1, M5.3)
- **Status**: `[x-blocked]` after two attempts (plan rule §9: same-class error 2× → skip).
- **Root cause**: no `threads` / `conversations` / `messages` table exists in Supabase. Only `leads` (agent-inbound inquiry form on listing detail) is present across 50 migrations. There is no buyer↔agent chat table with buyer_id / agent_id / listing_id / body / read_at / realtime + RLS.
- **Why UI can't ship**: rules §5 forbids mock/seed rows; rendering a card list against a nonexistent table would 404 or require fixture data. `/messages/[threadId]` has no id space to key on, no peer identity to render, no rows for the scroll region.
- **Owner action needed** (CLAUDE.md §8 reserves schema decisions for the owner):
  1. Approve a `threads` + `messages` schema (or an alternative name/shape).
  2. Sign off on RLS: buyer sees their own threads, agent sees threads addressed to them, listing_id optional pin.
  3. Decide whether realtime (Supabase channels) is v1 or v2.
- Once merged, M5.1 (inbox list) and M5.3 (thread page shell) are ~1 tick each. `<PropertyPill>` (M5.2, already shipped) is drop-in for message-embed rendering.

### Bottom nav 5-slot final selection
- Currently 4 slots (Feed / Explore / Messages / Profile) — placeholder per plan Off-limits list.
- Owner to decide the 5th slot (Create? Circles? Notifications?) and whether Create is a center FAB vs a slot.

### Circles internal UI (§2.10)
- Off-limits per plan — voting UI needs original design, owner to draft. No skeleton committed.

### "For Rent" mode toggle
- Off-limits per plan — may or may not ship in v1. No code changes.

### Rename Circles → Percho name
- `Circles` is still the string constant. Awaiting owner rename.

---

## What is stubbed / pre-wired-but-not-functional (safe to merge, needs follow-up)

These are intentional UI-first stubs. Each is wired to the right URL / disabled-pill shape so a follow-up tick can drop in the real handler without a re-layout.

- **Reel comments** — `<ReelActionRail>` comment button is a reserved no-op. No `comments` table exists yet (schema decision).
- **Create Reel Next / Publish** — routes to `/create/reel/step-2` and `/create/reel/step-2?source=…` but Publish (step 2) does not persist. Upload wiring is deferred (Cloudflare Stream TUS create endpoint is in `render-worker/`, off-limits per rules §7).
- **Create Property MLS Import + Manual Entry** — cards route to `/create/property/step-2?mode=mls|manual` stubs (C6.4). No MLS ingest, no manual-entry form fields, no persistence.
- **Create Property Publish (step 5)** — terminal pill routes to `/listings`, no insert (CLAUDE.md §8 data-write surface deferred to owner).
- **Bottom nav Explore / Messages / Profile** — inert `aria-disabled` spans until routes ship.
- **Agent Message CTA** — links to `/messages/new?agent=<slug>` (route doesn't exist yet — same M5 schema gap).
- **Agent Call CTA** — real `tel:` link when `agents.phone` present, disabled-pill when null.
- **Agent Website / Verified badge** — dormant until `agents.website` + `agents.verified` columns land.
- **Listings filter bar (L3.2)** — visual only; no filter state, no popovers, no URL params.

No mock data, no seed rows, no `TODO placeholder` strings anywhere in the branch (grep clean).

---

## Deviations from README spec (memory wins per plan rule §9)

- **Caption line-heights** — README §2.1 sketched 19/15/14 for the reel caption; memory §74.14 canonical is 26/13/13/13 (price/spec/address). Applied to both `<ReelCard>` (F1.4) and the listings grid tile (L3.3, 15/11/11 variant).
- **Address format** — README variants collapsed to memory-canonical `{street}, {city}, {state}${zip?' '+zip:''}` everywhere (`<ReelCard>`, D2.3 header, agent tile, `<PropertyPill>`).
- **Price format** — memory K/M compressed variant via shared `lib/format/price.ts`; no per-component reformatting.
- **Create Reel source options** — reelestate's cold-start "choose property" carousel replaced with a "Auto-generate from listing photos" cyan default option to match Percho's photo→video pipeline positioning (README §0). "Upload custom video" retained as the secondary path.

---

## Merge readiness checklist

- [x] Every task is a single commit prefixed `[reelestate-ui]` with `ref: README §X.Y` in the body.
- [x] Every commit passes `pnpm tsc --noEmit` at HEAD (recorded in each tick log entry).
- [x] Zero mock / seed / demo data — all lists read real Supabase rows via `createAnonClient` + `unstable_cache`.
- [x] Zero video files committed (`git status` clean; `*.mp4/mov/webm/mkv` gitignored).
- [x] Zero touches to off-limits paths (`render-worker/`, `scripts/poi-*.py`, `content-pipeline/`).
- [x] English-only UI / schema / vars (no `_zh` fields).
- [x] Branch never merged, never pushed by the agent — owner does the push + review.

---

## Recommended next moves for the owner

1. **Unblock M5** — decide the messages schema (see "Blocked" above). Two ticks will finish the inbox + thread shell.
2. **Confirm the 5th nav slot** so Z7.1 can graduate from placeholder to final.
3. **Optional schema follow-ups** that would light up already-shipped UI:
   - `agents.website text null`
   - `agents.verified boolean not null default false`
   - `listing_comments` (or reuse `leads` shape) to activate the reel comment count.
4. **Review the 22 screenshots** in `progress/` for visual acceptance before merge.
5. **Merge to `main`** — no rebase surprises expected; branch is clean-linear off `main`.
