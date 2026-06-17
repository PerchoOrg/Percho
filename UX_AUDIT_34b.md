# UX_AUDIT_34b — Buyer experience (Scenario A + B)

**Branch**: `phase34b/buyer-experience`
**Source of truth**: `public/prototype/v2/index.html` (the simplified version Tianrou reviewed and approved 2026-06-17 — "v2 改动:砍掉所有 bottom sheet 中间页;chip 点了直接进上下滑 feed").
**Conflict note**: `PHASE34_PLAN.md` D3/D4 (written before v2 prototype) say "chip → bottom sheet → L2 horizontal carousel". v2 prototype kills the sheet — chip goes **straight into a vertical-swipe feed**. We follow v2. Plan doc updated at end of phase.

---

## Scope (locked)

### Scenario A — passive buyer, anchored to a listing

**Where**: anywhere a listing video plays in immersive vertical feed (`/browse/feed`, `/browse/feed?community=<slug>`, `/v/[agent]/[listing]` when video).

**Change**: when the listing has a `community_id`, overlay a **chip** on the top-left of each listing video:

```
🏘️  {communityName}
    {N} community videos
                          ›
```

Tap → navigate to `/c/[slug]/feed` (existing route — already works, has Back button that returns via `router.back()`).

**Out of scope for A**: listings chip (v2 prototype explicitly excludes it for A — "A 用户已锚 listing,跨链稀释意图").

---

### Scenario B — active buyer, browsing by area

**Entry**: `/browse/` (existing grid landing).

**Change 1**: Top of `/browse/` adds a segmented control:

```
[ Homes ]  [ Communities ]
```

- **Homes** (default) = current grid behavior, unchanged.
- **Communities** = grid of community cards (reuse the query/render logic from `/communities`, inline; do not redirect).

**Change 2**: each community card → tap → `/c/[slug]/feed` (existing route).

**Change 3**: on `/c/[slug]/feed`, every community video gets a bottom-left **listings chip**:

```
🏠  Homes here
    Tap to swipe
                  ›
```

Tap → navigate to `/browse/feed?community=<slug>` (existing route — vertical listing feed scoped to that community).

**Out of scope for B**: count badges with real numbers ("47 homes here"). Prototype shows fake numbers; implementing real counts means N+1 RPC. We ship label-only first; add counts in a follow-up if buyers ask.

**Out of scope (per locked plan §0)**: `Agents` tab on `/browse/`. Product has no agent-search surface.

---

## Implementation tasks

### B1 — Segmented control on `/browse/`
- Add client component `BrowseTabs` (Homes / Communities).
- State via `?tab=communities` URL param so back-button + share-link work.
- Communities view: reuse `/communities` query logic. Lift its data fetch into `lib/communities/list.ts` so both routes call the same fn.
- Mobile-only; desktop keeps single grid for now (existing pattern).

**Files**:
- `app/(public)/browse/page.tsx` (router-shaped)
- `app/(public)/browse/_components/BrowseTabs.tsx` (new client wrapper, optional — can do as server component with conditional render)
- `lib/communities/list.ts` (new — extract query)
- `app/(public)/communities/page.tsx` (refactor to call shared fn — tiny diff)

**Verify**: `/browse?tab=communities` shows community cards; tap goes to `/c/[slug]`. Default `/browse` unchanged.

### A1 — Community chip on listing video
- Add `community?: { slug: string; name: string; videoCount?: number }` to `BrowseCard`.
- Populate in `fetchBrowseCards` / `fetchBrowseCardsByCommunitySlug` / `fetchBrowseCardsByIds`. We already join `communities` by id — add `slug` to the select. videoCount can use the already-fetched `commVidsByCommunity` map.
- In `BrowseFeed`, render chip at `top-left` (under safe-area top) on each card when `card.community` is set. Tap → `router.push('/c/{slug}/feed')`.
- z-index above bottom caption, below the right rail interaction surface.

**Files**:
- `app/(public)/browse/_components/BrowseFeed.tsx` (chip render + click)
- `lib/feed/browse-cards.ts` (community in card payload)

**Verify**: a listing with `community_id` set shows chip; tap → community feed. Listing without community → no chip (no orphan UI).

### B2 — Listings chip on community video
- In `CommunityVideoFeed`, render chip at `bottom-left` of each video, above the right rail's existing community share/save shelf.
- Label: `🏠 Homes here · Tap to swipe`. Tap → `router.push('/browse/feed?community={slug}')`.
- Already see line 556 comment about a similar badge — do not duplicate; either reuse the existing badge code or replace it with this chip.

**Files**:
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx` (chip render + click)

**Verify**: tap chip → listing feed scoped to that community. Back button on listing feed → community feed. No infinite loop.

### Hygiene
- After all 3, run `tsc --noEmit` clean.
- `pnpm build` green.
- Smoke-check via local dev or Vercel preview: `/browse` default, `/browse?tab=communities`, listing-with-community feed, community feed.

---

## What we are NOT doing in 34b

- ❌ Bottom sheets (v2 killed them)
- ❌ Horizontal listing carousel (v2 killed it)
- ❌ Auto-advance on video end (v2 didn't include it)
- ❌ Real "N homes" / "N videos" counts (label-only first)
- ❌ Agents tab on `/browse/` (no product surface)
- ❌ Touching `/v/[agent]/[listing]` (single-listing detail page; A's chip belongs in the immersive vertical feed, not the static detail page; revisit if buyers complain)

---

## Verification matrix

| Path | Expected |
|---|---|
| `/browse` (default) | Homes grid (unchanged) |
| `/browse?tab=communities` | Community grid |
| Tap community card | → `/c/{slug}` |
| `/browse/feed?start={listing}` | listing has community → chip top-left → `/c/{slug}/feed` |
| `/browse/feed?community={slug}` | listing chip still shown (consistent), tap returns to that same community feed |
| `/c/{slug}/feed` | each video has 🏠 chip bottom-left → `/browse/feed?community={slug}` |
| listing without `community_id` | no chip |

---

## Status

- [ ] B1 segmented tab
- [ ] A1 community chip on listing video
- [ ] B2 listings chip on community video
- [ ] tsc + build verify
- [ ] DEVLOG + RELEASE
- [ ] ff main + push
