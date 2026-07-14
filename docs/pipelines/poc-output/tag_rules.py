#!/usr/bin/env python3
"""Rule-based tagger for POC: filename + caption keyword → L1/L2."""
import json
from pathlib import Path

BASE = Path("/home/ubuntu/Percho/docs/pipelines/poc-output")
manifest = json.loads((BASE / "assets" / "manifest.json").read_text())

# priority-ordered rules (first match wins for L1)
L1_RULES = [
    ("park",         ["park", "trail", "river", "chattahoochee", "greenway"]),
    ("school",       ["school", "elementary", "high school", "academy", "university", "college"]),
    ("restaurant",   ["restaurant", "cafe", "brew", "forum", "town center", "shopping", "mall"]),
    ("event",        ["festival", "parade", "event", "market"]),
    ("streetscape",  ["street", "sign", "road", "downtown", "parkway", "route", "overpass", "highway", "gateway", "city hall", "library", "logo", "seal"]),
    ("people-vibe",  ["people", "crowd", "pedestrian"]),
    ("listing-exterior", ["house", "home", "residence"]),
]

L2_RULES = [
    ("nature",         ["park", "river", "trail", "chattahoochee", "greenway"]),
    ("walkable",       ["downtown", "town center", "forum", "street", "sign", "gateway", "city hall", "library"]),
    ("family",         ["school", "festival", "park"]),
    ("nightlife",      ["night", "bar", "brewery"]),
    ("quiet-suburban", ["route", "parkway", "overpass", "highway", "residence"]),
]

def match(text, rules, default):
    tl = text.lower()
    for tag, kws in rules:
        if any(kw in tl for kw in kws):
            return tag
    return default

out = []
for item in manifest:
    text = f"{item['filename']} {item.get('caption','')} {item.get('query','')}"
    l1 = match(text, L1_RULES, "streetscape")
    l2 = match(text, L2_RULES, "quiet-suburban")
    item["tentative_tag"] = l1
    out.append({
        "filename": item["filename"],
        "L1": l1,
        "L2": l2,
        "L3": {"neighborhood_slug": "peachtree-corners"},
        "confidence": 0.6,  # rule-based, low confidence
    })

(BASE / "tags.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
# also rewrite manifest with tentative_tag filled
(BASE / "assets" / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

from collections import Counter
print("L1:", Counter(t["L1"] for t in out))
print("L2:", Counter(t["L2"] for t in out))
print(f"Wrote {BASE}/tags.json ({len(out)} items)")
