#!/usr/bin/env python3
"""
shred_clips — cut an agent's long handheld takes into a POOL of short clips.

Spike, 2026-09-02. Owner rejected phase151's approach outright: 「静帧推镜不可
以接受，有很多卡的地方 或者突然有些奇怪的画面」. Covering a bad window with a
push on a still reads as a stall. His instruction: 「把原视频裁剪成多个几秒的
clip 每个clip都有信息量 然后最后再统一plan」.

So the bad seconds are DROPPED, not covered, and what survives is cut into
short self-contained shots — the same shape `listing_photo_clips` already has,
so the planner can treat footage and stills as one pool.

Three inputs decide where a clip starts and ends:
  1. per-second smear + motion (clip_quality_probe's metrics) — a clip may not
     contain an unusable second at all
  2. Gemini's room-level timeline (video_tag_probe) — a clip never straddles
     two rooms, because a shot that changes subject halfway has no single
     caption
  3. a 3-5s target length — the owner's 「单个镜头时间很长」

Each surviving clip is then tagged on its own, so "每个clip都有信息量" is
verified per clip rather than inherited from its parent.

THRESHOLDS ARE ABSOLUTE here, calibrated once against the four-clip corpus
(blur p75 = 7.75, motion p75 = 7.58, motion p90 = 10.64). phase151's probe
took percentiles of whatever it was given, which made two runs incomparable.

Usage:
    python3 scripts/spikes/shred_clips.py <outdir> <clip.mp4> [...]
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from statistics import mean

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clip_quality_probe import series  # noqa: E402
from video_tag_probe import tag  # noqa: E402

BLUR_HI = 7.75
MOTION_HI = 7.58
MIN_CLIP_S = 2.5
TARGET_CLIP_S = 4.5
MAX_CLIP_S = 6.0
CW, CH = 1080, 1576
NORM = (f"fps=30,scale={CW}:{CH}:force_original_aspect_ratio=increase,"
        f"crop={CW}:{CH},setsar=1,format=yuv420p")


def bad_seconds(clip: Path) -> tuple[set[int], dict[int, tuple[float, float]]]:
    blur = series(clip, "blurdetect")
    motion = series(clip, "tblend=all_mode=difference,signalstats")
    bad: set[int] = set()
    stats: dict[int, tuple[float, float]] = {}
    for sec in sorted(blur):
        b = mean(blur[sec]) if blur[sec] else 0.0
        m = mean(motion[sec]) if motion.get(sec) else 0.0
        stats[sec] = (b, m)
        # ONLY smeared-and-moving. Motion on its own never disqualifies a
        # second, and the first draft of this rule proved why: a standalone
        # whip-pan threshold threw away 9 of the 23 seconds of the exterior
        # approach — the SHARPEST footage in the set (blur 3.6-6.2 against a
        # 7.5 median) and the two highest hero scores. Its motion is high
        # because the camera walks forward through a detailed outdoor frame,
        # which is a good shot, not a broken one.
        if b > BLUR_HI and m > MOTION_HI:
            bad.add(sec)
    return bad, stats


def runs_of_good(total: float, bad: set[int]) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    start: int | None = None
    for sec in range(int(total) + 1):
        if sec in bad:
            if start is not None:
                out.append((float(start), float(sec)))
                start = None
        elif start is None:
            start = sec
    if start is not None:
        out.append((float(start), total))
    return out


def cut_points(a: float, b: float) -> list[tuple[float, float]]:
    """Split [a,b) into 3-6s pieces, discarding a runt tail."""
    span = b - a
    if span < MIN_CLIP_S:
        return []
    n = max(1, round(span / TARGET_CLIP_S))
    each = span / n
    if each > MAX_CLIP_S:
        n = int(span // MAX_CLIP_S) + 1
        each = span / n
    return [(a + i * each, a + (i + 1) * each) for i in range(n)]


def main() -> None:
    outdir = Path(sys.argv[1])
    outdir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    for src in [Path(p) for p in sys.argv[2:]]:
        stem = src.stem[:8]
        print(f"\n=== {stem}")
        timeline = tag(src)["parsed"]
        bad, stats = bad_seconds(src)
        total = max(stats) + 1.0
        good = runs_of_good(total, bad)
        print(f"  {len(bad)} bad seconds dropped · {len(good)} usable runs")

        n = 0
        for seg in timeline.get("segments", []):
            s, e = float(seg["start"]), float(seg["end"])
            for ga, gb in good:
                a, b = max(s, ga), min(e, gb)
                for ca, cb in cut_points(a, b):
                    n += 1
                    out = outdir / f"{stem}-{n:02d}.mp4"
                    subprocess.run([
                        "ffmpeg", "-y", "-v", "error", "-ss", f"{ca:.3f}",
                        "-t", f"{cb - ca:.3f}", "-i", str(src),
                        "-vf", NORM, "-c:v", "libx264", "-preset", "medium",
                        "-crf", "20", "-c:a", "aac", "-b:a", "192k",
                        str(out),
                    ], check=True, timeout=300)
                    manifest.append({
                        "file": out.name, "source": src.name,
                        "start": round(ca, 2), "end": round(cb, 2),
                        "duration": round(cb - ca, 2),
                        "parent_room": seg.get("room_type"),
                    })

        print(f"  cut {n} clips")

    # Tag every surviving clip on its own — "有信息量" verified, not inherited.
    print(f"\n=== tagging {len(manifest)} clips")
    for entry in manifest:
        path = outdir / entry["file"]
        try:
            t = tag(path)["parsed"]
        except Exception as err:  # noqa: BLE001
            entry["tag_error"] = str(err)[:120]
            continue
        seg = (t.get("segments") or [{}])[0]
        entry.update({
            "room_type": seg.get("room_type") or entry["parent_room"],
            "caption": seg.get("caption"),
            "quality": seg.get("quality"),
            "hero_score": seg.get("hero_score"),
            "usable": seg.get("usable"),
            "speech": " ".join(s.get("text", "") for s in (t.get("speech") or [])),
        })

    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\n{'clip':<16}{'s':>7}{'dur':>6}  {'room':<10}{'q':>5}{'hero':>6}  caption")
    for e in manifest:
        print(f"{e['file']:<16}{e['start']:>7.1f}{e['duration']:>6.1f}  "
              f"{str(e.get('room_type'))[:9]:<10}{e.get('quality') or 0:>5.2f}"
              f"{e.get('hero_score') or 0:>6.2f}  {str(e.get('caption'))[:52]}")


if __name__ == "__main__":
    main()
