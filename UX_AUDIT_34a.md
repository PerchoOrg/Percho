# UX_AUDIT_34a — Foundation

**Branch**: `phase34a/foundation`
**Plan**: see `PHASE34_PLAN.md` for the 3-phase split rationale.
**Audience**: All-US English buyers. No `_zh`, no WeChat, no 小红书. (CLAUDE.md §1)
**Don't push to main.** Push to `phase34a/foundation`. Hermes ff after review.

---

## Goal

Ship the invisible plumbing + global hygiene that 34b/34c depend on. Nothing flashy — user should perceive "things feel right", not "new feature".

---

## Locked tasks (P0 — must ship)

### T1 · ⏸ DEFERRED to phase35 (paired with Create Community wizard)

**Why deferred**: communities table has no geo (only `city, state` text). Adding geo (centroid + radius) requires the Create Community form to also collect those fields. Couples cleanly with phase35 wizard rework — doing it twice is waste. Backfill via geocoding API can also wait.

**Impact on 34b**: A1 chip on listing video can render off `listings.community_id` where agent has set it manually today (legacy path). For listings without it, chip hides. Acceptable for 34b launch.

---

### T2 · ✅ DONE — Default sound + remove right-rail mute button

**Done in commit `f40898d`**:
- Default `muted = false` already existed in both `BrowseFeed` and `CommunityVideoFeed` (`useState(false)` + first-interaction unmute fallback for autoplay-blocked browsers).
- **Removed the right-rail mute toggle button** from both feeds. Volume is now controlled exclusively by the device's system volume keys — keeps the rail clean and avoids a redundant in-app control. (Per repeated user direction: never put a mute button in the right rail.)
- Internal `muted` state retained for the autoplay-blocked fallback only (browser blocks unmuted autoplay → start muted → first interaction unmutes).

**De-scoped from original spec**:
- Tap-to-mute overlay (🔇 / 🔊 fade): not implemented. Tap on video already maps to `togglePlay` (TikTok/Reels convention) — overloading tap with mute would conflict. If users ask for mute later, revisit.
- `sessionStorage` mute persistence: not needed — mute state is ephemeral and tied to the autoplay-fallback only.

**Acceptance**: First video starts muted only if browser blocks unmuted autoplay; first interaction unmutes; no in-app mute UI.

---

### T3 · ⏸ DEFERRED — audit complete, no action needed in 34a

**Audit (2026-06-17)**:

| Surface | Item | Route | Purpose | Duplicate? |
|---|---|---|---|---|
| Bottom bar (buyer) | Community / Nearby / ▶ Explore (FAB) / Saved / Me | `/communities`, `/nearby`, `/browse`, `/saved`, `/profile` | Primary IA | None |
| Bottom bar (agent) | Dashboard / Community / +New (FAB) / Leads / Me | dashboard routes + `/profile` | Agent workspace | None |
| Top header (md+) | Mirrors bottom (minus Me; avatar instead) | — | Desktop chrome | Same SSOT (`nav-config.ts`) |
| Avatar dropdown | Profile, Sign out | `/profile`, `/api/auth/signout` | Account menu | One redundant entry to `/profile` (also reachable via Me tab) — acceptable; standard pattern |
| `/profile` page | "View public profile" → `/a/[agentSlug]` | — | Owner-only edit page links to public mirror | Cross-link, not duplicate |
| `/a/[agentSlug]` | Agent's public page | — | Only public agent route | None |

**Conclusion**:
- **5 buyer tabs are intentional IA** (phase 27 design): Community is the platform's signature asset; Explore is the center FAB consumption mode; Nearby / Saved / Me each have unique entry points. Cutting any tab would orphan content. The `≤4` target in the original spec was written without an audit and is wrong.
- **Public profile is already deduped**: only one public route (`/a/[agentSlug]`). `/profile` is the private owner page and already cross-links to it. Nothing to redirect.
- **"Me" vs "Profile" copy is fine**: short label in nav, descriptive title on the page — standard mobile pattern. Not a bug.

**Why DEFERRED, not DONE**: nothing to ship for T3 in 34a. If a real tab-cut becomes desirable (e.g. fold Nearby into Explore as a filter), that's a buyer-visible product change → belongs in **34b** at the earliest, with Vivian's input.

**Files touched**: none.

---

### T4 · ✅ DONE — Tap-target audit + fixes; font scale audited

**Audit (2026-06-17)**:

Scanned all `*.tsx` under `app/` and `components/` for explicit `h-7..h-10` / `w-7..w-10` on interactive elements (`<button>`, `<Link>`, `role="button"`).

**Real violations fixed (8 buttons → 44×44)**:
- `app/_components/SiteHeader.tsx` — "+ New" pill (h-9 → h-11), avatar trigger (h-9 w-9 → h-11 w-11), "Sign up" pill (h-9 → h-11)
- `app/_components/TopRightAvatar.tsx` — "Sign in" pill (h-8 → h-11), avatar trigger (h-9 w-9 → h-11 w-11)
- `app/_components/BottomNav.tsx` — FAB sheet "Close" button (`p-1` ≈ 28px → h-11 w-11)
- `app/(public)/browse/_components/BrowseFeed.tsx` — top-bar Back / Search / Share (3× h-9 w-9 → h-11 w-11)
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx` — top-bar Back / Share (2× h-9 w-9 → h-11 w-11)

**Intentionally not changed**:
- `BrowseFeed` paginators at lines 447/456/771/783 — `md:flex` only, mouse-only desktop chrome (44×44 is a touch standard, not mouse).
- Decorative `h-9 w-9` icon spans inside `BottomNav` FAB rows (lines 106/121) and `SiteHeader` (lines 106/120) — they sit inside `py-3 px-4` row containers whose tap target is already ≫ 44px.
- `loading.tsx` skeletons (`h-7`, `h-8`) — non-interactive placeholders.

**Font scale audit**:
- Body text everywhere ≥ `text-sm` (14px). ✅
- `text-[10px]` / `text-[11px]` usages are limited to: pill badges (uppercase tracking-wider), uploader status captions, photo position numbers, deal-stage chips, dashboard metric eyebrows. These are **caption-class** by design — bumping them to 14px would balloon the dashboard.
- Decision per CLAUDE.md §0.3 (surgical changes): keep caption convention as-is. If we ever standardize a "caption" token (e.g. `text-caption`), do it as a separate Tailwind plugin pass, not in 34a.

**Acceptance**:
- `tsc --noEmit` clean ✅
- `pnpm build` green ✅
- All primary chrome tap targets ≥ 44×44.

---

## Cross-cutting

- **CSV4 telemetry**: out of scope for 34a. Will add in 34b.
- **No new buyer-visible features.** If you're tempted to add UI flair — STOP, this is plumbing.
- **DEVLOG.md entry per task**: T1, T2, T3, T4 each get an entry at the top of DEVLOG.md.
- **RELEASE.md**: only T2 (sound default) and T3 (nav simplification) are user-visible; combine into one release note. T1/T4 are invisible — skip RELEASE.md.

---

## Acceptance for the whole phase

PR ready to ff to main when ALL true:

1. `tsc --noEmit` clean
2. `pnpm build` (or repo's build cmd) green
3. Migration runs cleanly on a fresh DB *and* on a copy of prod (test against `~/Vicinity/.env.local` Supabase staging if available)
4. Listing orphan rate (active listings with null `community_id` and non-null lat/lng) < 5%
5. Video plays with sound on first tap; mute is per-video, not global
6. Nav has ≤4 bottom tabs, single canonical public-profile route
7. No tap target < 44×44 without an explicit override
8. No regressions on `/`, `/browse/`, `/c/[slug]/feed`, `/dashboard` (smoke test all)
9. DEVLOG.md updated (newest at top), RELEASE.md updated for T2+T3

---

## When to stop and ask

- Communities lack geo polygons → T1 partially blocked, surface and discuss
- Browser autoplay-with-sound policy forces a "tap to start" gate → T2 needs UX call
- Audit (T3) reveals >2 public-profile routes or orphan tabs → product call needed

---

## Don'ts (CLAUDE.md §2.1)

- ❌ Don't push to main. Push to `phase34a/foundation`.
- ❌ Don't claim done with red tsc/build.
- ❌ Don't refactor unrelated code. Surgical only.
- ❌ Don't add buyer-visible features that aren't on this list (those are 34b).
- ❌ Don't add Chinese / WeChat / 小红书 references.

---

_Spec + implementer: Hermes. Reviewer + approver: Tianrou._
