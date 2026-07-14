#!/usr/bin/env python3
"""C3 runner: reuse fetch_wikimedia.py + tag_rules.py against Decatur config.

Strategy: do NOT modify the two POC scripts. Load them via exec() with a
patched module namespace where BASE/OUT/QUERIES/TARGET are swapped from the
Decatur YAML. This is the "config-only" reuse pattern architecture-v2.md
recommended as the target end-state — here we approximate it with an exec()
shim so C3 can produce tags.json without a real refactor.
"""
import json, sys, re
from pathlib import Path

ROOT = Path("/home/ubuntu/Percho/docs/pipelines")
YAML_PATH = ROOT / "neighborhoods" / "decatur.yaml"

# --- minimal YAML parser (no PyYAML dep) — only fields we need -----------
def load_decatur_config(p: Path) -> dict:
    text = p.read_text().splitlines()
    cfg = {"wikimedia_queries": [], "target_asset_count": 22, "output_dir": None, "slug": "decatur"}
    section = None
    for raw in text:
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if line.startswith("wikimedia_queries:"):
            section = "wq"; continue
        def _val(s):
            v = s.split(":",1)[1]
            v = v.split("#",1)[0].strip().strip('"').strip("'")
            return v
        if line.startswith("target_asset_count:"):
            cfg["target_asset_count"] = int(_val(line)); section=None; continue
        if line.startswith("output_dir:"):
            cfg["output_dir"] = _val(line); section=None; continue
        if line.startswith("slug:"):
            cfg["slug"] = _val(line); section=None; continue
        if section == "wq" and line.lstrip().startswith("- "):
            v = line.lstrip()[2:].strip().strip('"').strip("'")
            cfg["wikimedia_queries"].append(v)
        elif not line.startswith(" ") and not line.startswith("-"):
            section = None
    return cfg

cfg = load_decatur_config(YAML_PATH)
OUT_DIR = Path(cfg["output_dir"])
OUT_DIR.mkdir(parents=True, exist_ok=True)
DECATUR_ROOT = OUT_DIR.parent  # poc-output/decatur

print(f"[c3] config: {len(cfg['wikimedia_queries'])} queries, target={cfg['target_asset_count']}, out={OUT_DIR}")

# --- reuse fetch_wikimedia.py via exec() with patched globals ------------
fetch_src = (ROOT / "poc-output" / "fetch_wikimedia.py").read_text()
fetch_globals = {"__name__": "__fetch_shim__"}
# monkey-patch by editing constants before exec (surgical, in-memory only)
patched = fetch_src
patched = re.sub(r'OUT = Path\("[^"]+"\)', lambda m: f'OUT = Path("{OUT_DIR}")', patched, count=1)
patched = re.sub(r'QUERIES = \[[^\]]+\]', lambda m: "QUERIES = " + json.dumps(cfg["wikimedia_queries"]), patched, count=1, flags=re.S)
patched = re.sub(r'TARGET = \d+', lambda m: f'TARGET = {cfg["target_asset_count"]}', patched, count=1)
print("[c3] exec fetch_wikimedia (patched in-memory, source file untouched)…")
exec(compile(patched, "fetch_wikimedia.py<decatur>", "exec"), fetch_globals)

manifest_path = OUT_DIR / "manifest.json"
if not manifest_path.exists():
    print("[c3] ! manifest missing after fetch", file=sys.stderr); sys.exit(1)
manifest = json.loads(manifest_path.read_text())
print(f"[c3] fetched {len(manifest)} assets")

# --- reuse tag_rules.py via exec() with patched BASE ---------------------
tag_src = (ROOT / "poc-output" / "tag_rules.py").read_text()
patched_t = tag_src
# BASE points to decatur/ so BASE/assets/manifest.json resolves correctly
patched_t = re.sub(r'BASE = Path\("[^"]+"\)', lambda m: f'BASE = Path("{DECATUR_ROOT}")', patched_t, count=1)
patched_t = re.sub(r'"neighborhood_slug": "peachtree-corners"', lambda m: f'"neighborhood_slug": "{cfg["slug"]}"', patched_t, count=1)
print("[c3] exec tag_rules (patched in-memory)…")
exec(compile(patched_t, "tag_rules.py<decatur>", "exec"), {"__name__": "__tag_shim__"})

tags_path = DECATUR_ROOT / "tags.json"
tags = json.loads(tags_path.read_text())
from collections import Counter
print(f"[c3] tags.json: {len(tags)} items  L1={dict(Counter(t['L1'] for t in tags))}")
print(f"[c3] wrote {tags_path}")
