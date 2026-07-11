# Overnight Summary — KW Atlanta Meetup Prep
_Generated overnight. Read this first when you wake up._

---

## ⚡ TL;DR

- **Meetup collateral is done** — pitch, one-pager, Q&A playbook, business card draft, discovery questions, landing-page copy, and a 30-sec Ken Burns demo video (mp4, 8.5MB) all sit under `docs/meetup-kw-atlanta/` and `docs/ken-burns/demo/`.
- **Landing page `/agents` is live in-repo** — public route + waitlist form + API + dashboard viewer + Supabase migration. Ready to ship to Vercel so the QR code has a real URL by Tuesday.
- **FMLS integration is scaffolded (not wired)** — Bridge client, address autofill, sync worker, RESO types, tests, migrations, and full compliance docs. Needs FMLS creds + broker sign-off before it can talk to real data.

---

## 📖 Read these first (in order)

1. **`docs/meetup-kw-atlanta/pitch-script.md`** — your 30-second, 2-minute, and 5-minute pitches. Memorize the 30-sec.
2. **`docs/meetup-kw-atlanta/qa-playbook.md`** — anticipated agent objections + answers. Read once, don't memorize.
3. **`docs/meetup-kw-atlanta/discovery-questions.md`** — questions to ASK them. This is the meeting; the pitch is the intro.
4. **`docs/mls-integration/README.md`** — what the FMLS scaffold does and doesn't do. Read only if an agent asks about MLS.

---

## 📦 What's on disk now

### 1. Meetup prep — `docs/meetup-kw-atlanta/`
```
pitch-script.md            30s / 2min / 5min pitches
one-pager.md               printable single-page overview
qa-playbook.md             objection handling
discovery-questions.md     questions to ask agents
business-card.md           card copy (has [PLACEHOLDER]s)
business-card.svg          card design (logo is placeholder)
landing-page-copy.md       source copy for /agents
qr-and-signage.md          table sign + QR code notes
qr/                        percho-co-agents.png (800x800), table-sign.html (letter-size printable), README.md
business-card.pdf          print-ready PDF from SVG
meetup-notes-template.md   fill in during/after meeting
```
**Why it matters:** everything you physically hand to or say to an agent on Tuesday lives here. Print, memorize, or hand out.

### 2. FMLS integration — `lib/mls/`, `docs/mls-integration/`, `supabase/migrations/*mls*`, `__tests__/mls/`, `app/api/mls/`
```
lib/mls/bridge-client.ts          Bridge Interactive REST client
lib/mls/address-autofill.ts       autocomplete-by-address helper
lib/mls/sync-worker.ts            nightly sync stub
lib/mls/reso-types.ts             RESO Web API type defs
app/api/mls/autofill/route.ts     server-side autofill endpoint
__tests__/mls/*.test.ts           unit tests (mocked)
supabase/migrations/…_mls_tables.sql   listings/media/agents tables
docs/mls-integration/README.md         architecture overview
docs/mls-integration/data-model.md     RESO field mapping
docs/mls-integration/compliance-checklist.md   FMLS/Bridge legal steps
```
**Why it matters:** this is the "MLS integration" story you'll be asked about. The scaffold + docs let you speak credibly ("we're on Bridge, RESO-compliant, waiting on broker sign-off") without over-claiming.

### 3. Ken Burns demo — `scripts/ken-burns/`, `docs/ken-burns/`
```
scripts/ken-burns/generate.py         ffmpeg-based zoom/pan renderer
scripts/ken-burns/lambda-wrapper.py   AWS Lambda entrypoint
scripts/ken-burns/reproduce-demo.sh   one-command demo rebuild
scripts/ken-burns/README.md           usage
docs/ken-burns/pitch-notes.md         talking points about the video
docs/ken-burns/demo/percho-slideshow-demo.mp4   ← 8.5MB, THE demo video
docs/ken-burns/demo/photos/           source stills
docs/ken-burns/demo/bgm.mp3           background music
docs/ken-burns/demo/ending-card.json  end-frame config (wordmark + CTA)
```
**Why it matters:** the mp4 is your live demo on Tuesday. Airdrop it to your phone.

### 5. Live autofill demo — `app/(public)/demo/autofill/`
```
app/(public)/demo/autofill/page.tsx                 pitch-time demo route
app/(public)/demo/autofill/_components/AutofillDemo.tsx  address search + preview
app/api/demo/autofill/route.ts                      GET ?q= mock endpoint
lib/mls/mock-data.ts                                10 realistic Atlanta listings
```
**Why it matters:** your "type an address, we fill everything" pitch — LIVE, on your phone, in front of the agent. No creds needed. URL: `https://<preview>/demo/autofill`.

### 4. Landing page — `app/(public)/agents/`, `app/api/agents/`, `app/dashboard/agents/`, `supabase/migrations/*waitlist*`
```
app/(public)/agents/page.tsx                     public /agents route
app/(public)/agents/_components/WaitlistForm.tsx  email + name + brokerage form
app/api/agents/waitlist/route.ts                 POST handler → Supabase
app/dashboard/agents/waitlist/page.tsx           admin viewer for signups
supabase/migrations/…_agent_waitlist.sql         waitlist table + RLS
```
**Why it matters:** the QR code on your table sign points here. Ship this to Vercel first so the URL is live before Tuesday.

---

## 📋 Verified working

- `tsc --noEmit` clean across all new TS files.
- `__tests__/mls/*` — bridge-client + address-autofill unit tests pass (mocked network).
- `docs/ken-burns/demo/percho-slideshow-demo.mp4` — renders end-to-end via `reproduce-demo.sh`; playable, 8.5MB, ~30s.
- `POST /api/agents/waitlist` — smoke-tested locally, returns 200 with valid payload, 400 on missing email.
- Migrations parse (`supabase db lint` clean); not yet applied to remote.

---

## 🎯 你需要做 — Owner TODOs before Tuesday

- [ ] Fill placeholders in `business-card.md` and `business-card.svg` (name, phone, WeChat ID, real logo).
- [ ] Print `docs/meetup-kw-atlanta/qr/table-sign.html` (open in browser, ⌘P → letter size). QR PNG + PDF business card also ready under `qr/` and `business-card.pdf`.
- [ ] Airdrop `docs/ken-burns/demo/percho-slideshow-demo.mp4` to your phone. Play it once. Confirm audio + video both work.
- [ ] Set `BRIDGE_ACCESS_TOKEN` and `BRIDGE_DATASET_ID` in `.env.local` — **won't actually connect until broker paperwork is signed**, but keeps tsc happy.
- [ ] Decide: run `supabase db push` locally now, or wait until you merge? (Recommend: apply waitlist migration now so `/agents` works on preview.)
- [ ] Read `app/(public)/agents/page.tsx` copy end-to-end. Change any wording that sounds AI-written.
- [ ] Memorize the 30-second pitch from `pitch-script.md`. Say it out loud 5 times.

---

## 🚀 Merge / deploy plan

1. **Review the diff.** `git status` — everything is untracked. Skim by group.
2. **Create the phase branch.** `git checkout -b phaseNN/meetup-prep-and-mls-scaffold` (pick next N from DEVLOG).
3. **Commit landing page + waitlist migration first.** This ships to Vercel and gives you a live `/agents` URL for the QR code before Tuesday.
   - Files: `app/(public)/agents/**`, `app/api/agents/**`, `app/dashboard/agents/**`, `supabase/migrations/*agent_waitlist*`
4. **Commit FMLS scaffold as a separate commit.** Nothing user-visible ships — safe to merge whenever.
   - Files: `lib/mls/**`, `app/api/mls/**`, `__tests__/mls/**`, `supabase/migrations/*mls*`, `docs/mls-integration/**`, `.env.example`
5. **Commit meetup docs + Ken Burns generator.** Docs and scripts only.
   - Files: `docs/meetup-kw-atlanta/**`, `docs/ken-burns/**` (excluding the mp4 — keep binary out of git), `scripts/ken-burns/**`
6. **Do not commit `percho-slideshow-demo.mp4`.** 8.5MB binary — keep it on your phone. Add to `.gitignore` if needed.

---

## ⚠️ Known gaps / not done

- **Business card logo is a placeholder** in the SVG. No brand identity was designed overnight — needs a designer (or you deciding it's fine as-is). PDF export is ready under `business-card.pdf`.
- **Condo demo variant attempted then dropped.** Tried a Buckhead-luxury-condo second video; picsum/unsplash-source stills weren't actual real-estate photos and one QA frame showed pure haze. Not shippable to a meetup. If you want a second demo, we need real luxury-condo stills (an Unsplash API key, a licensed stock buy, or your phone photos of a real Buckhead unit).
- **`/demo/autofill` uses Unsplash CDN URLs** for photos. Fine for a demo, but images may 404 if Unsplash rotates — verify Sunday night before Tuesday.
- **Landing page has no email confirmation flow.** Signups go straight into the DB. No double opt-in, no welcome email. Fine for a small beta.
- **No Stripe / no pricing page.** Correct — product is free during beta. Don't discuss pricing on Tuesday.
- **FMLS credentials still pending.** Scaffold cannot make real calls until you finish broker paperwork with Bridge Interactive. Until then, `/api/mls/autofill` will 500 on real requests.
- **Migrations not applied to any remote.** You must decide: local Supabase now, or wait until phase merge.

---

## 🗓️ Meeting flow suggestion (30 min)

- **0–5 min — Pitch (you talk).** 30-sec opener, then let them react. If they lean in, extend to the 2-min. Don't do the 5-min unless asked.
- **5–15 min — Demo (show, don't tell).** Play the mp4 on your phone (~30s). Then show `/agents` landing page live on your phone. Let them scan the QR and sign up in front of you if they're interested.
- **15–30 min — Listen (they talk).** Work through `discovery-questions.md`. Take notes in `meetup-notes-template.md` right after (don't scribble during — makes it feel like an interview).

**One rule:** if they start asking product questions in the listening block, redirect back to their workflow. You're there to learn, not to sell.

---

## 📁 Final file paths

- `/home/ubuntu/Percho/docs/meetup-kw-atlanta/OVERNIGHT-SUMMARY.md`
- `/home/ubuntu/Percho/docs/meetup-kw-atlanta/README.md`
