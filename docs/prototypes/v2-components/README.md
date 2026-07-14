# v2-components (draft)

**Status**: draft React/Next.js components extracted from
`docs/prototypes/landing-v2/index.html`. **Not wired to `app/`.** These files
sit under `docs/prototypes/` per CLAUDE.md §"don't touch app/ from
prototypes". A future migration task will copy + refine into `app/`.

## Files

| Component            | File                     | Purpose                                                                 |
| -------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `<Hero />`           | `Hero.tsx`               | Hero row + phone-mock video + GA county stat strip                      |
| `<FeatureGrid />`    | `FeatureGrid.tsx`        | 7-card "Why Percho for GA agents" grid (1 hero + 6 standard)            |
| `<NeighborhoodCards />` | `NeighborhoodCards.tsx` | "Communities, not families" spotlight (3 default GA neighborhoods)      |
| `<Pricing />`        | `Pricing.tsx`            | 3-tier pricing (Solo / Team / Brokerage) with featured highlight        |

All four are **Server Components** (no `'use client'`). Props are optional
with sensible defaults so the components render as-is for a first migration
pass.

## Migration plan (into `app/`)

1. **Route.** Create `app/(marketing)/page.tsx` (or overwrite existing
   `app/page.tsx` if the current landing is a placeholder — check DEVLOG /
   see `DIFF-app.md` for the compare).
2. **Layout.** Reuse the root `app/layout.tsx`. No new layout needed; the
   hero section handles its own top spacing.
3. **Files.** Copy the four `.tsx` files into `app/(marketing)/_components/`
   (Next.js convention: `_` prefix keeps the dir out of routing). Update
   imports.
4. **Fonts.** The v2 prototype loads Fraunces/Inter via CSS `font-family`
   fallback chain. In `app/`, use `next/font` for both:
   ```ts
   // app/layout.tsx (excerpt)
   import { Fraunces, Inter } from "next/font/google";
   const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-serif" });
   const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
   ```
   Then extend `tailwind.config.ts`:
   ```ts
   fontFamily: {
     serif: ["var(--font-serif)", "Georgia", "serif"],
     sans:  ["var(--font-sans)", "system-ui", "sans-serif"],
   }
   ```
   Replace the inline `font-serif` class in components with the mapped
   Tailwind family. (Draft uses raw `font-serif` on the assumption the alias
   is set up.)
5. **CSS variables (globals.css).** Add the peach/moss/cream palette to
   `app/globals.css` under `:root` — matches persona rule (light warm earth
   tones, no dark mode):
   ```css
   :root {
     --bg: #F7F5F0;
     --bg-elev: #FFFFFF;
     --border: #E8E1D3;
     --ink: #26241F;
     --ink-2: #5C574C;
     --ink-3: #928B7C;
     --peach: #EF7C57;
     --peach-deep: #D9603C;
     --forest: #3C6E52;
     --forest-soft: #B8D1C0;
     --gold: #D4A64A;
     --cream: #F0E9D8;
   }
   /* global image/video rule from prototype — enforces object-contain per persona */
   img, video { max-width: 100%; display: block; object-fit: contain; }
   ```
6. **Video asset.** Copy `docs/prototypes/landing-v2/hero.mp4` (2.6 MB) into
   `app/public/hero/` — but **do not commit** (see `.gitignore`; videos are
   excluded). Instead upload to Supabase Storage (`marketing` public bucket)
   and pass the CDN URL via `<Hero videoSrc="…" posterSrc="…" />`. Same
   pattern for future neighborhood reels.
7. **Images.** `NeighborhoodCards.tsx` currently references Unsplash URLs
   with `<Image unoptimized>`. Before ship: (a) replace with real
   Wikimedia/agent-uploaded neighborhood photos, (b) drop `unoptimized`,
   (c) add each remote host to `next.config.ts → images.remotePatterns`.
8. **Zod / data**. All props have inline TS types. When wiring to Supabase
   define zod schemas under `lib/zod/marketing.ts` and derive the prop types
   from those. Do this only when data goes dynamic; the initial migration
   should keep the static defaults.

## What is intentionally **out of scope** for this draft

- No `'use client'` — no interactivity, no framer-motion, no scroll effects.
- No i18n wiring. Multilingual copy is a marketing-copy generator concern
  (per CLAUDE.md §1) — the UI chrome stays English.
- No accessibility audit beyond `aria-label` on the hero video and `<article>`
  landmarks on neighborhood cards. A11y pass belongs in the migration PR.
- No tests. Draft components are visual scaffolding; tests come after wiring
  data (per CLAUDE.md §9 "tests for logic in `lib/` and API routes").
- Nav bar, final CTA, footer, and pipeline explainer section from the
  prototype are **not** extracted here — task scope was 4 components. Those
  three sections are simple enough to inline into the page or extract later.

## Known conflicts with memory (GA-only, selling-only, MLS-first)

Documented only, not fixed in this draft (per cron rule "冲突项只记录不改
code"):

- `FeatureGrid` default features list still mentions "Multilingual reach" +
  Rednote/WeChat. This is fine per CLAUDE.md §1 (marketing-copy generator
  can emit multi-language) but if memory hardens to *selling-only, no
  buyer-facing multilingual chrome*, drop that card during migration.
- `Hero` county-strip includes a "5 Languages" stat — same caveat. Consider
  swapping to "GA MLS integrations" or "avg reel views / listing" during
  migration to align with the selling-only pitch.
- `NeighborhoodCards` currently uses Unsplash stock. GA-only positioning
  demands real GA imagery before public launch; keep this only for the
  first internal preview.

See `DIFF-app.md` for a file-by-file comparison against the current `app/`
landing (if any).
