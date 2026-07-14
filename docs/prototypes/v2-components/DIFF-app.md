# DIFF: v2 prototype vs current `app/` landing

Companion to `README.md` (migration steps). This doc catalogs the **gap** between
the v2 prototype (`docs/prototypes/landing-v2/`) and what actually ships in
`app/page.tsx` today, then lists concrete **migration blockers** an engineer
must resolve before dropping the v2 components onto `/`.

> Scope: read-only audit. **No code in `app/` is being changed by this doc.**
> Any conflicts with the GA-only / selling-only memory position are flagged
> under §5, not silently reconciled.

---

## 1. Current `app/` landing — one-paragraph summary

`app/page.tsx` (94 lines) is a **single-section, full-bleed video hero** with:

- One `<section h-[100svh]>` containing `<video autoPlay muted loop playsInline>`
  (`LANDING_HERO_VIDEO` from `lib/copy/landing.ts`) + bottom cream gradient.
- Centered gold "PERCHO" eyebrow (`#c9a24a`, tracking `0.32em`), serif `<h1>`
  (`LANDING_TAGLINE`), Inter subtitle (`LANDING_SUBTITLE`).
- Two round CTAs: **Explore** (`/browse`, gold fill) and **Sign In** (`/login`,
  ghost/outline).
- Below the fold: **only `<SiteFooter />`**. No feature grid, no neighborhoods,
  no pricing.
- Authed users are `redirect('/browse')` at the server component level.

Design tokens (from `app/globals.css` `:root`): `--bg:#f3eee7`, `--surface:#fbf8f3`,
`--ink:#313131`, `--muted:#8a857d`, `--line: rgba(49,49,49,.14)`. Fonts:
`--font-inter` (body), `--font-serif-display` (display, Source Serif 4).

## 2. v2 prototype — one-paragraph summary

`docs/prototypes/landing-v2/index.html` is a **5-section marketing page**:

1. Hero with **phone-mock** framing a looping reel (peachtree-corners-v1.mp4)
   next to headline + CTA — not full-bleed video.
2. Feature grid (6 cards after A3): reels, community, neighborhood, weekend
   tour reels, MLS-direct photos, agent dashboard.
3. Neighborhood cards (Peachtree Corners live, Decatur/Johns Creek "coming").
4. Pricing (Free / Pro / Team) — 3 cards.
5. Pipeline/how-it-works strip + footer.

Palette: **peach `#EF7C57` + forest `#3C6E52` + gold `#D4A64A` + cream
`#F7F5F0`** — a warm-earth system distinct from `app/`'s neutral cream.
Serif is Fraunces (per README migration plan), body Inter.

## 3. Structural diff (what's different)

| Area | `app/page.tsx` (shipped) | v2 prototype | Migration impact |
|---|---|---|---|
| Sections | 1 (hero) + footer | 5 sections | Add 4 new components |
| Hero visual | Full-bleed `<video>` + cream fade | Phone-mock frame + video *inside* mock, split layout | New markup, keeps same asset |
| Palette | Neutral cream + gold accent | Peach + forest + gold + cream | Add 6+ CSS vars |
| Serif font | Source Serif 4 (`--font-serif-display`) | Fraunces (README plan) | New `next/font` import |
| CTA style | Round pill, gold fill | Same idiom (gold pill) — visually compatible | None |
| Auth redirect | `redirect('/browse')` if session | Prototype is static HTML — no auth check | Preserve redirect in wrapper |
| Data wiring | Copy from `lib/copy/landing.ts` constants | All copy inlined as props defaults | Extract to `lib/copy/landing.ts` extension or per-component consts |
| Neighborhood data | none on landing | 3 hardcoded cards | Later: fetch from `neighborhoods` table (Phase D1 schema) |
| Pricing data | none | 3 hardcoded tiers | Keep hardcoded until billing exists |

## 4. Migration blockers (ordered by severity)

### B1 — [P0] Landing route already ships; replacement is user-visible

`/` is the public landing. Any swap must be behind a preview route first
(`app/(marketing)/landing-v2/page.tsx`) so it can be reviewed at a Vercel
preview URL before repointing `/`. **Do not** overwrite `app/page.tsx` in
the same PR that introduces the v2 components.

### B2 — [P0] Auth redirect must be preserved

Current landing does `redirect('/browse')` for authed users. The v2 Hero
component is a pure Server Component with no session probe. The wrapper
page (`app/(marketing)/landing-v2/page.tsx`) must replicate the
`createClient().auth.getSession()` guard **before** rendering v2 sections,
otherwise authed users see a marketing page instead of their feed.

### B3 — [P0] CSS variable name collisions

v2 uses `--border`, `--ink-2`, `--ink-3`; `app/globals.css` already defines
`--border` (aliased to `--line`) and `--ink2` (**no dash before `2`**).
Direct copy-paste of v2 `:root` will:

- Override `--border` with `#E8E1D3` (v2 wants a warmer border) — check every
  component in `app/` that reads `border-border` via Tailwind arbitrary
  values; some will visually shift.
- Introduce a *second* naming convention (`--ink-2` vs shipped `--ink2`) —
  standardize on one before importing v2 tokens. Recommend **prefix v2
  tokens with `--v2-`** (or `--marketing-`) and scope them to
  `.marketing-v2 { ... }` so they can't leak into product chrome.

### B4 — [P1] `.card` class conflict (already flagged in QA.md)

`docs/prototypes/landing-v2/QA.md` calls out that `.card` is used for both
feature cards and neighborhood/pricing cards with different padding/shadow.
Tailwind migration removes the class-name collision but component naming
must stay distinct: `FeatureCard`, `NeighborhoodCard`, `PricingCard` —
**do not** collapse into one shared `<Card>` primitive.

### B5 — [P1] Video asset placement

v2 uses `landing-v2/hero.mp4` (2.6 MB, checked into `docs/`, not git-tracked
per project `.gitignore` rule for videos). Production must serve from
**Supabase Storage** or **Cloudflare Stream** (per §7 cost guardrails in
CLAUDE.md) — not `public/`. The v2 `<Hero>` component defaults `videoSrc`
to `/hero.mp4`; the migration must swap this to a signed CDN URL and add
`hero-poster.jpg` at a same-origin path (poster can be in `public/`).

### B6 — [P1] Font stack diverges

`app/` uses `next/font/google` for **Inter** + **Source Serif 4** (see
`app/layout.tsx`, CSS vars `--font-inter` / `--font-serif-display`). v2's
README migration plan calls for **Fraunces** as the serif. Adding Fraunces
adds ~40KB WOFF2 + a second FOUT window. Two options:

- (a) Import Fraunces via `next/font` and scope it to marketing routes
  only (`.marketing-v2 { font-family: var(--font-fraunces) }`).
- (b) Reuse the existing `--font-serif-display` (Source Serif 4) and accept
  a slight display tone difference.

Owner call needed. Default to (b) for zero-cost migration.

### B7 — [P2] Neighborhood card data source

v2 hardcodes Peachtree Corners / Decatur / Johns Creek. Phase D1 will
introduce a `neighborhoods` table. Migrate first with hardcoded array in
`lib/copy/neighborhoods.ts`, then swap to Supabase query in a follow-up —
don't block landing swap on the DB schema.

### B8 — [P2] Pricing tiers are aspirational

Free / Pro / Team tiers in v2 don't map to any Stripe products (there's no
billing wired in `app/` today — grep confirms no `stripe` imports in
`app/api/`). Ship pricing section as **static marketing copy** with a
"Contact sales" mailto CTA on Team; do **not** wire Checkout URLs yet.

### B9 — [P2] Mobile responsive rules diverge

v2 has a `@media (max-width:767px)` block (A1 tick) that manually collapses
grids. Tailwind port must translate these to `sm:` / `md:` breakpoints —
the component drafts already use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
so this should be free, but verify at 375px viewport post-migration.

### B10 — [P3] SEO / meta

`app/layout.tsx` sets root `<title>` / `<meta>`. Landing swap doesn't need
new metadata unless we want per-route Open Graph — defer.

## 5. Positioning conflicts (log-only, no code changes)

Per cron rules: memory position = **GA-only, selling-only, MLS-first**.
Items in v2 prototype that diverge:

1. **"5 languages" / multilingual copy** in hero subline — memory says
   selling-agent-only, not multilingual buyer marketing. Already logged in
   QA.md and README.md. Migration should **drop** the "5 languages" chip
   and reframe as "MLS photos → reel in minutes."
2. **"community" pillar** in feature grid — memory frames Percho as a
   listing-agent tool, not a community platform. Reframe as
   "neighborhood context reels" (agent-authored, not community-generated).
3. **Unsplash stock photos** for neighborhood cards — for production,
   only MLS-sourced or agent-uploaded imagery is acceptable; Unsplash is
   fine only for the pre-launch marketing page.

None of these are migration blockers — they are **copy edits** to apply
during the port. Flag them in the migration PR description so the owner
can review copy before merge.

## 6. Suggested migration PR sequence

1. PR-1: Add `app/(marketing)/landing-v2/page.tsx` wrapper + 4 components +
   scoped CSS vars under `.marketing-v2`. Deploy to preview only.
2. PR-2: Move hero video to Supabase Storage; update `LANDING_HERO_VIDEO`
   or new `V2_HERO_VIDEO` constant.
3. PR-3: Owner reviews preview URL; apply copy fixes from §5.
4. PR-4: Repoint `/` from current single-section landing to v2 (one-line
   change in `app/page.tsx` — re-export the marketing route, keep the
   auth redirect).

Each PR is independently revertable.

---

**File status**: read-only audit. No `app/` files were modified.
**Related**: `README.md` (how to migrate), `QA.md` (v2 visual issues).
