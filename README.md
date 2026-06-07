# Vicinity

> Property swipe platform for US homebuyers — TikTok-style vertical video feed for listings.

V1 MVP. Built for `vicinity-homes` org, Vivian Zhang as first agent.

---

## Stack

- **Framework**: Next.js 14 (App Router, Server Components)
- **Language**: TypeScript (strict mode + `noUncheckedIndexedAccess`)
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Database / Auth / Storage**: Supabase (Postgres + RLS + Magic-link auth)
- **Video**: Cloudflare Stream (TUS upload + auto HLS transcoding)
- **Email**: Resend (verified sender on `vicinities.cc`)
- **AI Copy**: Anthropic Claude API
- **Maps**: Google Maps / Places API
- **Hosting**: Vercel
- **Lint/Format**: Biome
- **Testing**: Vitest

## Read these first

- [`CLAUDE.md`](./CLAUDE.md) — global rules for Claude Code (style, security, what NEVER to do)
- [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) — phase-by-phase task list, in order
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system architecture & data model

## Local dev

```bash
pnpm install
cp .env.example .env.local   # fill in keys
pnpm dev                      # http://localhost:3000
```

## Repo layout

```
app/                          Next.js App Router
  (public)/v/[agent]/[slug]/  Public listing pages (SSR + ISR)
  (auth)/login/               Magic-link login
  dashboard/                  Agent dashboard (auth-gated)
  api/                        Route handlers
components/                   React components
  listing/                    Public feed (VideoFeed, Card, ActionRail)
  dashboard/                  Agent tools (VideoUploader, CommunityEditor)
  shared/                     Cross-cutting (ShareModal, SourceBadge)
lib/
  supabase/                   Client/server/middleware factories + types
  cloudflare/                 Stream API wrapper
  ai/                         Anthropic API wrapper (V2 seam: extract to service)
  zod/                        Schema validation at API boundaries
supabase/
  migrations/                 SQL migrations (source of truth for schema)
  functions/                  Edge Functions (notify-lead, webhook handlers)
docs/                         Architecture docs
```

## Conventions

- Branch: `main` is production. Feature branches `feat/<short-name>`.
- Commit style: imperative mood, prefix with phase/module: `phase2: add tus uploader`.
- One in-progress PR at a time. Each PR maps to one task in IMPLEMENTATION.md.
- All API boundaries validate input with zod. TypeScript types are not runtime checks.

## Positioning (do not drift)

Vicinity is for **all US homebuyers**. NOT a Chinese-community platform. No `_zh` fields,
no WeChat fields, no bilingual UI. English only for V1.
See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full positioning statement.
