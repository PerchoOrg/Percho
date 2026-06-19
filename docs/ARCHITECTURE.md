# Vicinity — Architecture (V1)

> **Positioning**: Vicinity is a property swipe platform for **all US homebuyers**.
> Vertical-video feed of listings + community context (schools, POIs, neighborhood).
> NOT a Chinese-community platform. English only. No WeChat. No bilingual UI.

V1 is for one agent (Vivian Zhang, KW Atlanta). Designed to scale to dozens of
agents without re-architecture, but only Vivian onboards in V1.

---

## 1. System diagram (text)

```
                    ┌────────────────────────────┐
                    │  Buyer (mobile / desktop)  │
                    │  Agent (dashboard)         │
                    └────────────┬───────────────┘
                                 │ HTTPS
                                 ▼
                    ┌────────────────────────────┐
                    │  Vercel Edge / CDN         │
                    │  Next.js 14 (App Router)   │
                    │   • Public listing pages   │
                    │     (SSR + ISR 1h)         │
                    │   • Dashboard (auth)       │
                    │   • Route Handlers         │
                    └─┬──────────────┬───────────┘
                      │              │
            ┌─────────▼───┐    ┌─────▼─────────────┐
            │  Supabase    │    │  Cloudflare       │
            │  • Postgres  │    │  Stream           │
            │  • Auth      │    │  • TUS direct     │
            │  • Storage   │    │    upload         │
            │  • Edge Fns  │    │  • HLS playback   │
            │  • Realtime  │    │  • Webhook → API  │
            └─┬────────────┘    └───────────────────┘
              │
              │  signed RLS queries
              │
              ▼
       ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
       │  Resend      │    │  Anthropic   │    │  Google Maps │
       │  (lead email)│    │  (copy gen)  │    │  / Places    │
       └──────────────┘    └──────────────┘    └──────────────┘
```

Key flows:

1. **Agent uploads video**
   Browser → Route Handler (creates Stream upload URL) → tus-js-client direct
   to Cloudflare → CF webhook → Edge Function updates `listing_videos.status`.

2. **Buyer opens listing**
   `/v/[agentSlug]/[listingSlug]` SSR Server Component → Supabase reads (anon
   key + RLS, only published rows visible) → returns HTML with OG tags →
   client-side hydrates VideoFeed → hls.js streams from Cloudflare CDN.

3. **Buyer submits lead**
   Form POST → `/api/leads` Route Handler → zod validate → insert (anon key
   + RLS allows public insert) → Edge Function `notify-lead` → Resend.

4. **Agent reviews leads**
   Dashboard Realtime subscription on `leads` table (RLS scopes to agent's
   own rows) → live list updates as new leads arrive.

---

## 2. Data model

See `supabase/migrations/0001_init.sql` for the source of truth. Summary:

| Table | Purpose | RLS public read? |
|---|---|---|
| `agents` | Listing agent profile (one per Supabase Auth user) | yes (profile only) |
| `communities` | Reusable community/neighborhood (e.g. Buckhead) | yes |
| `listings` | A property for sale | only `status='published'` |
| `listing_videos` | Videos of the home itself (exterior/interior/walkthrough) | inherits listing |
| `community_videos` | Cross-listing reusable video (school/POI/neighborhood) | yes |
| `schools` | Manual entry; mandatory `source_url` + `recorded_by` audit trail | yes |
| `pois` | Manual entry; mandatory audit trail | yes |
| `photos` | Listing photos (cover + supporting) | inherits listing |
| `leads` | Buyer inquiry. Email/phone only. NO wechat. | agent only |
| `events` | Behavioral analytics (page_view, card_view, lead_submit, share, video_*) | agent only (own listings) |

### Why `listing_videos` and `community_videos` are split

A property in Buckhead reuses the same `Jackson Primary 8/10` video and the
same `Whole Foods 1.1mi` video as the next Buckhead listing. Storing those at
the community level avoids re-uploading and lets Vivian build community
inventory once. This is V1's main scale lever — without it, every listing
needs ~15-20 fresh videos.

`community_videos` rows can optionally link to a specific `schools.id` or
`pois.id` row so the overlay text on each card has structured data.

### Fair-housing guardrails

- No demographic columns in any table (race, ethnicity).
- `schools` and `pois` require `source_url` and `recorded_by` on every row —
  enforced as `not null`. Audit trail is non-bypassable in V1.
- V1 ships no public-data scraping. All school/POI rows are agent-entered.

---

## 3. Auth & RLS

- Supabase Auth, magic-link only (no password). One Supabase Auth user
  per agent.
- `handle_new_user` trigger creates the matching `agents` row on signup,
  with a slug derived from the email local-part (collision-safe).
- All tables have RLS. The default access pattern uses the **anon key** even
  from server code — RLS is the fence.
- The **service role key** is reserved for: webhook handlers (after signature
  verification), Edge Functions doing system actions, and admin scripts.
  See `CLAUDE.md` §3.

---

## 4. Video pipeline

```
Agent picks file
   │
   ▼
POST /api/video/create-upload   (zod-validated body)
   │
   ▼  Cloudflare Stream API
Returns { uploadUrl, videoId }
   │
   ▼
Browser: tus-js-client uploads directly to Cloudflare
   • progress bar
   • resumable on network drop
   │
   ▼
Cloudflare Stream
   • transcodes to multi-bitrate HLS
   • emits webhook on `ready`
   │
   ▼
POST /api/webhooks/cloudflare-stream
   • verify signature (constant-time HMAC-SHA256)
   • update listing_videos.status = 'ready'
   │
   ▼
Dashboard sees status flip via Supabase Realtime
```

Cost guards:
- 2 GB upload size cap (server-enforced via TUS Upload-Length).
- 10 min duration cap (passed to Stream as `maxDurationSeconds`).
- Stream subscription is $5/mo + per-minute storage/delivery; monitor in
  Cloudflare dashboard.

---

## 5. Public listing page

URL: `/v/[agentSlug]/[listingSlug]`

- Rendered as a Server Component: SEO-friendly, fast first paint, OG meta
  generated server-side.
- ISR with `revalidate = 3600` (1 hour). Edits to a published listing
  trigger explicit revalidation via `revalidatePath()`.
- The video feed itself is a Client Component (`VideoFeed`) — Framer Motion
  for snap, hls.js for playback, max 3 videos mounted at any time (current ±1).

Feed composition (V1, choice C confirmed): the feed is **all video**.
Cards are interleaved:

1. Listing videos (exterior, interior, walkthrough) in the order Vivian sets.
2. Community videos for the listing's community, with an overlay text:
   - SCHOOL: `{name} {grades} · {rating}/10`
   - POI: `{name} · {distance_text}`
   - NEIGHBORHOOD: `{community.name}` + short description

Vivian must record at minimum: home videos + 2-5 community videos (school,
park, grocery, neighborhood) per Buckhead listing. Community videos are
shared across listings in the same community.

---

## 6. Stack rationale (one-liners)

- **Next.js 14 App Router**: one codebase, SSR for public + Client for dashboard.
- **TypeScript strict**: pair-programming with Claude Code requires hard type
  fences. `noUncheckedIndexedAccess` catches a class of bugs Claude tends to
  miss.
- **Supabase**: Postgres (not Firestore) so future analytics is real SQL; RLS
  is the access control layer, no app-level guards needed; Auth + Storage +
  Edge Functions in one project.
- **Cloudflare Stream over MediaConvert**: TUS resumable upload + HLS auto out
  of the box. MediaConvert needs ~5 days of pipeline plumbing for the same
  feature set. Cost is comparable at V1 scale.
- **Vercel**: zero-DevOps, automatic preview deploys per PR, image optimization.
- **Resend**: SES costs less but Resend's deliverability tooling and DNS
  flow saves a half-day in V1.
- **Biome over ESLint+Prettier**: 10x faster, one config file.

---

## 7. V2 / V3 seams (intentional, not tech debt)

| Future feature | V1 hook |
|---|---|
| MLS IDX feed (auto-import listings) | `listings.source` enum reserved (V1 only `manual_upload` value) |
| Premier Agent slots | `listings.promotion_slot` schema slot (TBD in Phase 4) |
| Multiple brokerages / broker admin | `agents.brokerage` already a column; second auth pool plug-point |
| LLM video understanding | All AI calls live in `lib/ai/`; swap to Python service later |
| Geo search | `listings.lat/lng` already populated; pgvector / OpenSearch added later |
