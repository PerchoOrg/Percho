# Phase 34 — Community UX overhaul (split plan)

**Created**: 2026-06-16
**Owner**: Tianrou (PM/approver) · Hermes (spec) · Claude Code (impl)
**Source**: 8-item priority list locked by Tianrou (item #1 dropped — not a bug).

---

## Why split

7 remaining items cross 3 different change surfaces (data, buyer UX, agent/author UX) with serial dependencies (chip in 34b needs geo-attribution from 34a). One mega-phase = 2-3 weeks, deploy noise, hard to roll back, and #3 blocks #4. Splitting lets buyer-visible work ship in 34b without waiting for the heavy author-side rework in 34c.

---

## Phase 34a · Foundation (CURRENT)

**Branch**: `phase34a/foundation`
**Goal**: Ship the invisible plumbing + global hygiene that everything else depends on. Nothing flashy; user shouldn't see a "new feature" — they should see "things feel right".

| # | Item | Type | Notes |
|---|---|---|---|
| 3 | Listing video → community auto-attribution by geo | data flow | Backfill + insert-time trigger. Required before 34b A1 chip. |
| 6 | Nav: cut tabs + dedupe Public Profile | IA | Audit current tabs, propose minimal set, remove duplicates. |
| 7 | Default sound on, remove top mute toggle | default | TikTok-style: autoplay with sound; per-video mute via tap on video. |
| 8 | Site-wide font / touch-target audit | hygiene | 44×44 min touch target, font scale review. |

**Acceptance**: tsc + build green; Journey-A+B (from 34b spec) **playable end-to-end** because every listing now has a community attached; nav is one fewer tab; videos start with sound.

**Spec file**: `UX_AUDIT_34a.md` (next).

---

## Phase 34b · Buyer experience (NEXT)

**Branch**: `phase34b/buyer-community-ux`
**Goal**: Ship Scenario A + B per locked V1 prototype.

| # | Item | Type | Notes |
|---|---|---|---|
| 4 | Listing + Community chip + bottom sheet (Scenario A) | new interaction | Per V1 prototype; 5-video sheet, L2 horizontal carousel, auto-advance. |
| — | Scenario B: `/browse/` segmented control `Homes / Communities` | new interaction | Selected A: extend existing `/browse/`, NOT new `/search/`. NO `Agents` tab (product doesn't have agent search). |

**Locked decisions** (D-list from earlier review, minus the agent-tab bug):
- D1 Build both A and B
- D2 A=passive (anchored to listing), B=active (browsing by area)
- D3 A's chip → sheet (5 community videos) → L2 horizontal carousel; **no listings in A's sheet**
- D4 *(REVISED)* B's `/browse/` adds segmented control `Homes / Communities`; tap a Communities card → vertical community video feed; each community video has `🏠 N homes here` chip → bottom sheet of listings → tap → L3 horizontal listing carousel
- D5 L2 auto-advance on video end, stop at boundary, no loop
- D6 Chip label = literal community name
- D7 B entry segmented label = `Communities`
- D9 `/c/[slug]/feed` stays as deep-link route
- D10 Reuse `saved_<entity>`, `community_video_membership`, `--brand: cyan`
- D8 *(MOVED to 34c)* — agent dashboard work belongs in author phase

**Spec file**: `UX_AUDIT_34b.md` (after 34a ships).

---

## Phase 34c · Agent + Author tools

**Branch**: `phase34c/author-tools`
**Goal**: Make life sane for agents creating + managing community content.

| # | Item | Type | Notes |
|---|---|---|---|
| 2 | Agent community dashboard (video grid + stats) | rebuild | Proper grid, view counts, completion rate, listings under each community |
| 5 | Create Community: 3-step wizard | rebuild | Slash 20-field form to 3 screens, Airbnb-host-onboarding style |
| — | (D8 from 34b) Show others' listings in community panel + `All / Mine only` filter | feature | Default = `All`, persist per device |

**Spec file**: `UX_AUDIT_34c.md` (after 34b ships).

---

## Benchmarks (apply across all 3 phases)

| Layer | Reference | What to copy |
|---|---|---|
| Buyer main flow | TikTok | Autoplay on launch, zero buttons to start consuming |
| Listing detail | Zillow mobile | Core info on first screen, metadata folded |
| Agent onboarding | Airbnb host | Multi-step wizard, 1-2 questions per screen, save draft |
| Minimal nav | Linear | Smallest visual surface for complex functionality |

---

## Order of execution

1. **34a** (now) — `phase34a/foundation` branch, ff to main when verified
2. **34b** — open after 34a merged
3. **34c** — open after 34b merged

Each phase: phase branch only, no per-task branch (CLAUDE.md §2.1.3). I (Hermes) write the narrow spec, delegate to Claude Code, review diff, ff to main.

---

## Status

- [x] Plan recorded
- [ ] Phase 34a spec written
- [ ] Phase 34a implemented
- [ ] Phase 34a ff to main
- [ ] Phase 34b spec
- [ ] Phase 34b impl
- [ ] Phase 34b ff
- [ ] Phase 34c spec
- [ ] Phase 34c impl
- [ ] Phase 34c ff
