# Pipeline Reuse Report — Peachtree Corners → Decatur (C1–C4)

**Question**: how much of the Peachtree Corners POC pipeline was reused
verbatim vs. rewritten when producing the second neighborhood (Decatur)?

**TL;DR**: **0 lines** modified in the 3 core POC scripts
(`fetch_wikimedia.py`, `tag_rules.py`, `compose.py`) — 279 LOC total, all
untouched. Reuse was achieved via a thin **exec-shim** pattern:
`re.sub` the 3 hardcoded string literals in each script, then `exec()` in a
patched namespace. Cost: **1 YAML config + 2 shims = 174 LOC of new "glue"**
to reuse **279 LOC of pipeline logic**. Not sustainable past N=2.

---

## 1. Line-count ledger

| Artifact | Path | Kind | LOC (total / non-blank) | Delta vs. PTC |
|---|---|---|---|---|
| `fetch_wikimedia.py` | poc-output/ | core POC code | 103 / — | **0 lines changed** |
| `tag_rules.py` | poc-output/ | core POC code | 56 / — | **0 lines changed** |
| `compose.py` | poc-output/ | core POC code | 120 / — | **0 lines changed** |
| `neighborhoods/decatur.yaml` | pipelines/neighborhoods/ | **new config** | 50 / 39 | +50 new |
| `run_decatur_c3.py` | poc-output/ | **new shim** (fetch+tag) | 81 / 66 | +81 new |
| `run_decatur_c4.py` | poc-output/ | **new shim** (compose) | 43 / 30 | +43 new |
| `architecture-v2.md` | pipelines/ | doc (C2) | — | doc-only, no code |
| `decatur-c1-attempt.md` | pipelines/neighborhoods/ | doc (C1 postmortem) | — | doc-only, no code |

**Totals**
- Core pipeline code changed: **0 / 279 lines (0.0%)** ✅
- New glue (config + shims): **174 LOC (50 yaml + 124 python)**
- Ratio "glue : reused-logic": **174 : 279 ≈ 0.62 : 1**

---

## 2. What each shim actually does

Both shims follow the same recipe — no monkeypatching, no subclassing,
just literal substitution:

### `run_decatur_c3.py` (fetch + tag, 81 LOC)
- Minimal in-file YAML parser (~25 LOC, no PyYAML dep) — 3 sections needed.
- Reads `fetch_wikimedia.py` as text, `re.sub`s **3 literals**:
  - `OUT = Path("…/assets")` → `…/decatur/assets`
  - `QUERIES = [...]` → Decatur's 7 wikimedia search queries
  - `TARGET = 15` → `22` (Decatur config target)
- Reads `tag_rules.py` as text, `re.sub`s **1 literal**:
  - `BASE = Path("…/assets")` → `…/decatur/assets`
- `exec()`s both in `{"__name__": "__main__"}` namespaces.

### `run_decatur_c4.py` (compose, 43 LOC)
- Reads `compose.py` as text, `re.sub`s **3 literals**:
  - `BASE` dir → decatur subdir
  - `out_path` filename → `../decatur-v1.mp4`
  - `PLAN = [...]` → 7 Decatur-adapted slots (see §4)
- `exec()`s once.

**No changes** to logic: ffmpeg cmd builder, drawtext escaping, concat
filter, tag L1/L2 rules — all identical bytes.

---

## 3. Config surface actually used

`neighborhoods/decatur.yaml` fields consumed by C3/C4 shims:

| YAML field | Consumed by | Notes |
|---|---|---|
| `wikimedia_queries[]` (7) | c3 shim → fetch_wikimedia | search terms |
| `target_asset_count` (22) | c3 shim → fetch_wikimedia | fetched 22/22 |
| `output_dir` | c3 + c4 shims | isolates from PTC assets |
| `slug` (decatur) | c3 + c4 shims | filename suffix only |
| `tag_hints` | **NOT CONSUMED** | tag_rules regex is neighborhood-agnostic; hints are aspirational |
| `reel_structure` | **NOT CONSUMED** | c4 hardcodes its own PLAN (see §4) |

**Config utilization: ~4/7 fields (57%)**. The `reel_structure` block in
YAML was a pretty gesture — c4 still ships its own inline `PLAN`.

---

## 4. Where reuse broke down

Two Decatur-specific realities forced the c4 shim to override, not reuse:

1. **Tag distribution mismatch**. PTC's PLAN referenced `park` and
   `school` L1 tags. Decatur tags.json:
   `streetscape=14, listing-exterior=5, event=2, restaurant=1, park=0, school=0`.
   → c4 rewrites PLAN slots to only reference tags that exist. This can't
   be pushed into config until `PLAN` becomes a template that resolves
   against available tags at compose-time (see `architecture-v2.md` §5).

2. **Copy is per-neighborhood**. `PLAN`'s 7 caption strings ("Decatur, GA",
   "MARTA-connected · Atlanta in 20 min", "City Schools of Decatur · top-rated",
   "See Decatur homes → percho.com/decatur") are 100% neighborhood-specific.
   The compose.py PLAN literal is fundamentally not shareable across
   neighborhoods without a template + variable substitution layer.

Consequence: **the shim's PLAN block is 12 LOC of Decatur-only copy**
masquerading as reuse. It's really a fork of PTC's PLAN, not a
parameterization of it.

---

## 5. Reuse quality — honest score

| Layer | Bytes reused verbatim | Reuse quality |
|---|---|---|
| Fetch (wikimedia) | 100% (103 LOC untouched) | ✅ Genuine — only queries + paths vary |
| Tag (regex L1/L2) | 100% (56 LOC untouched) | ⚠️ Structural only — Decatur's tag distribution is very different (streetscape-heavy, zero park/school), so the *rules* fit but the *taxonomy* is PTC-biased. See `architecture-v2.md` §1. |
| Compose (ffmpeg) | ~90% (108 / 120 LOC untouched; only PLAN block swapped) | ⚠️ Nominal — the swapped block *is* the creative content of the reel. Everything neighborhood-specific is in PLAN. |

**Effective reuse across the pipeline: ~85% of logic bytes, but ~40% of
the creative/config surface**. The exec-shim pattern makes the number
look better than it feels.

---

## 6. Break-even projection

If we hold this pattern for N neighborhoods, each new neighborhood costs
~120 LOC of new shim+config glue (yaml + 2 shims minus the boilerplate
that would move to a shared helper).

| N (neighborhoods) | Glue LOC | Refactor LOC (from architecture-v2.md §5) | Winner |
|---|---|---|---|
| 2 (PTC + Decatur) | ~174 | ~155 (one-time) + 0/nbhd | Shim wins by margin, but **at N=3+ refactor wins outright** |
| 3 | ~294 | ~155 + ~50 yaml/nbhd = ~205 | **Refactor** |
| 5 | ~534 | ~155 + ~250 = ~405 | **Refactor by a lot** |
| 10 | ~1134 | ~155 + ~500 = ~655 | Not a contest |

**Recommendation**: **don't ship a 3rd shim.** Before adding Buckhead or
Alpharetta, execute `architecture-v2.md` §6 (parameterize `--neighborhood`
CLI arg + move PLAN to template). Shim was the right tool at N=2 to
prove the config surface; it's the wrong tool at N=3.

---

## 7. What this report does NOT claim

- Not claiming the Decatur reel is as good as PTC's — it isn't. `park=0`
  and `school=0` hurt the "schools" and "homes" slots visually. That's a
  content-sourcing gap (C6 will document reel diffs).
- Not claiming the shims are production code — they're prototypes that
  *demonstrate* config-only reuse is achievable. Real reuse needs
  architecture-v2.md §5 executed.
- Not claiming tag_rules.py "generalized cleanly" — it happened to work
  because Decatur's assets are urban/streetscape-heavy, and the L1
  regex catches "downtown|square|street|storefront" already. A
  suburban/rural neighborhood (e.g. Milton) would probably need new L1
  patterns → tag_rules would need a real config extension.

---

## 8. Memory alignment

- ✅ GA-only: all 7 wikimedia queries scoped to "Decatur, Georgia" — no
  Decatur, IL/AL false positives observed in the 22 assets.
- ✅ Selling-only: PLAN copy is agent/listing-facing ("See Decatur homes →
  percho.com/decatur"). No rental / community language.
- ✅ No bilingual copy in reel drawtext — matches memory (Chinese only
  belongs in marketing-caption layer, not on-video overlay).
