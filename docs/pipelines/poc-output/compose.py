#!/usr/bin/env python3
"""Composer: pick assets by slot, build ffmpeg command, run it."""
import json
import subprocess
from pathlib import Path

BASE = Path("/home/ubuntu/Percho/docs/pipelines/poc-output")
ASSETS = BASE / "assets"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BG = "0xF7F5F2"
FG = "0x2A2A2A"

tags = json.loads((BASE / "tags.json").read_text())
by_l1 = {}
for t in tags:
    by_l1.setdefault(t["L1"], []).append(t["filename"])

# Slot plan: (label_for_caption, L1_preference_list, count, seconds_each, caption)
# Total should be ~60s. We drop CTA into last slot as a still.
PLAN = [
    ("hook",  ["streetscape"],                    1, 3.0, "Peachtree Corners"),
    ("vibe",  ["streetscape", "restaurant"],      3, 4.0, "Where Atlanta lives quietly"),
    ("list1", ["streetscape", "restaurant"],      3, 5.0, "Town Center · Live–Work–Play"),
    ("list2", ["restaurant", "streetscape"],      2, 5.0, "The Forum · walkable retail"),
    ("park",  ["park"],                           2, 4.0, "Chattahoochee greenway"),
    ("school",["school", "event"],                2, 4.0, "Simpson Elementary · Norcross HS"),
    ("cta",   ["streetscape"],                    1, 5.0, "See homes → percho.com/ptc"),
]
# durations: 3 + 12 + 15 + 10 + 8 + 8 + 5 = 61s (close enough; will trim to 60)

# Pick assets round-robin from preferences, avoid duplicates
used = set()
plan_resolved = []
for label, prefs, n, secs, caption in PLAN:
    picks = []
    for pref in prefs:
        for fn in by_l1.get(pref, []):
            if fn in used: continue
            picks.append(fn)
            used.add(fn)
            if len(picks) == n: break
        if len(picks) == n: break
    # backfill from any remaining if short
    if len(picks) < n:
        for t in tags:
            if t["filename"] in used: continue
            picks.append(t["filename"])
            used.add(t["filename"])
            if len(picks) == n: break
    for p in picks:
        plan_resolved.append({"file": p, "seconds": secs, "caption": caption, "slot": label})

# save plan
(BASE / "composition_plan.json").write_text(json.dumps(plan_resolved, indent=2, ensure_ascii=False))
print(f"Plan: {len(plan_resolved)} clips, total {sum(c['seconds'] for c in plan_resolved):.1f}s")

# Build ffmpeg command
inputs = []
filters = []
for i, clip in enumerate(plan_resolved):
    inputs += ["-loop", "1", "-t", str(clip["seconds"]), "-i", str(ASSETS / clip["file"])]

total_s = sum(c["seconds"] for c in plan_resolved)
# silent audio track
inputs += ["-f", "lavfi", "-t", str(total_s), "-i", f"anullsrc=cl=stereo:r=48000"]
audio_idx = len(plan_resolved)

# escape caption for drawtext
def esc(s):
    return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

for i, clip in enumerate(plan_resolved):
    cap = esc(clip["caption"])
    slot = clip["slot"]
    # font size / y position by slot
    if slot == "hook":
        fs, y = 78, "260"
    elif slot == "cta":
        fs, y = 62, "(h-text_h)/2"
    else:
        fs, y = 44, "h-260"
    f = (
        f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
        f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color={BG},"
        f"drawtext=fontfile={FONT}:text='{cap}':fontsize={fs}:fontcolor={FG}:"
        f"x=(w-text_w)/2:y={y}:box=1:boxcolor={BG}@0.7:boxborderw=18,"
        f"setsar=1,fps=30,format=yuv420p[v{i}]"
    )
    filters.append(f)

concat_inputs = "".join(f"[v{i}]" for i in range(len(plan_resolved)))
filters.append(f"{concat_inputs}concat=n={len(plan_resolved)}:v=1:a=0[vout]")

filter_complex = ";".join(filters)

out_path = BASE / "peachtree-corners-v1.mp4"
cmd = [
    "/usr/bin/ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
    *inputs,
    "-filter_complex", filter_complex,
    "-map", "[vout]", "-map", f"{audio_idx}:a",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "96k",
    "-t", "60",   # hard cap 60s
    "-movflags", "+faststart",
    str(out_path),
]

# save the cmd for reproducibility
(BASE / "ffmpeg_cmd.sh").write_text("#!/bin/bash\n" + " \\\n  ".join(
    (f"'{a}'" if any(c in a for c in " ;[]") else a) for a in cmd
) + "\n")

print("Running ffmpeg...")
r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
if r.returncode != 0:
    print("STDERR:", r.stderr[-2000:])
    raise SystemExit(r.returncode)
print(f"OK → {out_path}")
