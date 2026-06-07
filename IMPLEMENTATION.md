# Vicinity — Implementation Plan

> Read `CLAUDE.md` first. Then this file.
>
> Pick the first unchecked task in the current phase. One task = one PR.
> When a task is done, check the box and add a one-line note. Append a
> session log at the bottom of this file (see "Session log" template).

**Rule of progression**: do not start a phase until the previous phase is
fully checked off. If a task is blocked, write the blocker into the task
line itself and move to the next task in the *same* phase.

---

## Phase 0 — Scaffold (delivered as initial commit; no Claude Code work)

This phase is pre-built. Verify locally and on Vercel before starting Phase 1.

- [ ] Owner: clone repo, `pnpm install`, `pnpm dev` — landing page renders.
- [ ] Owner: copy `.env.example` to `.env.local`, fill all keys.
- [ ] Owner: connect Vercel to GitHub repo, set all env vars in Vercel UI.
- [ ] Owner: `supabase login`, link project: `supabase link --project-ref <ref>`.
- [ ] Owner: `pnpm db:push` — both migrations applied (verify in Supabase Studio).
- [ ] Owner: `pnpm db:types` — regenerate `lib/supabase/database.types.ts`,
      commit the result.
- [ ] Owner: push to `main`, Vercel deploys green, landing page live.

**Definition of done**: deployed URL shows the "Vicinity / Agent Login" landing
page; Supabase Studio shows all 9 tables with RLS enabled.

---

## Phase 1 — Auth + Dashboard skeleton

Goal: Vivian can log in via magic link, lands on an empty dashboard.

- [ ] **1.1** `app/(auth)/login/page.tsx` — magic-link form, Supabase
      `signInWithOtp`. Redirect target from `?redirect=` query param.
- [ ] **1.2** `app/(auth)/auth/callback/route.ts` — exchange code for session.
- [ ] **1.3** Verify the `handle_new_user` trigger creates an `agents` row
      after first login. Add an integration test (or a documented manual
      check) confirming this.
- [ ] **1.4** `app/dashboard/layout.tsx` — auth-gated; renders top bar with
      agent name + "Sign out" button.
- [ ] **1.5** `app/dashboard/page.tsx` — empty-state listing list ("No
      listings yet · New listing").
- [ ] **1.6** `app/api/auth/signout/route.ts` — POST clears session, redirects /.
- [ ] **1.7** Sign-in flow E2E manual test documented in `docs/manual-tests.md`.

**Definition of done**: a fresh email signs up via magic link → lands on
empty `/dashboard` → `agents` table has the new row.

---

## Phase 2 — Video upload pipeline

Goal: an agent can upload a video from the dashboard and see it transition
from `processing` → `ready` automatically.

- [ ] **2.1** `app/api/video/create-upload/route.ts` — POST, zod-validated,
      auth-gated. Calls `createDirectUpload()` from `lib/cloudflare/stream.ts`.
      Pre-creates the `listing_videos` (or `community_videos`) row.
- [ ] **2.2** `components/dashboard/VideoUploader.tsx` — Client Component.
      tus-js-client, progress bar, retry on disconnect.
- [ ] **2.3** `app/api/webhooks/cloudflare-stream/route.ts` — POST. Verifies
      HMAC signature using raw body. Updates `status='ready'` on the matching
      row by `cf_video_id`. **Must use service role client** (webhooks have
      no auth.uid()).
- [ ] **2.4** Realtime subscription on `listing_videos` in dashboard so
      the UI reflects status flips without refresh.
- [ ] **2.5** Hard guard: reject uploads >2 GB and >5 min duration server-side
      *before* hitting Stream API.
- [ ] **2.6** Tests: signature verification (good + bad signature, time skew),
      `createDirectUpload` happy path with mocked fetch.

**Definition of done**: uploading a 30-second 1080p mp4 from the dashboard
results in a row that goes processing → ready within ~60s, and the dashboard
UI reflects this without manual refresh.

---

## Phase 3 — Public listing page (video feed)

Goal: a published listing has a public URL with the demo's vertical-feed UX,
all video, with overlay cards for community context.

- [ ] **3.1** `app/(public)/v/[agentSlug]/[listingSlug]/page.tsx` —
      Server Component. Fetches listing + agent + community + listing_videos
      + community_videos + schools + pois.
      ISR `revalidate = 3600`. Returns 404 if listing not published.
- [ ] **3.2** `generateMetadata()` — OG title, description, image (cover or
      first video thumbnail).
- [ ] **3.3** Migrate `VideoFeed` + `Card` + `ActionRail` from the existing
      demo (`vicinity-app`). Convert .jsx → .tsx. Replace mock data with
      props. Replace Pexels URLs with Cloudflare HLS URLs.
- [ ] **3.4** hls.js integration in `Card` for video playback. iOS Safari
      uses native HLS; everywhere else uses hls.js. Max 3 videos mounted.
- [ ] **3.5** Build feed composition logic per ARCHITECTURE.md §5: interleave
      listing_videos + community_videos with structured overlays
      (SCHOOL/POI/NEIGHBORHOOD).
- [ ] **3.6** `LeadModal` component (UI only, wires up in Phase 5).
- [ ] **3.7** Event tracking: emit `page_view` on mount, `card_view` on
      each card visible, `video_complete` on playback end. Buffered batch
      POST to `/api/events` to avoid request storms.
- [ ] **3.8** Tests: feed composition function (unit test for interleave
      ordering and overlay text formatting).

**Definition of done**: a published listing URL plays vertically swipeable
video on iPhone Safari and Android Chrome; OG preview shows in iMessage
and Slack.

---

## Phase 4 — Listing CRUD + community editor

Goal: Vivian creates a complete listing in <30 minutes (PRD's hard UX target).

- [ ] **4.1** `app/dashboard/listings/new/page.tsx` — new listing form.
      Address field uses Google Places Autocomplete (server-side proxy
      route to keep `GOOGLE_PLACES_API_KEY` off the client).
- [ ] **4.2** Geocode address → fill `lat/lng/city/state/zip/neighborhood`.
- [ ] **4.3** `app/dashboard/listings/[id]/edit/page.tsx` — edit all fields,
      reorder videos (dnd-kit), set cover photo.
- [ ] **4.4** `app/dashboard/communities/[id]/page.tsx` — Community editor.
      List + add schools and POIs with **mandatory** `source_url`. UI
      enforces the constraint with a clear "data source URL is required
      for fair-housing compliance" hint.
- [ ] **4.5** Community video upload (kind: school/poi/neighborhood) with
      optional school/poi linkage.
- [ ] **4.6** Publish action: validates required fields (≥1 listing video,
      address, price, beds/baths), sets `status='published'` and
      `published_at=now()`, calls `revalidatePath()` on the public route.
- [ ] **4.7** Soft delete: archive sets `status='archived'`, hides from
      public + dashboard list (toggle to show archived).
- [ ] **4.8** End-to-end timing test: owner walks Vivian's path with a
      stopwatch. Target: 30 minutes for one full listing including 5 home
      videos and 3 community videos. Document the time in
      `docs/manual-tests.md`.

**Definition of done**: a fresh agent can create a published listing in
under 30 minutes including video upload time.

---

## Phase 5 — Lead capture + email notification

Goal: a buyer fills the lead form, agent receives email within 5 seconds,
dashboard shows the lead live.

- [ ] **5.1** Wire up `LeadModal` (built in 3.6) to POST `/api/leads`.
- [ ] **5.2** `app/api/leads/route.ts` — POST, zod-validated, anon-key insert
      (RLS allows public insert).
- [ ] **5.3** `supabase/functions/notify-lead/` Edge Function — fires from
      a Postgres trigger on `leads` insert. Calls Resend, sets `notified_at`.
- [ ] **5.4** Resend email template (English only, no WeChat field). Subject:
      `New inquiry · {address}`. CTA → `/dashboard/leads/{id}`.
- [ ] **5.5** `app/dashboard/leads/page.tsx` — list view with Realtime
      subscription. New leads appear without refresh.
- [ ] **5.6** `app/dashboard/leads/[id]/page.tsx` — detail view with full
      message + buyer contact info + reply-by-email shortcut.
- [ ] **5.7** Idempotency: trigger only fires once per lead row;
      Edge Function checks `notified_at IS NULL` before sending.
- [ ] **5.8** Tests: zod schema validation; manual test: submit a lead,
      confirm email lands in inbox (not spam) within 5s.

**Definition of done**: a real-world test from a non-vicinity email
delivers to the agent's primary inbox in <5 seconds.

---

## Phase 6 — AI copy + analytics dashboard

- [ ] **6.1** `app/api/generate-copy/route.ts` — POST listing fields →
      `generateListingCopy()` → returns 3-paragraph English description.
      Auth-gated. Rate-limit per agent (e.g. 10/min).
- [ ] **6.2** Edit form button "Generate description" → fills `description[]`
      with returned paragraphs as editable text.
- [ ] **6.3** `app/api/generate-social/route.ts` + UI for Facebook + Instagram
      copy. (Xiaohongshu deliberately omitted — see CLAUDE.md §1.)
- [ ] **6.4** `app/dashboard/listings/[id]/analytics/page.tsx` — per-listing
      view: total views, unique sessions, lead conversion %, video
      completion rate. Read from `events` table.
- [ ] **6.5** `app/dashboard/page.tsx` rollup: total views/leads across
      agent's published listings.

---

## Phase 7 — Internal beta with Vivian

- [ ] **7.1** Owner: add `vicinities.cc` as Vercel domain alias, verify HTTPS.
- [ ] **7.2** Owner: walk Vivian through the dashboard live, take notes on
      every friction point.
- [ ] **7.3** Vivian uploads 3 real listings end-to-end.
- [ ] **7.4** Triage bugs from internal beta — log in this file under a new
      `## Phase 7.5 — Beta fixes` heading, prioritized by Vivian's pain.

---

## Cross-phase: ongoing

- After every PR merge: deploy lands on production via Vercel. Owner
  smoke-tests the public landing page + login + dashboard.
- Weekly: review Anthropic + Cloudflare + Resend usage in their dashboards.
  Flag any 5x cost spike before it's a 50x cost spike.
- Backups: Supabase Pro auto-backups daily. Owner exports manually on
  any phase boundary (between phases).

---

## Session log

Append a session entry every time you stop work. Format:

```
### YYYY-MM-DD (claude-code session)
Shipped:
- 1.1: login page with magic link
- 1.2: auth callback route
Blocked:
- 1.3: integration test framework not yet set up; tracked under task 1.3
Next:
- 1.3 (fix), then 1.4
```

<!-- session log entries below -->
