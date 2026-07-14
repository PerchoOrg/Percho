# Percho pipeline — cost model (per-reel, tiered)

**Scope**: end-to-end cost of one 60-second, 1080×1920 reel from source-fetch
through publish delivery. Numbers are grounded in POC evidence (Peachtree
Corners v1 + Decatur v1), 2026 vendor pricing, and the architecture decisions
in [`orchestration.md`](./orchestration.md) and [`interfaces.md`](./interfaces.md).

Aligned with CLAUDE.md §7 (cost guardrails) and memory positioning:
GA-only, selling-only, no bilingual schema (marketing captions only).

---

## 0. TL;DR

| Volume        | Tag (LLM) | Render | Storage/mo | Delivery @100 views/reel | **Total/mo** |
|---------------|-----------|--------|------------|--------------------------|--------------|
| 100 reel/mo   | $3.63     | $0.10  | $0.50      | $10.00                   | **~$14**     |
| 1,000 reel/mo | $36.30    | $1.04  | $5.00      | $100.00                  | **~$142**    |
| 10,000 reel/mo| $363.00   | $10.40 | $50.00     | $1,000.00                | **~$1,423**  |

**Per-reel marginal cost ≈ $0.038** (tag+render+1-month storage).
**Per-reel LTV cost @ 100 views ≈ $0.14** (adds delivery + 1yr storage).

**Not included**: EC2 baseline (percho-render-worker t3.medium, ~$30/mo flat),
Supabase Pro ($25/mo flat), CF Workers/Queues (free tier covers <10K/mo),
Vercel (free/hobby covers marketing). These are **fixed platform cost**, not
per-reel — see §5.

---

## 0.1 Voice-over tier decision (2026-07-12)

**PoC → uses Microsoft `edge-tts` (free, no API key).** Andrew multilingual
male / Ava multilingual female. Good enough to validate the pipeline. Cost = $0.

**Launch → migrate to ElevenLabs** for production reels. Rationale:

- ElevenLabs is the TTS quality ceiling right now — natural pacing, emotion,
  breath, no robotic seams on long-form. Everything else (edge-tts, Azure
  Neural, OpenAI TTS, Play.ht) is a tier below on real-estate voice-over.
- **Voice cloning is a differentiator we can charge for.** Agent uploads
  60-90s of their own voice → we clone it → every listing reel goes out in
  their voice. Reelestate.dev has zero equivalent.

**Pricing plan**:

| Tier         | Included / mo | Notes                                                       |
|--------------|---------------|-------------------------------------------------------------|
| Starter $5   | ~30k chars    | Not enough at scale — dev/QA only                            |
| Creator $22  | ~100k chars   | ~1,700 reels/mo of VO (@60 char/sec × 55s). Our launch tier |
| Pro $99      | ~500k chars   | ~8,000 reels/mo. Trigger when we cross ~1,500 reels/mo real usage |
| Scale $330   | ~2M chars     | Enterprise, includes instant voice cloning at scale         |

At ~55s VO per reel and ~11 chars/sec conservative rate → **~600 chars/reel**.
Creator $22 covers ~165 reels/mo before per-char overage; Pro $99 covers
~830. We'll bump tiers based on actual usage, not upfront.

**Voice cloning as a paid agent feature**:

- Free tier agent: uses shared Percho voices (2-3 male, 2-3 female, curated).
- Paid tier ($X/mo TBD, likely $29-49): agent uploads voice sample, gets
  their own cloned voice, applied automatically to every reel they publish.
  ElevenLabs Instant Voice Cloning (available on Creator+) — a few minutes
  of sample → usable clone. Professional cloning (30 min of clean audio,
  higher fidelity) available on Pro+.

**Cost impact on per-reel math**: replaces the current $0 TTS line with
~$0.013/reel at Creator tier ($22 ÷ 1700 reels), or ~$0.012 at Pro.
Rounds to same "~$0.01 VO" bucket in §1 — negligible vs LLM tagging.

**Fallback**: keep edge-tts wired in as a degraded path if ElevenLabs is
down or per-agent quota is exceeded, so publish never blocks on TTS.

---

## 1. Cost per reel — line items

Grounded in POC:
- PTC v1: 22 wikimedia assets → 14 clips in composition, 60s output, 2.5 MB
- Decatur v1: 22 wikimedia assets → 14 clips, 60s output, 2.9 MB
- ffmpeg wall time: ~90s on t3.medium (measured, PTC compose.py run)

### 1.1 Source fetch — $0.00

| Source            | Cost                                     |
|-------------------|------------------------------------------|
| Wikimedia Commons | Free (rate-limited to ~500 req/min)     |
| Unsplash          | Free dev tier (50 req/hr), Prod = free after approval |
| Pexels/Pixabay    | Free (fallback if Unsplash quota hits)  |
| MLS photos        | Agent-supplied (Supabase Storage cost only, see §1.4) |
| Google Places     | **Excluded** — not per-reel; autocomplete session billed at agent-lookup time (~$0.017/session, capped by CLAUDE.md §7) |

**Assumption**: fetches are cached (`content_items.hash` UNIQUE in schema.sql).
A neighborhood re-fetch hits cache. Per-reel amortized ≈ $0.

### 1.2 Tagging — $0.0363/reel (Anthropic Sonnet 4.5)

Two-layer tagging per `interfaces.md §Tagger`:
- **rule tagger**: pure function, no network → **$0**
- **llm tagger** (L2 vibe): only called when rule-tagger doesn't emit L2

Per reel budget (upper bound — assumes LLM called on every item):
- Input: 22 items × ~300 tok (title + snippet + URL) = **6,600 tok**
- Output: 22 items × ~50 tok (2–3 L2 tags + confidence) = **1,100 tok**
- Sonnet 4.5 pricing: $3/M input, $15/M output
- Cost: `6600×3e-6 + 1100×15e-6` = **$0.0363**

`max_tokens` cap enforced per CLAUDE.md §7 (100 tok output cap → hard ceiling $0.005 output).

**Optimization headroom**: batch 22 items in one prompt → shared system prompt
amortizes to ~2,000 in tok total → drops per-reel tag cost to **~$0.011**.
Deferred; POC uses per-item calls.

### 1.3 Render (ffmpeg on EC2) — $0.00104/reel

- Measured: 90s wall on t3.medium (2 vCPU, 4 GB, $0.0416/hr on-demand)
- Cost: `1.5 min × $0.0416/60` = **$0.00104**

Render happens on `percho-render-worker` systemd unit (see orchestration.md §2).
Idle EC2 is a **fixed cost** ($30/mo), not per-reel — see §5.

At 10K reel/mo → 15,000 render-minutes = 250 render-hours. A single t3.medium
has 720 wall-hours/mo, so **one worker fits 10K reel/mo at ~35% CPU utilization**.
Above that, add a second worker or move to c6i.large ($0.085/hr, 2× perf).

### 1.4 Storage (Cloudflare Stream) — $0.005/reel/month

- CF Stream storage: **$5 per 1,000 min stored per month**
- 1 reel = 60s = 1 min → **$0.005/reel/mo**
- Assumed retention: 12 months → **$0.06/reel lifetime storage**

Raw source assets (wikimedia/unsplash mp4/jpg) sit in **Supabase Storage**
(not Stream). ~1 MB avg × 22 assets/nbhd → 22 MB per neighborhood. Amortized
across ~10 reels/nbhd/mo → negligible (~$0.0001/reel at $0.021/GB/mo).

MLS photos (Phase E, deferred): agent uploads → Supabase Storage. ~2 MB × 20
photos = 40 MB/listing. At $0.021/GB/mo → **$0.0008/listing/mo**, trivial.

### 1.5 Delivery (Cloudflare Stream) — $0.001/view

- CF Stream delivery: **$1 per 1,000 min delivered**
- 1 reel view (assume 45s avg watch time, be conservative — count as 1 min)
- Cost per view = **$0.001**

**This is the dominant marginal cost at scale**. Delivery > everything else once
avg views/reel × N > ~50.

Per-reel LTV delivery @ 100 views = **$0.10**.
Viral outlier @ 10K views = **$10** for that single reel (still profitable if it
seeds one $15K listing lead — see moat scorecard in Phase F).

### 1.6 Publish — $0.00

- `percho-web`: internal no-op push (writes row in `publishes` table). Free.
- Rednote / WeChat Moments: manual paste flow (Phase E4 agent-upload-flow will
  formalize) → agent time, not pipeline cost. **$0 to Percho.**
- Instagram / TikTok (out of scope for v1).

---

## 2. Fixed platform cost (per month, not per reel)

| Item                              | Cost/mo | Notes                                                    |
|-----------------------------------|---------|----------------------------------------------------------|
| EC2 t3.medium (render-worker)     | $30.00  | On-demand 24/7. Reserved 1yr drops to ~$18.              |
| Supabase Pro                      | $25.00  | Required for RLS + edge functions + Storage >1 GB.       |
| Cloudflare Workers + Queues       | $5.00   | Paid tier; free tier covers <10K reel/mo. Add at N≥1K.   |
| Cloudflare Stream (base)          | $0      | Pure usage-based, no floor.                              |
| Vercel (marketing landing)        | $0      | Hobby covers v2 landing prototype.                       |
| Domain + email (Resend)           | $5.00   | Assumed already paid.                                    |
| **Total fixed**                   | **~$65**| Independent of reel volume up to ~10K/mo.               |

Anthropic API: **usage-only, no floor**.

---

## 3. Tiered totals

Assumption: each reel gets **100 views** on average over 12 months.

### N = 100 reel/mo (early POC, ~10 GA neighborhoods × 10 reel/nbhd)

| Line             | Monthly | Notes                              |
|------------------|---------|------------------------------------|
| Tag (LLM)        | $3.63   | 100 × $0.0363                      |
| Render (EC2 var) | $0.10   | Marginal; EC2 flat $30 in §2       |
| Storage (12mo)   | $6.00   | 1 mo retention × 100 reels running |
| Delivery @100    | $10.00  | 100 reel × 100 views × $0.001      |
| **Variable**     | **$19.73** |                                 |
| Fixed platform   | $65.00  | §2                                 |
| **All-in/mo**    | **~$85**| **~$0.85 per reel all-in**         |

### N = 1,000 reel/mo (GA statewide, MLS-integrated agents)

| Line             | Monthly  |
|------------------|----------|
| Tag (LLM)        | $36.30   |
| Render (EC2 var) | $1.04    |
| Storage          | $60.00   |
| Delivery @100    | $100.00  |
| **Variable**     | **$197.34** |
| Fixed platform   | $65.00   |
| **All-in/mo**    | **~$262** — **$0.26 per reel** |

### N = 10,000 reel/mo (multi-state / stretch)

| Line             | Monthly    |
|------------------|------------|
| Tag (LLM)        | $363.00    |
| Render (EC2 var) | $10.40     |
| Storage          | $600.00    |
| Delivery @100    | $1,000.00  |
| **Variable**     | **$1,973** |
| Fixed platform   | $65 + 2nd EC2 $30 = $95 |
| **All-in/mo**    | **~$2,068** — **$0.21 per reel** |

Note: at 10K/mo, GA-only assumption breaks (Percho would exceed GA MLS
inventory — see memory positioning). Model kept for stress-test only.

---

## 4. Sensitivity — what breaks the model?

Ranked by risk to per-reel unit economics:

1. **Viral views** — `delivery` scales linearly with views. If one reel hits
   100K views (~$100 delivery), it dominates the month. Mitigation: acceptable
   because virality = lead flow. Set CF Stream **monthly delivery cap** as
   circuit-breaker (fail-open to public poster image after cap).

2. **LLM tag cost drift** — if we upgrade to Opus or 2× output tokens, tag
   cost jumps 3–5×. **CLAUDE.md §7 pin to `claude-sonnet-4-5` is the guard.**
   `max_tokens=100` cap on the L2 tagger call is a hard ceiling.

3. **Anthropic model deprecation** — Sonnet 4.5 pricing could rise at v5 EOL.
   Batch-per-neighborhood optimization (§1.2 headroom) is the escape valve
   (~3× cost reduction).

4. **Retention creep** — every extra month of storage = $0.005/reel. At 10K
   reels held 5 years = $3,000/mo storage. **Retention policy in schema.sql
   (add `expires_at` column, cron soft-delete on Stream)** — deferred, tracked
   here.

5. **Render-worker underutilization** — flat $30/mo EC2 dominates at N<300.
   Below that, per-reel all-in cost is >$0.50 mostly from fixed platform.
   Break-even vs Fly.io Machines (~$0.02/render, no floor) at **N ≈ 200 reel/mo**.
   Not switching — EC2 is already provisioned and `percho-render-worker`
   systemd works (orchestration.md §2).

---

## 5. Guardrails (enforceable, per CLAUDE.md §7)

| Guardrail                              | Enforcement point                          |
|----------------------------------------|--------------------------------------------|
| Anthropic model pinned to Sonnet 4.5   | `ANTHROPIC_MODEL` env, single caller in Tagger.llm |
| `max_tokens=100` on L2 tag call        | Tagger.llm implementation                  |
| Google Places cached per session       | Marketing app client (out of pipeline)     |
| CF Stream upload ≤2 GB, ≤5 min         | TUS create endpoint (CLAUDE.md §7)         |
| Delivery monthly cap                   | CF Stream billing alerts + soft-limit env  |
| Resend rate-limited                    | Lead notification path (not per-reel)      |

Suggested billing alerts (Vercel/CF/Supabase/Anthropic dashboards):
- Anthropic: **warn $10/day** (would need 275 reel/day at $0.036 to trip)
- CF Stream delivery: **warn $50/mo** (50K views total across catalog)
- EC2: **warn if CPU >80% sustained 1h** — indicates second worker needed

---

## 6. Comparison against reelestate.dev (competitor)

reelestate.dev pricing (from competitive/teardown.md, if accurate): **~$99/reel**
one-time or **$299/mo unlimited**. Manual editorial workflow, no auto-compose.

Percho variable cost per reel: **$0.04–$0.14**. Unit-economics moat is
**~1000×** at the raw-render layer. Real gap narrows when we count fixed
platform ($65/mo) and agent-time-to-approve, but even at N=100 reel/mo
Percho's all-in $0.85/reel is 100× cheaper than a $99/reel service.

This is the auto-compose pillar of the three-support moat (F2 scorecard).

---

## 7. Open questions (deferred, not blockers)

- **Q1** — Retention policy: default 12 months on Stream, or move cold reels
  to R2 archive after 90 days? Cost trade: R2 = $0.015/GB/mo vs Stream
  $5/1000 min. At 60s + 3 MB avg, Stream wins for reels <2GB total. Revisit
  at 5K reel volume.
- **Q2** — Do we bill agents per-reel or flat monthly? Ties to product pricing,
  not pipeline. Answered by F3 final report.
- **Q3** — Should we cache LLM tag results across neighborhoods for
  cross-cutting L2 vibes (e.g. "walkable" applies to Decatur + Peachtree
  Corners the same way)? Would drop tag cost 30–50% at scale. Ranker layer
  boundary — track in interfaces.md §9.

---

## 8. Memory alignment

- **GA-only**: cost model bounds N ≤ ~2K reel/mo before GA MLS inventory caps.
  Above that, model is illustrative only.
- **Selling-only**: delivery-cost analysis assumes listing/discovery views,
  not community engagement views (multiplier is agent-lead conversion, not
  ad revenue).
- **No bilingual schema**: no double-tagging cost, no per-language render.
  Multilingual captions live in `captionByLocale` at Publisher layer only —
  zero per-locale LLM cost (agent-supplied strings), only marginal render
  time (~5s extra per language variant, deferred to Phase E).

Zero `app/` changes. Zero code changes. Cost figures grounded in POC
measurements, POC schema (`schema.sql`), POC interfaces
(`interfaces.md`), and public vendor pricing.
