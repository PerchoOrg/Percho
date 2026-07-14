#!/usr/bin/env python3
"""E2: listing-focused reel — 3 mock GA listings + PTC B-roll.

Shim over compose.py's ffmpeg pattern. Does NOT modify compose.py.
Reuses:
  - Composition pattern (scale/pad/drawtext/concat) from compose.py
  - PTC B-roll from assets/ (already tagged in tags.json)
  - Mock listing photos from mock-listings/*/ (E1 output)
Output: poc-output/listing-reel-v1.mp4 (1080x1920, ~57s, listing-focused)

Reel structure (selling-only voice, GA-only listings — memory aligned):
  hook  (3s)  → PTC aerial-ish streetscape          "3 GA homes · Just listed"
  L1x5  (15s) → Alpharetta mock-001 photos 5×3s     "Alpharetta · $875K · 4bd/3.5ba"
  bro1  (2s)  → PTC streetscape                     "Fulton County"
  L2x5  (15s) → Decatur mock-002 photos 5×3s        "Decatur · $645K · Oakhurst"
  bro2  (2s)  → PTC restaurant/park                 "Walkable to Downtown Decatur"
  L3x5  (15s) → Peachtree Corners mock-003 5×3s     "Peachtree Corners · $1.12M · new build"
  cta   (5s)  → PTC gateway                         "See all → percho.com"

Total: 57s (hard cap 60s via ffmpeg -t 60).
"""
import json
import subprocess
from pathlib import Path

BASE = Path("/home/ubuntu/Percho/docs/pipelines/poc-output")
ASSETS = BASE / "assets"
LISTINGS_DIR = BASE / "mock-listings"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BG = "0xF7F5F2"   # peach-tinted off-white (memory: peach/moss/sage, no dark)
FG = "0x2A2A2A"

# Load PTC tags to pick B-roll deterministically
tags = json.loads((BASE / "tags.json").read_text())
by_l1 = {}
for t in tags:
    by_l1.setdefault(t["L1"], []).append(t["filename"])

# Load listings
listings = json.loads((LISTINGS_DIR / "listings.json").read_text())["listings"]
assert len(listings) == 3, f"expected 3 mock listings, got {len(listings)}"

# Pick PTC B-roll: prefer non-logo streetscapes for hook/bro/cta
def pick_broll(prefs, exclude):
    for pref in prefs:
        for fn in by_l1.get(pref, []):
            if fn in exclude or "Logo" in fn or "Seal" in fn:
                continue
            exclude.add(fn)
            return fn
    return None

used_broll = set()
hook_asset = pick_broll(["streetscape"], used_broll)  # Gateway / Route 141 style
bro1_asset = pick_broll(["streetscape"], used_broll)
bro2_asset = pick_broll(["restaurant", "park", "streetscape"], used_broll)
cta_asset  = pick_broll(["streetscape"], used_broll)

# Selling-only captions, mock: prices/beds directly from listings.json
def listing_caption(L):
    a = L["address"]
    price_k = L["list_price_usd"] // 1000
    price_txt = f"${price_k}K" if price_k < 1000 else f"${L['list_price_usd']/1e6:.2f}M"
    hood = a.get("neighborhood") or a["city"]
    return f"{a['city']} · {price_txt} · {L['beds']}bd/{L['baths']}ba"

# Build clip plan: (source_path, seconds, caption, slot)
plan = []
# hook
plan.append((str(ASSETS / hook_asset), 3.0, "3 GA homes · Just listed", "hook"))
# L1 Alpharetta
L1 = listings[0]
cap1 = listing_caption(L1)
for i, ph in enumerate(L1["photos"]):
    plan.append((str(LISTINGS_DIR / ph["file"]), 3.0, cap1, "listing"))
# bro1
plan.append((str(ASSETS / bro1_asset), 2.0, f"{L1['school_district']}", "broll"))
# L2 Decatur
L2 = listings[1]
cap2 = listing_caption(L2)
for i, ph in enumerate(L2["photos"]):
    plan.append((str(LISTINGS_DIR / ph["file"]), 3.0, cap2, "listing"))
# bro2
plan.append((str(ASSETS / bro2_asset), 2.0, "Walkable neighborhoods", "broll"))
# L3 Peachtree Corners
L3 = listings[2]
cap3 = listing_caption(L3)
for i, ph in enumerate(L3["photos"]):
    plan.append((str(LISTINGS_DIR / ph["file"]), 3.0, cap3, "listing"))
# CTA
plan.append((str(ASSETS / cta_asset), 5.0, "See homes → percho.com", "cta"))

total_s = sum(c[1] for c in plan)
print(f"Plan: {len(plan)} clips, total {total_s:.1f}s")

# Save plan (mirrors composition_plan.json shape)
(BASE / "listing_composition_plan.json").write_text(json.dumps([
    {"file": p, "seconds": s, "caption": c, "slot": sl} for p, s, c, sl in plan
], indent=2, ensure_ascii=False))

# Build ffmpeg command
inputs = []
for src, secs, cap, slot in plan:
    inputs += ["-loop", "1", "-t", str(secs), "-i", src]

inputs += ["-f", "lavfi", "-t", str(total_s), "-i", "anullsrc=cl=stereo:r=48000"]
audio_idx = len(plan)

def esc(s):
    return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

filters = []
for i, (src, secs, cap, slot) in enumerate(plan):
    ec = esc(cap)
    if slot == "hook":
        fs, y = 78, "260"
    elif slot == "cta":
        fs, y = 62, "(h-text_h)/2"
    elif slot == "broll":
        fs, y = 44, "h-260"
    else:  # listing — put caption at bottom, larger for legibility
        fs, y = 52, "h-280"
    f = (
        f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
        f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color={BG},"
        f"drawtext=fontfile={FONT}:text='{ec}':fontsize={fs}:fontcolor={FG}:"
        f"x=(w-text_w)/2:y={y}:box=1:boxcolor={BG}@0.75:boxborderw=18,"
        f"setsar=1,fps=30,format=yuv420p[v{i}]"
    )
    filters.append(f)

concat_inputs = "".join(f"[v{i}]" for i in range(len(plan)))
filters.append(f"{concat_inputs}concat=n={len(plan)}:v=1:a=0[vout]")
filter_complex = ";".join(filters)

out_path = BASE / "listing-reel-v1.mp4"
cmd = [
    "/usr/bin/ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
    *inputs,
    "-filter_complex", filter_complex,
    "-map", "[vout]", "-map", f"{audio_idx}:a",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "96k",
    "-t", "60",
    "-movflags", "+faststart",
    str(out_path),
]

(BASE / "listing_ffmpeg_cmd.sh").write_text("#!/bin/bash\n" + " \\\n  ".join(
    (f"'{a}'" if any(c in a for c in " ;[]") else a) for a in cmd
) + "\n")

print("Running ffmpeg...")
r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
if r.returncode != 0:
    print("STDERR:", r.stderr[-2000:])
    raise SystemExit(r.returncode)
print(f"OK → {out_path}")
