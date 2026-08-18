# Percho — repository map

One page, one job: tell you which folder a thing belongs in, and where to look
when something breaks. If a folder's actual contents stop matching its row
here, one of the two is wrong — fix it rather than adding a special case.

Companion docs: [`CLAUDE.md`](CLAUDE.md) is the rules, [`DEVLOG.md`](DEVLOG.md)
is what happened, [`RELEASE.md`](RELEASE.md) is what shipped. This file is what
*exists*.

---

## The shape of it

A pnpm workspace with two apps, one shared package, and a set of out-of-band
workers that do the heavy media work off the request path.

```
                    ┌──────────────────────────┐
   agents ─────────▶│  apps/web  (Next.js 14)  │◀──── buyers (browser)
                    │  dashboard · admin · API │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Supabase (Postgres+RLS) │◀──── apps/mobile (Expo)
                    │  storage · edge fns      │
                    └────────────┬─────────────┘
                                 │ polls job tables
                    ┌────────────▼─────────────┐
                    │  scripts/*-worker        │
                    │  render · seedance       │  (Mac mini, not Vercel)
                    └──────────────────────────┘
```

The web app never renders video itself. It writes a row to a job table
(`generated_videos`, `photo_clips`, `ai_tour_videos`, `tour_assemblies`) and a
worker outside Vercel picks it up. Anything slow lives behind that boundary.

---

## Top level

| Folder | Responsibility |
|---|---|
| `apps/web/` | The product. Next.js 14 App Router — buyer-facing pages, the agent dashboard, the admin pipeline console, and the HTTP API. Everything a browser touches. |
| `apps/mobile/` | Buyer-facing iOS app. Expo + expo-router. Reads the web app's `/api/mobile/*` routes; owns no schema. |
| `packages/shared/` | Types and constants both apps must agree on. The only cross-app import. Keep it dependency-free, and import a module by subpath (`@percho/shared/types`) — there is no barrel. |
| `scripts/` | Everything that runs outside Vercel: long-running workers, one-shot pipelines, admin utilities, prototypes. |
| `supabase/` | Schema source of truth. Migrations, RLS policies, edge functions, local config. |
| `docs/` | Reference material a human reads. Not process logs — those go to `docs/archive/`. |
| `brand/` | Design **source** — the upstream Phosphor font, the 14 chosen SVGs, the glyph selection. Never shipped; `scripts/icon-fonts/` subsets it into the app's fonts. |

**Three places hold files that look like "assets", and they are not
interchangeable:** `brand/` is design source that is never served;
`apps/mobile/assets/` is what Expo bundles at runtime (its location is fixed by
convention, and the fonts in it are build output of `scripts/icon-fonts/`);
`apps/web/public/` is what Next.js serves over HTTP. Renaming the root folder
to `brand/` in phase54 left exactly one folder called `assets`, so the name now
means one thing.

Root files: `CLAUDE.md` (rules for agents), `DEVLOG.md` (current month;
older months in `docs/devlog/`), `RELEASE.md` (non-technical changelog),
`biome.base.json` (lint rules both apps extend).

---

## `apps/web/app/` — routes

App Router. A folder here is a URL unless it is parenthesised (route group,
no URL segment) or underscored (private, never routed).

| Folder | Responsibility |
|---|---|
| `(public)/` | Anything an unauthenticated visitor can reach — the browse feed, community pages `c/[slug]`, listing pages `v/[agentSlug]/[listingSlug]`, saved, search, profile, legal. |
| `(auth)/` | Login, signup, password reset. Its own layout. |
| `dashboard/` | The agent's workspace. Listing and community editors, leads, analytics. Everything here assumes an authenticated agent. |
| `admin/` | Internal pipeline console — POI review, video jobs, BGM, tour runs. Gated by `is_admin`; not a customer surface. |
| `api/` | Route handlers. `api/mobile/*` is the mobile app's contract; `api/admin/*` requires `requireAdmin()`; webhooks verify signatures before doing anything. |
| `internal/` | Throwaway internal pages (meetup demos). Not part of the product. |
| `_components/` | Components used by more than one route subtree. |
| `_actions/` | Server actions shared across routes. |

**Where does a component go?** Used by one route subtree → that route's own
`_components/`. Used by several → `app/_components/`. There is no third
option; a top-level `components/` folder existed until phase51 and was
removed precisely because it gave the same answer twice.

---

## `apps/web/lib/` — logic

No React in here. If it renders, it belongs in `app/`.

| Folder | Responsibility |
|---|---|
| `supabase/` | Client construction and generated types. `server.ts` gives you `createClient` (anon + RLS), `createServiceClient` (bypasses RLS — see CLAUDE.md §3) and `createAnonClient` (for `unstable_cache`). `rows.ts` projects row types from `database.types.ts`; never hand-write a row shape. |
| `poi/` | The largest subsystem: points of interest and the videos built from them. Discovery via Google Places, photo fetch, vision tagging, narrative, and the community-tour orchestrator. See its own section below. |
| `feed/` | Deciding what a viewer sees and why — browse cards, community pools, highlights, the reasons shown under a card, neighborhood scores, geo units. Read-heavy, no writes. |
| `communities/` | Community as an entity: list queries, detail projection, cover/logo resolution. |
| `listings/` | Listing as an entity: detail projection, the public feed loader, address autocomplete. |
| `ai/` | Model callers and their guardrails — Gemini, OpenRouter video, prompt builders, rate limiting, response caching. Every call caps `max_tokens` (CLAUDE.md §7). |
| `mls/` | Bridge/RESO integration: the API client with retry, address autofill, the sync worker. |
| `analytics/` | Behavioural events, both directions. `track.ts` writes them from the browser; `entity-stats`/`listing-stats` read them back. |
| `zod/` | Request and payload schemas. Every API route validates through here — TypeScript types are not runtime checks (CLAUDE.md §4). |
| `auth/` | Who is asking: `requireAdmin`, viewer role resolution. |
| `geo/` | Pure geometry — distance, point-in-polygon, community lookup by coordinate. |
| `bgm/` | Background-music library: catalogue, storage paths, vibe state. |
| `cloudflare/` | Cloudflare Stream URLs and thumbnails. |
| `buyer/` | Anonymous-buyer identity and likes (device id, no account required). |
| `copy/` | Static marketing copy kept out of components. |
| `perf/` | Server timing helpers. |
| `utils/` | Genuinely generic, domain-free helpers. If it mentions a listing or a community it does not belong here. |
| `log.ts` | The logger. `console.log` is forbidden in production paths; use this, and `mask()` anything resembling PII. |

### `lib/poi/` in detail

Two pipelines, each written once and parameterised by entity rather than
copied per entity.

| File | Responsibility |
|---|---|
| `entity-scope.ts` | The only thing that differs between a listing and a community — table names, join tables, revalidate paths, copy. Adding a third entity type means adding one object here. |
| `poi-actions-core.ts` | Discovery → photo fetch → review → nearby read. |
| `bucket-video-core.ts` | Approved photos → shot selection → a `generated_videos` row. |
| `{listing,community}-actions.ts` | `'use server'` adapters over the two cores. No logic. |
| `{listing,community}-video-actions.ts` | Same, for the video pipeline. |
| `tour-steps/` | The seven community-tour steps — research, resolve, photos, tag, generate, assemble, regenerate-all — one module each, plus `shared.ts` and `shots.ts`. The route only dispatches. |
| `tour-orchestrator/` | The planning layer: Curator (describes photos), Scheduler (orders and times them), Guard (compliance), VO Pass (narration). Pure functions, well tested. |
| `google-places.ts` | The POI pipeline's Places client — nearby/text search, photo binaries. Distinct from `lib/listings/address-autocomplete.ts`, which is the address form's. |
| `vision-tagger.ts`, `narrative.ts` | Per-photo tagging and voiceover generation. |

---

## `apps/mobile/`

| Folder | Responsibility |
|---|---|
| `app/` | expo-router routes. `(tabs)/` is the tab bar; `listing/[id]`, `community/[slug]` are detail screens. |
| `components/` | `cards/` are the swipeable feed faces, `feed/` the deck chrome, `listing/` the detail sheets. |
| `lib/feed/` | Feed generation, ordering, rhythm, behavioural signals. |
| `lib/listing/` | Listing detail: hotspots, tours, section nav. |
| `lib/gesture/` | Swipe physics and capability detection. |
| `state/` | Zustand stores — funnel stage, sound, preferences. |
| `theme/` | Design tokens and layout constants. Several tests here assert against component *source text*, so reformatting a card can break them. |
| `hooks/` | Cross-screen React hooks. |

---

## `scripts/`

Nothing here is imported by the apps. Each folder is either a long-running
worker or a one-shot job.

| Folder | Responsibility |
|---|---|
| `render-worker/` | The main worker. Polls job tables on the Mac mini, renders Ken Burns / DepthFlow clips, assembles tours, muxes BGM, uploads to storage. Python + ffmpeg. |
| `seedance-worker/` | Owns `ai_tour_videos`: submits to OpenRouter, polls, stores the result. |
| `ken-burns/` | The Ken Burns renderer itself, callable standalone. |
| `caption-render/` | Burns captions into frames. |
| `pipelines/` | `nearby_generate.py` — batch nearby-video generation. |
| `community-tour/` | The agent-research entrypoint, runnable outside the web app. |
| `fmls-scrape/` | One-shot FMLS (Atlanta MLS) scrape. |
| `nextdoor-seed/` | One-shot Nextdoor neighborhood seeding. |
| `k12/` | School data and photo upload. |
| `upload-bgm/` | Mirrors the local BGM library into storage. |
| `admin/` | Operator utilities — curator eval, production smoke test, demo assets. Allowed to use the service-role key (CLAUDE.md §3). |
| `icon-fonts/` | Rebuilds the mobile app's subset icon fonts from `brand/icons/`. |
| `maintenance/` | One-off backfills and requeues run by hand against production. |
| `prototypes/`, `spikes/` | Experiments. Nothing in the product depends on them; treat as disposable. |

---

## `supabase/`

| Folder | Responsibility |
|---|---|
| `migrations/` | The schema, in order. **Append-only once pushed** — editing an applied migration is what broke the chain and froze `database.types.ts` as a stub for six weeks (DEVLOG 2026-08-19). Every new table ships with RLS in the same migration. |
| `functions/` | Edge functions. Currently `notify-lead`. |
| `config.toml` | Local dev stack config. |

After any migration: `pnpm db:push` then `pnpm db:types`, and commit the
regenerated `database.types.ts` in the same PR.

---

## `docs/`

| Folder | Responsibility |
|---|---|
| `design/` | UX specification. `spec-v3/` is authoritative for the mobile app; the rest are product design notes. |
| `pipelines/` | How the media pipelines work, end to end. |
| `devlog/` | Finished months of `DEVLOG.md`. Rotate when the month turns. |
| `marketing/` | Voice, templates, account notes, daily logs. |
| `references/` | External data sources and their terms. |
| `bgm/` | Music vibe mapping. |
| `archive/` | Finished process artifacts — sprint prompts, verification checklists, handoffs. Not maintained. If it contradicts the code, the code wins. |

---

## Conventions worth knowing before you edit

- **Server Components by default.** `'use client'` only for state, effects or
  browser APIs.
- **Named exports only**, except the files Next.js requires to default-export
  (`page.tsx`, `layout.tsx`, `route.ts`).
- **No barrel files.** Import the module you mean.
- **`kebab-case.ts`** filenames, `PascalCase` components, `camelCase`
  functions.
- **Colours come from the six palette tokens** in `tailwind.config.ts` —
  `bg`, `surface`, `ink`, `ink2`, `muted`, `line`. The dark-theme aliases
  (`cream`, `gold`, `bronze`) were removed in phase51; do not reintroduce a
  name that does not describe what renders.
- **Row types are projected, never hand-written** — `Row<'listings'>` from
  `lib/supabase/rows.ts`, or `Pick<Row<'listings'>, …>` when a query selects a
  subset.
- **CI is the gate.** `pnpm typecheck`, `pnpm lint` and `pnpm test` at the repo
  root must all pass; they fan out across both apps and the shared package.
