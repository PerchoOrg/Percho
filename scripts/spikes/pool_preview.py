#!/usr/bin/env python3
"""
pool_preview — one reel showing every clip in the shredded pool, labelled.

Spike, 2026-09-02. `shred_clips.py` produces a pool the planner will later
order; this is how a human checks it. Each clip plays in source order with its
own tag burned into the lower band, so the owner can see WHICH clip a
complaint belongs to.

Silent on purpose: the pool is being judged on picture — 「视频画面有些抖动 有
些画面不清楚」 — and each clip's audio is a fragment of a sentence, which is
noise when you are looking at shots. How the narration is laid back over the
planned order is the next question, not this one.

Labels are drawn with PIL and overlaid, because this ffmpeg has no drawtext
(built without libfreetype). Run with the render venv's python, which has PIL:

    ~/Workspace/Percho/.venv-render/bin/python3 \\
        scripts/spikes/pool_preview.py <pooldir> <out.mp4>
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CW, CH = 1080, 1576
BAND = 150
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"


def label_png(entry: dict, n: int, total: int, dest: Path) -> None:
    img = Image.new("RGBA", (CW, BAND), (0, 0, 0, 205))
    d = ImageDraw.Draw(img)
    big = ImageFont.truetype(FONT, 34)
    small = ImageFont.truetype(FONT, 26)
    head = (f"{n}/{total}  {entry['file'].replace('.mp4', '')}  "
            f"{entry['duration']:.1f}s  ({entry['start']:.1f}-"
            f"{entry['start'] + entry['duration']:.1f}s)")
    d.text((28, 16), head, font=big, fill=(255, 255, 255, 255))
    meta = (f"{entry.get('room_type')}   q {entry.get('quality')}   "
            f"hero {entry.get('hero_score')}   ·   {entry.get('boundary')}")
    d.text((28, 62), meta, font=small, fill=(150, 220, 255, 255))
    cap = str(entry.get("caption") or "")[:74]
    d.text((28, 100), cap, font=small, fill=(220, 220, 220, 255))
    img.save(dest)


def main() -> None:
    pool = Path(sys.argv[1])
    out = Path(sys.argv[2])
    entries = json.loads((pool / "manifest.json").read_text())
    work = Path(tempfile.mkdtemp(prefix="preview-"))
    pieces: list[Path] = []

    for i, e in enumerate(entries, 1):
        png = work / f"{i:02d}.png"
        label_png(e, i, len(entries), png)
        dest = work / f"{i:02d}.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-v", "error",
            "-i", str(pool / e["file"]), "-i", str(png),
            "-filter_complex", f"[0:v][1:v]overlay=0:{CH - BAND}:format=auto",
            "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "22",
            str(dest),
        ], check=True, timeout=300)
        pieces.append(dest)

    lst = work / "list.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in pieces))
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
        "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(out),
    ], check=True, timeout=900)
    print(f"{out} — {len(pieces)} clips, {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
