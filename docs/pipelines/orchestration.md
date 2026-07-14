# Pipeline Orchestration (D3)

**Purpose**: for each of the 6 layers defined in `interfaces.md`, pick a
compute host — Cloudflare Worker (edge / cron), Supabase Edge Function
(Deno at the DB), or EC2 `percho-render-worker` (already running as
systemd) — and justify it. Also freeze the queue / job model that
stitches the layers together.

Consumed by D4 (`cost-model.md`), and later by app/ implementers.
**No code in `app/` yet.**

**Alignment (memory-first)**:
- GA-only: every `Source.discover` call is scoped by `neighborhoodSlug`;
  no cron job pulls "the whole US" then filters — cost model would
  explode. See §2 Source.
- Selling-only: orchestrator entrypoints are `neighborhood-explainer`
  and `listing-reel`. No `community-social` cron ever scheduled.
- Multilingual only at `Publisher.captionByLocale`. All jobs, queues,
  and DB rows use English identifiers.
- Conflict with CLAUDE.md §1 registered in `reuse-report.md §8`; not
  resolved here — D3 is memory-aligned.

---

## 0. TL;DR mapping

| Layer      | Host                          | Trigger                                  | Runtime budget |
|------------|-------------------------------|------------------------------------------|----------------|
| Source     | Cloudflare Worker (cron)      | `0 */6 * * *` per neighborhood           | <30s wall      |
| Fetcher    | EC2 `percho-render-worker`    | Queue: `fetch_jobs` row inserted by Src  | 5-120s / item  |
| Tagger.rule| Supabase Edge Function (Deno) | DB trigger on `content_items` insert     | <2s / item     |
| Tagger.llm | Cloudflare Worker (queue)     | Row where L2 tags empty after rule pass  | <10s / item    |
| Ranker     | Cloudflare Worker (on-demand) | HTTP call from orchestrator              | <500ms         |
| Composer   | EC2 `percho-render-worker`    | Queue: `render_jobs` row (existing table)| 20-90s / reel  |
| Publisher  | Cloudflare Worker (queue)     | Row insert in `publish_jobs`             | <15s / target  |
| Orchestrator | Cloudflare Worker (cron+HTTP)| `0 12 * * *` daily + manual POST         | <60s wall      |

**One-liner**: **Edge is stateless glue, EC2 is bytes.** Anything that
touches a file >1MB or spawns ffmpeg → EC2. Anything that reads/writes
JSON, calls an API, or runs zod validation → CF Worker / Supabase EDF.

---

## 1. Compute host inventory (what we actually have)

### 1.1 Cloudflare Workers
- Already used for `percho.com` (Next.js on Vercel + Workers for
  redirects / signed URLs). Free tier: 100k req/day, 10ms CPU / req
  (bumped to 30s wall for cron). Paid: 50ms CPU / req, unlimited.
- **Strengths**: instant cold start, cheap, global, native `fetch`,
  built-in cron triggers, KV + Queues built in.
- **Weaknesses**: no FFmpeg (WASM ffmpeg exists but 10x slower and
  hits CPU cap). No local filesystem. No long-poll worker >30s.
- **Fits**: Source, Ranker, Publisher, Orchestrator. Tagger.llm (calls
  Anthropic, no bytes).

### 1.2 Supabase Edge Functions (Deno)
- Deno runtime running near Postgres. Cold start ~200ms. 150s wall.
  Free tier 500k invocations/mo.
- **Strengths**: SQL-native (`supabase-js` on the server, RLS bypass
  via service role from a trusted context), row-level DB triggers via
  `pg_net` or `supabase_functions.http_request`. Perfect for
  compute-light DB-adjacent work.
- **Weaknesses**: cold-start latency for burst traffic, no long-lived
  connections, subject to Deno / npm compat quirks, no big binary
  deps.
- **Fits**: Tagger.rule (pure function over DB rows), small DB fanouts
  (e.g. queue insert). NOT good for anything CPU-heavy.

### 1.3 EC2 `percho-render-worker` (systemd, already live)
- `/etc/systemd/system/percho-render-worker.service` — running as
  `ubuntu`, `python3 scripts/render-worker/worker.py`, Restart=always.
  Currently: polls `render_jobs` table, downloads photos, runs
  `scripts/ken-burns/generate.py`, uploads to Cloudflare Stream.
- **Strengths**: full Linux, ffmpeg, PIL, unlimited wall time, big
  disk, persistent /tmp for intermediate frames. Already integrated
  with Supabase Storage + CF Stream.
- **Weaknesses**: single node = single point of failure; scale = provision
  more EC2. No horizontal autoscale today. Cost is fixed monthly
  (~$30-50 for t3.medium) regardless of load.
- **Fits**: Fetcher (needs disk + sha256 over full bytes),
  Composer (ffmpeg). Nothing else.

### 1.4 Postgres itself (Supabase)
- Only used for storage + triggers. Never for compute logic beyond
  simple CHECKs and generated columns. `pg_net` / edge function
  triggers used sparingly — cascade risk.

---

## 2. Per-layer decision

### 2.1 Source → CF Worker (cron)

**Host**: Cloudflare Worker.
**Trigger**: cron per neighborhood, `0 */6 * * *` (every 6h). Also
manual via `POST /orchestrator/discover?slug=peachtree-corners`.
**Why not EC2**: Source.discover only emits URLs + metadata JSON. No
bytes downloaded. Fits in <30s CPU-time even for 10 sources × 30
candidates. Wasting an EC2 slot on this blocks the render queue.
**Why not Edge Function**: Wikimedia API responses can be 100-500KB
JSON; parsing 10 of them approaches the Deno cold-start memory
ceiling on free tier. CF Worker has better `fetch` fan-out primitives
(`Promise.all` over 10 sources is idiomatic).
**Emits**: rows into `fetch_jobs (candidate jsonb, neighborhood_slug,
status='queued')`.
**Idempotency**: dedupe on `(source_kind, source_id)` inside CF KV
before enqueueing — prevents re-queueing the same Wikimedia file every
6h.
**Failure mode**: Worker retries via cron. If a source is down for
>24h, `Source.lastRunAt` alert (D4 monitoring).

### 2.2 Fetcher → EC2 render-worker

**Host**: `percho-render-worker` (existing systemd).
**Trigger**: polls `fetch_jobs WHERE status='queued'` every 5s (already
the pattern used for `render_jobs` — reuse the poll loop).
**Why**: bytes. sha256 needs the full file. Wikimedia CDN downloads
range 200KB-50MB; MLS photos 2-8MB × N. CF Worker's 100MB response
budget + 30s CPU can't cover a manifest of 30 items.
**Also**: storage write to Supabase Storage bucket needs the service
role key (per CLAUDE.md §3, only in secured server contexts) — EC2
`.env` file is the correct home for that key.
**Emits**: `content_items` row + `storage_ref` row (writes bytes to
`raw/` bucket first). Sets `fetch_jobs.status='done'`.
**Idempotency**: on `content_items.sha256_unique` (schema §content_items).
Duplicate fetch is a fast no-op (existing row returned).
**Concurrency**: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` — the
same pattern `worker.py` already uses. Multi-node friendly if we
later scale EC2 horizontally.

### 2.3 Tagger.rule → Supabase Edge Function

**Host**: Supabase Edge Function (`tagger-rule`).
**Trigger**: DB trigger on `content_items` insert, invoked via
`supabase_functions.http_request` (or `pg_net` if we drop the wrapper
extension). Async, non-blocking on the inserting transaction.
**Why**: pure function, no bytes needed — only signals (filename,
license, dimensions, source_kind). Runs in <100ms. Living next to
Postgres means we skip an extra network hop.
**Alternative rejected**: doing it inline in the Fetcher (EC2)
couples two concerns and blocks the fetch loop on tag logic; also
duplicates the rules in Python and TS. **Deno TS is the source of
truth** for rule tagger post-refactor (see `architecture-v2.md §5`).
**Emits**: `tags` rows with `source='rule'`.
**Failure mode**: idempotent (delete rules-tagged rows + reinsert on
retry). If DB trigger fails, a nightly reconciler catches gaps.

### 2.4 Tagger.llm → CF Worker (queue)

**Host**: Cloudflare Worker consuming a CF Queue (`tagger_llm`).
**Trigger**: after Tagger.rule finishes, if the item's L2 tags are
empty AND `intent='neighborhood-explainer'` (listing-reels skip LLM
tagging — MLS photos have known slots), enqueue.
**Why**: single Anthropic API call per item. No bytes. CPU budget is
the LLM latency, not local compute. CF Queue gives us:
- retries on 5xx from Anthropic (built-in exponential backoff)
- concurrency cap (protects Anthropic spend — CLAUDE.md §7)
- dead-letter queue for permanent failures
**Model**: `claude-sonnet-4-5`, `max_tokens: 200`, only outputs L2
vibe list (schema-shaped JSON). Cost bounded by D4.
**Alternative rejected**: EC2 — waste of a render slot on a network-
bound call. Supabase EDF — 150s wall is fine but no built-in queue
retry semantics; would have to hand-roll.
**Emits**: `tags` rows with `source='llm'`.

### 2.5 Ranker → CF Worker (on-demand HTTP)

**Host**: Cloudflare Worker (`ranker` route).
**Trigger**: called by Orchestrator (§2.8) as a plain HTTP request:
`POST /ranker/rank { neighborhood, structure, poolIds[] }`.
**Why**: pure function. Loads content_items + tags from Postgres via
`supabase-js`, applies the priority chain (`hook>aerial>skyline>
motion>landmark_wide>signage`, see `video-composition.md §复盘`),
returns ordered clip IDs. <500ms typical. No bytes.
**Why not inline in Orchestrator**: separation of concerns — Ranker
is unit-testable independently; also enables A/B ranking policies
later (different Worker route → same interface).
**Emits**: response JSON `{ compositionPlanDraft }`. Nothing written
to DB — Composer will persist the plan.

### 2.6 Composer → EC2 render-worker

**Host**: `percho-render-worker` (same box as Fetcher).
**Trigger**: `render_jobs` row inserted by Orchestrator (§2.8) — this
table already exists in production (used by the ken-burns worker).
Reuse.
**Why**: ffmpeg. Full stop. WASM ffmpeg in CF Workers is technically
possible but 10x slower and hits CPU-time cap on a 60s reel.
**Byte-identical requirement** (from `interfaces.md §Composer`): the
`plan.ffmpegCmd` string is persisted verbatim; re-render uses that
exact string. EC2 python `subprocess` is the natural shell.
**Emits**: `compositions` row (`status='ready'`, `plan jsonb`,
`output_storage_ref`). Uploads mp4 to `renders/` bucket + optionally
to CF Stream (existing worker.py path already does this).
**Concurrency**: same `FOR UPDATE SKIP LOCKED` pattern as Fetcher.
Right-size N workers per queue depth (D4 will cost this).
**Colocation with Fetcher**: same systemd unit today runs both loops
in one process (`worker.py` has one poll loop per job type). Fine
until queue depth diverges — then split into
`percho-fetch-worker` + `percho-compose-worker` systemd units.

### 2.7 Publisher → CF Worker (queue)

**Host**: Cloudflare Worker consuming CF Queue (`publish_jobs`).
**Trigger**: `publish_jobs` row insert by Orchestrator OR by manual
`POST /orchestrator/publish?compositionId=...&platforms=[...]`.
**Why**: pure network — POST to Rednote / WeChat / Instagram Graph
API / percho-web. No bytes locally (video is already in Supabase
Storage / CF Stream; publisher passes a URL). CF Worker has:
- OAuth token refresh via KV (secrets stored in Worker Secrets, not env)
- rate-limit envelope per platform (KV counters)
- retry semantics from CF Queue
**Percho-web publisher**: no-op — flips `publishes.status='live'` +
records `percho.com/<slug>/reel/<id>` URL. No external API call.
**Emits**: `publishes` row (idempotent per schema unique constraint).

### 2.8 Orchestrator → CF Worker (cron + HTTP)

**Host**: Cloudflare Worker with two entrypoints:
- `scheduled` handler: cron `0 12 * * *` runs `makeReel()` for each
  neighborhood that needs a refresh (staleness rule: no composition
  in last 30 days).
- `fetch` handler: `POST /orchestrator/make-reel { slug, intent }` for
  manual + agent-triggered runs.
**Why here**: the orchestrator is control flow, not data. It calls
Ranker (HTTP), inserts `render_jobs` (SQL), then returns immediately
with the pending `compositionId`. Async — see §4.
**No-EC2 rationale**: putting orchestration on the EC2 box couples
"is the render worker healthy?" with "is the pipeline scheduled?".
Separating them means: EC2 can crash → renders pause → but
orchestrator keeps queueing / responding to HTTP.

---

## 3. Queue / job model

Three queue tables in Postgres (Supabase), plus two CF Queues:

| Queue           | Where       | Consumer           | Row / message shape                             |
|-----------------|-------------|--------------------|-------------------------------------------------|
| `fetch_jobs`    | Postgres    | EC2 render-worker  | `{ candidate jsonb, neighborhood_slug, status }`|
| `render_jobs`   | Postgres    | EC2 render-worker  | `{ composition_plan_draft jsonb, ... }` (exists)|
| `publish_jobs`  | Postgres    | CF Queue trigger*  | `{ composition_id, platform, captions jsonb }`  |
| `tagger_llm`    | CF Queue    | CF Worker          | `{ content_item_id }`                           |
| `orchestrator`  | CF Queue    | CF Worker          | `{ slug, intent, priority }` (fanout from cron) |

`*` Publish jobs land in Postgres for auditability (agent sees "this
reel is pending publish"), then a Supabase EDF fans them out to CF
Queue for the actual send. This keeps the DB as system of record.

**Why mix Postgres and CF Queue?**
- Postgres queues: audit trail, agent-visible status, transactional
  insert alongside data (e.g. insert composition + render_jobs row in
  one txn).
- CF Queues: retry semantics, dead-letter, no polling cost. Great for
  fire-and-forget external calls (Anthropic, Rednote).

**Rule of thumb**: if the agent needs to see it in a dashboard, it's
in Postgres. If it's an implementation detail of an external call,
it's in CF Queue.

---

## 4. Sync vs async render (interfaces §9 Q2)

**Answer: async** — this was already the recommendation and D3 formalizes it.

Flow:
1. Orchestrator calls Ranker → gets `compositionPlanDraft`.
2. Orchestrator INSERTS `compositions (status='queued', plan=...)`
   and `render_jobs (composition_id, status='queued')` in one txn.
3. Orchestrator returns `{ compositionId, status: 'queued' }` (HTTP 202).
4. EC2 worker picks up `render_jobs`, renders, updates
   `compositions.status='ready'` + `output_storage_ref`.
5. Client polls `GET /compositions/:id` (or subscribes to a Supabase
   Realtime channel on that row).

**Reasons sync render is rejected**:
- CF Worker fetch handler wall time <30s (paid: 5min). Composer takes
  20-90s. Would time out on longer reels.
- Blocking a Worker on an ffmpeg run wastes an execution slot at
  edge cost.
- Sync coupling means one EC2 crash = agent-facing 5xx.

**Reasons sync render is tempting** (but not enough):
- Simpler mental model for MVP. Rejected — we already have async
  worker.py in prod; changing the direction is more work than keeping it.

---

## 5. Failure model + observability

- **Every worker** logs to Postgres `job_events` table (job_id, ts,
  level, message, error jsonb). Structured logs, not stdout.
- **Retry policy**:
  - `fetch_jobs`: 3 tries, exponential (10s / 60s / 5min). After 3,
    `status='failed'` + `error` column.
  - `render_jobs`: 2 tries. Renders are expensive; more than 2 is
    almost certainly a bad plan, not a transient error.
  - CF Queues: default (~5 retries, ~backoff, then DLQ).
- **Health checks**:
  - EC2 worker: `SELECT count(*) FROM render_jobs WHERE status='queued'
    AND created_at < now() - '10min'::interval` → alert if >0.
  - CF Workers: Cloudflare Analytics (built-in).
- **PII redaction** (CLAUDE.md §3.6): job_events never logs raw
  addresses / emails. Publish payloads mask before insert.

---

## 6. Secrets placement

Per CLAUDE.md §3 (service role key ≠ browser bundle):

| Secret                          | Home                                    |
|---------------------------------|-----------------------------------------|
| `SUPABASE_SERVICE_ROLE_KEY`     | EC2 `.env` (worker) + Supabase EDF env  |
| `ANTHROPIC_API_KEY`             | CF Worker Secrets (`tagger_llm`)        |
| `CLOUDFLARE_STREAM_TOKEN`       | EC2 `.env` (worker)                     |
| MLS / IDX credentials           | EC2 `.env` (fetcher) — never client     |
| Rednote / WeChat OAuth tokens   | CF Worker Secrets + KV refresh cache    |

Never in `app/` client bundles. Never in migrations. Never committed.

---

## 7. Deferred to D4 (cost-model.md)

1. Per-worker EC2 sizing at 100 / 1000 / 10000 reels-per-month.
2. Anthropic spend envelope at each tier (Tagger.llm token budget).
3. Cloudflare Stream storage + delivery cost per reel.
4. Wikimedia rate-limit headroom (unlimited per docs, but we'll
   verify with a burst test in Phase E).
5. Whether we need to split `percho-render-worker` into two systemd
   units (fetch vs compose) or scale by count first.

---

## 8. Migration path from today's setup

Today: `percho-render-worker` renders listing videos from MLS photos
(Phase 71 ken-burns pipeline). It does NOT yet consume `fetch_jobs`
or emit `content_items` for neighborhood pipelines.

**Step 1** (before touching app/): add a second poll loop in
`worker.py` for `fetch_jobs` — mirror the existing `render_jobs`
loop pattern. Runs alongside the current ken-burns loop.

**Step 2**: deploy the two CF Workers (Source cron, Ranker HTTP) with
a **dry-run flag** — they emit into a `_shadow` schema, not `public`.
Compare output against the current shim-based pipeline
(`poc-output/decatur-v1.mp4` reproducible byte-diff — see reuse-report
§6 break-even).

**Step 3**: cut over Ranker + Orchestrator; keep Composer running the
existing python compose.py (via architecture-v2 refactor). Publisher
last, since it touches live external APIs.

Everything reversible until Step 3.

---

## 9. What this doc does NOT decide

- **Framework for CF Workers**: Hono vs raw. Owner call, but Hono is
  the strong default given app/ already uses Next.js middleware
  patterns.
- **Whether to use PGMQ** instead of hand-rolled Postgres queue
  tables. Nice-to-have; hand-rolled is fine at <10k reels/mo.
- **Multi-region EC2**. Single us-east-1 box is enough until D4 says
  otherwise.

---

**Cross-refs**:
- Interfaces: `docs/pipelines/interfaces.md` (D2)
- Schema: `docs/pipelines/schema.sql` (D1)
- Refactor precondition: `docs/pipelines/architecture-v2.md §6`
- Ranker priority chain: `docs/pipelines/video-composition.md §复盘`
- Existing EC2 unit: `/etc/systemd/system/percho-render-worker.service`
  (`scripts/render-worker/worker.py`)
