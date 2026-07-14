# Pipeline Architecture v2 — from POC hardcode to multi-neighborhood config

**Tick**: Phase C, C2 (2026-07-11)
**Trigger**: C1 attempted "only add `neighborhoods/decatur.yaml`, do not touch `.py`" — target failed.
**Verdict**: The POC scripts (`fetch_wikimedia.py`, `tag_rules.py`, `compose.py`) consume **zero** external configuration. Any second neighborhood requires code changes. This document records why, and specifies v2.

> **Scope**: pipeline scripts under `docs/pipelines/poc-output/*.py` only. No `app/` changes. Neighborhood-selling positioning (GA-only, selling-only per memory) is preserved.

---

## 1. Why "only add config" failed

### 1.1 `fetch_wikimedia.py` — 3 hardcoded constants

```python
OUT     = Path('/home/ubuntu/Percho/docs/pipelines/poc-output/assets')   # L13
QUERIES = ['Peachtree Corners Georgia', 'Gwinnett County Georgia',
           'Norcross Georgia', 'Chattahoochee River Georgia',
           'Jones Bridge Park']                                           # L20-26
TARGET  = 22                                                              # L28
```
No `argparse`, no `os.environ`, no `open()` of any config file. Adding
`decatur.yaml` cannot influence this script without editing it.

### 1.2 `tag_rules.py` — hardcoded manifest path + rule table

```python
BASE = Path("/home/ubuntu/Percho/docs/pipelines/poc-output")                # L6
manifest = json.loads((BASE / "assets" / "manifest.json").read_text())       # L7
L1_RULES = [ ... 7 tuples ...]                                               # L11-19
L2_RULES = [ ... 5 tuples ...]                                               # L21-27
```
Rule tables are Peachtree-Corners–biased (e.g. `"chattahoochee"`, `"forum"`,
`"town center"`). Decatur needs its own hints (`"agnes scott"`, `"oakhurst"`,
`"emory"`, `"marta"`). `decatur.yaml` already ships a `tag_hints:` block,
but nothing reads it.

### 1.3 `compose.py` — hardcoded slot plan + captions

```python
BASE = Path("/home/ubuntu/Percho/docs/pipelines/poc-output")                 # L7
PLAN = [
    ("hook",  ["streetscape"],               1, 3.0, "Peachtree Corners"),
    ...
    ("cta",   ["streetscape"],               1, 5.0, "See homes → percho.com/ptc"),
]                                                                             # L19-27
```
Captions and CTA URL are neighborhood-specific string literals inside code.

**Conclusion**: v1 was a single-shot POC. Reuse for a second neighborhood
(Decatur, and everything after) requires a small but real refactor.

---

## 2. Refactor goals (v2)

1. **Same repo, same 3 scripts** — do not fragment into a framework.
2. **Config = single source of truth per neighborhood** (`neighborhoods/<slug>.yaml`).
3. **Isolation** — outputs land in `poc-output/<slug>/…`; no cross-contamination.
4. **Idempotent + resumable** — re-running a stage never re-downloads what it has.
5. **Zero new dependencies** — stay on `/usr/bin/python3` + `requests` + `PIL`.
   `yaml.safe_load` needs `PyYAML`; if not available, fall back to a tiny
   inline JSON sidecar (`decatur.json`) generated from the yaml.
6. **Backwards compatible** — Peachtree Corners v1 must still be reproducible
   from `neighborhoods/peachtree-corners.yaml` (to be added in C3).

Non-goals: DB, queues, cloud rendering, auth. Those are Phase D.

---

## 3. Proposed layout

```
docs/pipelines/
├── neighborhoods/
│   ├── peachtree-corners.yaml     # to add (extract v1 hardcode)
│   └── decatur.yaml               # already exists
├── poc-output/
│   ├── fetch_wikimedia.py         # refactored, --neighborhood <slug>
│   ├── tag_rules.py               # refactored, --neighborhood <slug>
│   ├── compose.py                 # refactored, --neighborhood <slug>
│   ├── _config.py                 # NEW: 30-line yaml/json loader + slug→paths
│   ├── peachtree-corners/         # per-neighborhood output dir
│   │   ├── assets/*.jpg
│   │   ├── assets/manifest.json
│   │   ├── tags.json
│   │   ├── composition_plan.json
│   │   └── reel-v1.mp4
│   └── decatur/
│       └── (same shape)
└── architecture-v2.md             # this file
```

Legacy `poc-output/assets/` and `poc-output/tags.json` remain in place
(pinned as `peachtree-corners-v1` provenance). v2 writes only under
`poc-output/<slug>/`.

---

## 4. Neighborhood YAML schema (v2)

```yaml
slug: decatur                       # required, kebab-case, matches dir name
display_name: Decatur
state: GA
county: DeKalb

fetch:
  target_asset_count: 22
  min_width_px: 800
  wikimedia_queries:
    - "Decatur Georgia"
    - "Agnes Scott College"
    - "Oakhurst Decatur"
    - "Emory University"
    - "DeKalb County courthouse"
    - "MARTA Decatur station"
    - "Decatur square Georgia"

tags:
  # neighborhood-specific hint keywords appended to the base rule tables.
  # base tables live in code; hints are additive, never subtractive.
  l1_hints:
    school:       ["agnes scott", "emory", "oakhurst elementary"]
    streetscape:  ["square", "courthouse", "marta"]
    park:         ["glenlake", "mckoy"]
    restaurant:   ["oakhurst", "kimball house"]
  l2_hints:
    walkable:     ["square", "oakhurst", "marta"]
    family:       ["agnes scott", "oakhurst elementary"]

compose:
  cta_url: "percho.com/decatur"
  slot_plan:
    - {label: hook,   l1_pref: [streetscape],              count: 1, seconds: 3.0, caption: "Decatur, GA"}
    - {label: vibe,   l1_pref: [streetscape, restaurant],  count: 3, seconds: 4.0, caption: "Walk everywhere. Live everywhere."}
    - {label: square, l1_pref: [streetscape],              count: 3, seconds: 5.0, caption: "The Square · dinner-to-bookstore in 4 blocks"}
    - {label: campus, l1_pref: [school],                   count: 2, seconds: 5.0, caption: "Agnes Scott · Emory · walkable schools"}
    - {label: park,   l1_pref: [park],                     count: 2, seconds: 4.0, caption: "Glenlake · McKoy · neighborhood parks"}
    - {label: cta,    l1_pref: [streetscape],              count: 1, seconds: 5.0, caption: "See homes → percho.com/decatur"}
```

`peachtree-corners.yaml` will mirror this shape with v1 constants extracted.

---

## 5. Code delta budget (minimum viable v2)

Estimated diff to unblock Decatur end-to-end:

| File | Change | ~LOC |
|---|---|---|
| `_config.py` (new) | load yaml (or json fallback), resolve `slug → {assets_dir, manifest_path, tags_path, plan_path, reel_path}` | 40 |
| `fetch_wikimedia.py` | `argparse --neighborhood`; replace `OUT/QUERIES/TARGET/min_width` with config; add `neighborhood_slug` to each manifest row | +25 / -10 |
| `tag_rules.py` | `argparse --neighborhood`; read manifest from config path; merge `l1_hints/l2_hints` into base rule tables at runtime; write `tags.json` under slug dir | +20 / -5 |
| `compose.py` | `argparse --neighborhood`; read `tags.json` + `slot_plan` from config; parameterize captions & CTA; write `reel-v1.mp4` under slug dir | +30 / -15 |
| `neighborhoods/peachtree-corners.yaml` (new) | extract v1 hardcode | 40 |

**Total: ~155 new / ~30 removed LOC, no new deps if PyYAML present** (it is on
Ubuntu default python3-yaml; if not, the loader falls back to a paired
`.json` sidecar and a note in DEVLOG).

---

## 6. Migration order (proposed for C3+)

1. Land `_config.py` + `peachtree-corners.yaml`. Refactor 3 scripts to consume
   config. Re-run for Peachtree Corners → byte-diff `reel-v1.mp4` against
   pinned v1 output (accept ≤ 5% variation due to ffmpeg nondeterminism).
2. Run pipeline against `decatur.yaml` → produce `poc-output/decatur/reel-v1.mp4`
   (this is C4 in the plan).
3. Write `reuse-report.md` (C5): count LOC-changed vs LOC-config-added, prove
   config-to-code ratio > 1:1 going forward.

If step 1's byte-diff exceeds tolerance, halt and re-review before Decatur run.

---

## 7. What v2 does NOT solve (deferred to Phase D)

- Multi-source ingestion (only Wikimedia today; MLS photos / agent upload =
  Phase E).
- LLM-based tagging (rules-only for POC; keeps cost = $0).
- Concurrent neighborhood renders (single-process today; render-worker
  systemd + queue = D3).
- Publish targets (no Instagram/TikTok/Rednote API wiring yet; F-phase pivot
  per memory: selling-only listing agents, GA MLS-first — Rednote optional
  distribution not core).

---

## 8. Memory-alignment note

Per user memory (2026 pivot), Percho is **GA-only, selling-only, MLS-first**.
The Decatur config is consistent (GA, DeKalb County). All future
`neighborhoods/*.yaml` MUST have `state: GA` — the loader in `_config.py`
should assert this and refuse non-GA configs, until the pivot is revised.

Any bilingual/rednote captions in `compose.slot_plan` are allowed only as
**agent-opt-in marketing copy** (CLAUDE.md §1), never as schema or dashboard
strings. `slot_plan.caption` is marketing copy → allowed. `slug` /
`display_name` / `l1_hints` keys → English only.
