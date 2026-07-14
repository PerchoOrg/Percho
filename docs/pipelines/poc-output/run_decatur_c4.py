#!/usr/bin/env python3
"""C4 shim: reuse compose.py verbatim on Decatur assets.

Same pattern as run_decatur_c3.py — do NOT edit compose.py.
Read source, re.sub the 3 hardcoded literals (BASE dir, PLAN slots, out
filename), then exec in an isolated namespace. Everything else (ffmpeg cmd
builder, drawtext escaping, concat filter) is unchanged.

Decatur L1 distribution (from tags.json):
  streetscape=14, listing-exterior=5, event=2, restaurant=1
  → no park/school. PLAN below only references L1s we actually have.
"""
import re
from pathlib import Path

SRC = Path("/home/ubuntu/Percho/docs/pipelines/poc-output/compose.py")
src = SRC.read_text()

# --- 1) swap BASE to Decatur subdir (assets + tags.json + composition_plan.json + ffmpeg_cmd.sh all follow) ---
src = src.replace(
    'BASE = Path("/home/ubuntu/Percho/docs/pipelines/poc-output")',
    'BASE = Path("/home/ubuntu/Percho/docs/pipelines/poc-output/decatur")',
)

# --- 2) swap out_path filename ---
src = src.replace('"peachtree-corners-v1.mp4"', '"../decatur-v1.mp4"')

# --- 3) swap PLAN to Decatur-appropriate slots (no park/school L1 in dataset) ---
# 60s target: 3 + 12 + 15 + 10 + 8 + 8 + 5 = 61s → ffmpeg -t 60 trims
new_plan = '''PLAN = [
    ("hook",  ["streetscape"],                          1, 3.0, "Decatur, GA"),
    ("vibe",  ["streetscape", "restaurant"],            3, 4.0, "Walkable downtown, real neighbors"),
    ("list1", ["listing-exterior", "streetscape"],      3, 5.0, "The Square \\u00b7 Live-Work-Play"),
    ("list2", ["restaurant", "streetscape"],            2, 5.0, "MARTA-connected \\u00b7 Atlanta in 20 min"),
    ("schools",["event", "listing-exterior"],           2, 4.0, "City Schools of Decatur \\u00b7 top-rated"),
    ("homes", ["listing-exterior", "streetscape"],      2, 4.0, "Historic bungalows, quiet streets"),
    ("cta",   ["streetscape"],                          1, 5.0, "See Decatur homes \\u2192 percho.com/decatur"),
]'''
src = re.sub(r'PLAN = \[.*?\]\n', lambda m: new_plan + "\n", src, count=1, flags=re.DOTALL)

# --- exec ---
ns = {"__name__": "__main__", "__file__": str(SRC)}
exec(compile(src, str(SRC) + " [decatur-shim]", "exec"), ns)
