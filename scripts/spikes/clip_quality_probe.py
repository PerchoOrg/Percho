#!/usr/bin/env python3
"""
clip_quality_probe — which SECONDS of an agent's phone footage are worth using.

Spike, 2026-09-02. Owner watched the phase150 cut: 「视频画面有些抖动 有些画面
不清楚 单个镜头时间很长」. Gemini's per-segment `quality` score is a judgement;
this is a measurement, and it runs free and deterministically:

  blur    ffmpeg `blurdetect` → lavfi.blur, higher is blurrier
  motion  frame-to-frame difference (`tblend=difference` + `signalstats`
          YAVG), higher means the camera moved further between frames

Neither is a verdict on its own — a slow deliberate pan is high motion and
perfectly watchable. Read together they separate "moving" from "smeared":
high motion WITH high blur is the whip-pan that has to go.

Thresholds are derived from the footage itself (a percentile over all clips),
not guessed, because phone cameras differ.

Usage:
    python3 scripts/spikes/clip_quality_probe.py <clip.mp4> [...]
"""
from __future__ import annotations

import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean

FRAME_RE = re.compile(r"pts_time:([\d.]+)")
VALUE_RE = re.compile(r"lavfi\.(?:blur|signalstats\.YAVG)=([\d.]+)")


def series(path: Path, vf: str) -> dict[int, list[float]]:
    """{whole second → the frame values inside it}."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-v", "error", "-i", str(path),
         "-vf", f"{vf},metadata=mode=print:file=-", "-f", "null", "-"],
        capture_output=True, text=True, check=True, timeout=900,
    )
    buckets: dict[int, list[float]] = defaultdict(list)
    t = 0.0
    for line in (out.stdout + out.stderr).splitlines():
        m = FRAME_RE.search(line)
        if m:
            t = float(m.group(1))
            continue
        v = VALUE_RE.search(line)
        if v:
            buckets[int(t)].append(float(v.group(1)))
    return buckets


def main() -> None:
    clips = [Path(p) for p in sys.argv[1:]]
    per_clip: dict[str, tuple[dict[int, list[float]], dict[int, list[float]]]] = {}
    all_blur: list[float] = []
    all_motion: list[float] = []

    for clip in clips:
        blur = series(clip, "blurdetect")
        motion = series(clip, "tblend=all_mode=difference,signalstats")
        per_clip[clip.name] = (blur, motion)
        all_blur += [mean(v) for v in blur.values() if v]
        all_motion += [mean(v) for v in motion.values() if v]

    def pct(xs: list[float], p: float) -> float:
        s = sorted(xs)
        return s[min(len(s) - 1, int(len(s) * p))]

    blur_hi = pct(all_blur, 0.75)
    motion_hi = pct(all_motion, 0.75)
    print(f"corpus: {len(all_blur)} seconds · blur p50={pct(all_blur, 0.5):.2f} "
          f"p75={blur_hi:.2f} p90={pct(all_blur, 0.9):.2f}")
    print(f"                        motion p50={pct(all_motion, 0.5):.3f} "
          f"p75={motion_hi:.3f} p90={pct(all_motion, 0.9):.3f}\n")

    for name, (blur, motion) in per_clip.items():
        print(f"{name[:8]}  ({max(blur) + 1}s)")
        bad: list[int] = []
        for sec in sorted(blur):
            b = mean(blur[sec]) if blur[sec] else 0.0
            m = mean(motion.get(sec, [0.0])) if motion.get(sec) else 0.0
            # A second is unusable when it is BOTH smeared and moving fast.
            flag = "  <-- drop" if (b > blur_hi and m > motion_hi) else ""
            if flag:
                bad.append(sec)
            bar = "#" * min(30, int(m * 2))
            print(f"   {sec:3d}s  blur {b:6.2f}  motion {m:.4f} {bar}{flag}")
        if bad:
            runs: list[list[int]] = []
            for s in bad:
                if runs and s == runs[-1][-1] + 1:
                    runs[-1].append(s)
                else:
                    runs.append([s])
            spans = ", ".join(f"{r[0]}-{r[-1] + 1}s" for r in runs)
            print(f"   → {len(bad)}s unusable: {spans}")
        else:
            print("   → nothing flagged")
        print()


if __name__ == "__main__":
    main()
