# Pipeline Interfaces (D2)

**Purpose**: freeze the 6-layer TypeScript contract that turns "a GA neighborhood
slug" into "a published reel". Reference for D3 (orchestration) and D4 (cost).
Consumed by future `app/` implementers; **no code in `app/` yet**.

**Alignment (memory-first)**:
- GA-only: every `Source` filters to GA localities. Non-GA content is rejected
  at fetch, not at compose.
- Selling-only: `Composition.intent` ∈ {`neighborhood-explainer`,
  `listing-reel`}. No rental / community-social intents.
- Multilingual: lives **only** in `Publisher.captionByLocale` and
  `Composer` drawtext locale variants. Schema stays English (see schema.sql).
- Conflict with CLAUDE.md §1 (community language, 5-langs UI): **not resolved
  here** — this doc is memory-aligned. Registered in `reuse-report.md §8`.

**Layer map** (data flows top→bottom):

```
Source     → discover raw asset URLs (Wikimedia, MLS feed, agent upload)
Fetcher    → download + hash + persist to storage, emit content_items rows
Tagger     → classify each item (L1 subject, L2 vibe), write tags rows
Ranker     → pick + order clips for a target reel_structure
Composer   → build ffmpeg plan + render mp4, write compositions row
Publisher  → upload to platform (rednote / wechat / ig-reels / percho.com),
             write publishes row
```

Each layer is a **pure-ish async function** returning a typed result. Side
effects (storage write, DB write) are explicit params (`storage`, `db`).
No hidden globals. This is what makes the shim→engine refactor in
`architecture-v2.md §6` viable.

---

## 0. Shared types

```ts
// GA-only guard at the type level. Extend with more counties as we
// verify coverage.
export type GAState = 'GA';
export type NeighborhoodSlug = string; // e.g. 'peachtree-corners', 'decatur'

export interface Neighborhood {
  slug: NeighborhoodSlug;
  displayName: string;
  state: GAState;               // hard-locked
  county: string;               // 'Gwinnett', 'DeKalb', ...
  centroid: { lat: number; lng: number };
  bbox?: [number, number, number, number]; // [w,s,e,n], for MLS geo filter
}

// L1 = subject (what is in frame), L2 = vibe (how it feels).
// Values MUST match tag_rules.py enums; keep in sync via codegen (D3).
export type L1Tag =
  | 'streetscape' | 'aerial' | 'skyline' | 'landmark_wide'
  | 'park' | 'nature' | 'water'
  | 'listing-exterior' | 'listing-interior'
  | 'restaurant' | 'event' | 'signage' | 'motion';

export type L2Tag =
  | 'quiet-suburban' | 'walkable' | 'nightlife'
  | 'family' | 'luxury' | 'historic' | 'newbuild';

export interface Tag {
  layer: 1 | 2;
  value: L1Tag | L2Tag;
  confidence: number; // 0..1, from tag_rules.py rule score
  source: 'rule' | 'llm' | 'human';
}

export interface StorageRef {
  bucket: string;          // 'raw' | 'renders' | 'thumbs'
  key: string;             // 'peachtree-corners/hero-01.jpg'
  sha256: string;          // idempotency key
  bytes: number;
  mime: string;            // 'image/jpeg' | 'video/mp4'
  width?: number;
  height?: number;
  durationSec?: number;    // required iff mime starts with 'video/'
}

export interface ContentItem {
  id: string;                          // uuid v7
  neighborhoodSlug: NeighborhoodSlug;
  kind: 'image' | 'video';
  storage: StorageRef;
  license: 'cc0' | 'cc-by' | 'cc-by-sa' | 'public-domain' | 'mls' | 'agent-upload';
  attribution?: string;                // "Photo: Wikimedia / User:Foo"
  sourceUrl: string;                   // canonical origin
  sourceKind: SourceKind;
  capturedAt?: string;                 // ISO8601, if EXIF/known
  tags: Tag[];                         // hydrated by Tagger
  createdAt: string;
}

export type SourceKind =
  | 'wikimedia'
  | 'mls-fmls' | 'mls-gamls'
  | 'agent-upload'
  | 'stock-unsplash';                  // mock only, flagged in `attribution`
```

---

## 1. Source

Discover candidate assets. **No downloads here** — only URLs + minimal metadata.
This lets Ranker do a cheap "is it even worth fetching?" filter (e.g. skip
duplicates already in DB by sourceUrl hash).

```ts
export interface SourceQuery {
  neighborhood: Neighborhood;
  intent: 'neighborhood-explainer' | 'listing-reel';
  limit: number;                       // per-source cap
  since?: string;                      // ISO8601 incremental cursor
}

export interface SourceCandidate {
  sourceKind: SourceKind;
  sourceUrl: string;
  previewUrl?: string;                 // thumbnail if source provides one
  license: ContentItem['license'];
  attribution?: string;
  hints: {
    kind: 'image' | 'video';
    width?: number; height?: number;
    durationSec?: number;
    title?: string;                    // used by Tagger as text signal
    description?: string;
  };
}

export interface Source {
  kind: SourceKind;
  discover(q: SourceQuery): Promise<SourceCandidate[]>;
}
```

Contract:
- MUST return **only** GA-locality candidates. Enforce via query params
  (Wikimedia `haswbstatement:P131=<GA-place>`) or post-filter.
- MUST be idempotent: same query → same set (order not guaranteed).
- MUST NOT write DB / storage.

Concrete impls (D3): `WikimediaSource`, `FmlsSource`, `GamlsSource`,
`AgentUploadSource` (event-driven, `discover` returns items enqueued since
cursor).

---

## 2. Fetcher

Materializes a `SourceCandidate` into a `ContentItem`. Handles retries,
sha256, storage upload, DB insert. **Idempotent on `sha256`** — re-running
a fetch never dupes rows (matches schema `content_items.sha256 UNIQUE`).

```ts
export interface FetcherDeps {
  storage: {
    put(bucket: string, key: string, body: Uint8Array, mime: string): Promise<void>;
    exists(bucket: string, key: string): Promise<boolean>;
  };
  db: {
    upsertContentItem(row: Omit<ContentItem, 'tags'>): Promise<ContentItem>;
  };
  fetchBytes(url: string): Promise<{ body: Uint8Array; mime: string }>;
}

export interface FetcherResult {
  item: ContentItem;
  wasDuplicate: boolean;               // true if sha256 already in DB
}

export interface Fetcher {
  fetch(candidate: SourceCandidate, n: Neighborhood, deps: FetcherDeps): Promise<FetcherResult>;
}
```

Contract:
- If `sha256` already exists in `content_items`, return existing row with
  `wasDuplicate=true`. **Do not re-upload to storage.**
- Reject files >2GB or video >5min (matches CLAUDE.md §7 CF Stream cap).
- MUST NOT tag. Tags come from layer 3.

---

## 3. Tagger

Attach L1/L2 tags to a `ContentItem`. Pluggable strategies; rules first,
LLM only for L2 vibe on ambiguous items.

```ts
export interface TaggerDeps {
  db: {
    replaceTags(contentItemId: string, tags: Tag[]): Promise<void>;
  };
}

export interface TaggerInput {
  item: ContentItem;
  signals: {
    title?: string;
    description?: string;
    filenameHints?: string;            // from source URL
  };
}

export interface Tagger {
  name: 'rule' | 'llm';
  tag(input: TaggerInput, deps: TaggerDeps): Promise<Tag[]>;
}
```

Contract:
- Rule tagger MUST be deterministic (pure function of `signals`). No network.
- LLM tagger MUST cap tokens (see CLAUDE.md §7) and MUST use
  `claude-sonnet-4-5`. Returns L2 vibe only, never L1 subject.
- `replaceTags` is destructive per `contentItemId` — Tagger owns the full
  tag set for its layer scope. Combine rule + llm outputs before writing.

---

## 4. Ranker

Given a `reel_structure` (slot sequence) and a pool of tagged items, pick
+ order the winners. This is where `hook > aerial > skyline > motion >
landmark_wide > signage` priority from `video-composition.md §复盘` lives.

```ts
export interface Slot {
  id: string;                          // 'hook' | 'vibe1' | 'schools' | 'cta'
  prefers: (L1Tag | L2Tag)[];          // in priority order
  fallback?: (L1Tag | L2Tag)[];
  kind: 'image' | 'video' | 'either';
  minDurationSec?: number;             // for kind='video'
  captionByLocale?: Record<string, string>; // 'en' | 'es' | 'zh-CN' | ...
}

export interface ReelStructure {
  intent: 'neighborhood-explainer' | 'listing-reel';
  targetDurationSec: number;           // 60 for v1
  slots: Slot[];                       // ordered
}

export interface RankerInput {
  neighborhood: Neighborhood;
  pool: ContentItem[];                 // tagged items, filtered to slug
  structure: ReelStructure;
}

export interface RankedSlot {
  slot: Slot;
  item: ContentItem;
  reason: string;                      // "matched prefers[0]=aerial, conf=0.91"
}

export interface Ranker {
  rank(input: RankerInput): Promise<{
    slots: RankedSlot[];
    unmatched: Slot[];                 // slots we couldn't fill
  }>;
}
```

Contract:
- Each `ContentItem` used **at most once** per composition (no repeat frames).
  Enforces the "主体重复度" fix from `video-composition.md §复盘`.
- If a slot's `prefers` all miss, walk `fallback`. If still empty, add to
  `unmatched` — do NOT invent a fill. Composer decides whether to render
  with holes or bail.
- MUST be deterministic given identical `pool` + `structure`
  (tie-break by `content_items.id` ASC).

---

## 5. Composer

Turn a ranked slot list into an mp4 + write `compositions` row. This is the
layer we already have (compose.py); the `plan` jsonb column in schema.sql
is exactly `CompositionPlan` below.

```ts
export interface CompositionPlan {
  version: '1';                        // bump on schema-breaking change
  targetDurationSec: number;
  outputSize: { w: 1080; h: 1920 };    // 9:16 only in v1
  clips: Array<{
    slotId: string;
    contentItemId: string;
    inPointSec: number;                // 0 for images
    outPointSec: number;               // = duration for images (Ken Burns)
    captionByLocale?: Record<string, string>;
    kenBurns?: { fromScale: number; toScale: number };
  }>;
  audio?: {
    trackId?: string;                  // future: royalty-free lib
    volumeDb?: number;
  };
  ffmpegCmd: string;                   // fully materialized command for reproducibility
}

export interface ComposerDeps {
  storage: FetcherDeps['storage'] & { presign(bucket: string, key: string): Promise<string> };
  db: {
    insertComposition(row: {
      neighborhoodSlug: NeighborhoodSlug;
      intent: ReelStructure['intent'];
      plan: CompositionPlan;
      clipIds: string[];               // for reverse lookup (schema GIN idx)
      output: StorageRef;
    }): Promise<{ id: string }>;
  };
  render(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface Composer {
  compose(
    ranked: { slots: RankedSlot[]; structure: ReelStructure },
    n: Neighborhood,
    deps: ComposerDeps
  ): Promise<{ compositionId: string; output: StorageRef; plan: CompositionPlan }>;
}
```

Contract:
- `plan` MUST be sufficient to re-render byte-identical mp4 (given same
  `content_items` blobs). This is the D1 promise — no hidden state.
- On `unmatched.length > 0`, Composer either (a) skips the slot with a
  neutral fill (defined in structure), or (b) throws. Caller decides via
  `structure` config; default = throw.
- Hard cap 60s (v1). CTA overlay slot required for `neighborhood-explainer`
  intent.

---

## 6. Publisher

Push the rendered mp4 to a platform, record `publishes` row. **One publisher
per platform**, all share the interface.

```ts
export type PublishPlatform =
  | 'percho-web'         // percho.com/<slug> landing embed
  | 'ig-reels'
  | 'tiktok'
  | 'rednote'            // 小红书 — multilingual buyer reach (marketing layer only)
  | 'wechat-moments';    // same

export interface PublishRequest {
  compositionId: string;
  output: StorageRef;
  platform: PublishPlatform;
  captionByLocale: Record<string, string>;   // MUST include 'en'; others optional
  scheduledAt?: string;                      // ISO8601, null = now
}

export interface PublisherDeps {
  db: {
    insertPublish(row: {
      compositionId: string;
      platform: PublishPlatform;
      status: 'pending' | 'live' | 'failed' | 'retracted';
      externalId?: string;
      externalUrl?: string;
      error?: string;
    }): Promise<{ id: string }>;
  };
  platformClient: unknown;                   // per-platform SDK, typed in impl
}

export interface Publisher {
  platform: PublishPlatform;
  publish(req: PublishRequest, deps: PublisherDeps): Promise<{
    publishId: string;
    externalId?: string;
    externalUrl?: string;
  }>;
}
```

Contract:
- Idempotent on `(compositionId, platform)` — matches schema
  `publishes UNIQUE (composition_id, platform, status) DEFERRABLE`.
  Re-publishing after `retracted` inserts a new row, not updates.
- Caption locale set MUST be subset of what Composer's `plan.clips[i].
  captionByLocale` supports (Publisher does not re-caption video, only
  post copy).
- `percho-web` publisher is a **no-op push** (just flips `status=live`
  and records the canonical `percho.com/<slug>` URL) since the video is
  already in our storage.

---

## 7. Layer boundaries (what NOT to do)

| Layer      | Never does                                     |
|------------|------------------------------------------------|
| Source     | Downloads bytes, writes DB, filters by tags    |
| Fetcher    | Assigns tags, picks slots                      |
| Tagger     | Fetches new content, mutates storage           |
| Ranker     | Renders, writes tags, calls LLM                |
| Composer   | Fetches new content, tags, chooses platforms   |
| Publisher  | Re-renders, retags, re-ranks                   |

If a layer reaches for a capability outside its column, that's a smell —
add a new orchestrator step, don't widen the interface.

---

## 8. End-to-end call shape (pseudo)

```ts
// Orchestrator (D3 decides where this runs)
async function makeReel(slug: NeighborhoodSlug, intent: 'neighborhood-explainer') {
  const n = await db.neighborhoods.get(slug);
  const cands = (await Promise.all(sources.map(s => s.discover({ neighborhood: n, intent, limit: 30 })))).flat();
  const items = await Promise.all(cands.map(c => fetcher.fetch(c, n, fetcherDeps)));
  const tagged = await Promise.all(items.map(({item}) => tagger.tag({ item, signals: signalsFrom(item) }, taggerDeps).then(tags => ({ ...item, tags }))));
  const ranked = await ranker.rank({ neighborhood: n, pool: tagged, structure: STRUCTURES[intent] });
  const { compositionId, output } = await composer.compose(ranked, n, composerDeps);
  return publisher.publish({ compositionId, output, platform: 'percho-web', captionByLocale: { en: `Discover ${n.displayName}` } }, publisherDeps);
}
```

Every arrow is typed. Every side effect is in a `deps` bag. That's the
whole point of D2.

---

## 9. Open questions (deferred to D3/D4)

1. Where does the orchestrator live? (CF Worker cron vs EC2 systemd —
   see D3). Composer is CPU-bound → EC2. Others could go anywhere.
2. Is `render()` sync (block Worker) or async job (queue + poll)? Composer
   plan already supports async — `insertComposition` before render kick,
   status column on `compositions`. **Recommend async** for D3.
3. Rate-limit envelope per `Source` (Wikimedia OK, MLS unclear). D4 cost
   model will surface the ceiling.

---

**Cross-refs**:
- Schema: `docs/pipelines/schema.sql` (D1)
- Refactor plan: `docs/pipelines/architecture-v2.md`
- Ranker priorities: `docs/pipelines/video-composition.md §复盘`
- Reuse ledger: `docs/pipelines/reuse-report.md`
