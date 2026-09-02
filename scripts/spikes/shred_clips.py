#!/usr/bin/env python3
"""
shred_clips — split an agent's takes ONLY where the footage itself changes.

Spike, 2026-09-02, second shape. The first one cut every take into 3-6s
pieces; the owner rejected the clock: 「不要限定3-6秒 要以事实为依据 有结构的
拆分 然后再重组 如果原视频保留就是最好的 那就保留」. He was right — the
23-second exterior approach is one continuous shot with nothing wrong in it,
and cutting it into five 4.5s pieces destroyed a shot to satisfy a constant.

So there is no target length and no maximum. A boundary exists only where a
FACT puts one:

  · the subject changes  — Gemini's timeline (video_tag_probe), which is asked
                           to cut where the room or subject changes and
                           explicitly not on a clock
  · a span is unusable   — measured smear+motion; the span is removed, which
                           necessarily ends the clip before it and starts the
                           next one after it

Whatever falls between two boundaries is one clip, at whatever length that
turns out to be. A take with no internal boundary comes through whole.

The only length rule left is a floor: a sub-second or two-second remnant left
over after removing an unusable span carries nothing, so it is dropped rather
than emitted. That is a fact about information, not a rhythm.

Thresholds are absolute, calibrated once against the four-clip corpus.
Motion alone never disqualifies a second — see the DEVLOG for phase152.

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
# Below this a piece is a remnant, not a shot: too short to read, too short to
# carry a caption. Nothing else constrains length.
MIN_CLIP_S = 2.0
CW, CH = 1080, 1576
NORM = (f"fps=30,scale={CW}:{CH}:force_original_aspect_ratio=increase,"
        f"crop={CW}:{CH},setsar=1,format=yuv420p")


def bad_seconds(clip: Path) -> tuple[set[int], float]:
    blur = series(clip, "blurdetect")
    motion = series(clip, "tblend=all_mode=difference,signalstats")
    bad = set()
    for sec in sorted(blur):
        b = mean(blur[sec]) if blur[sec] else 0.0
        m = mean(motion[sec]) if motion.get(sec) else 0.0
        if b > BLUR_HI and m > MOTION_HI:
            bad.add(sec)
    return bad, float(max(blur) + 1)


def usable_runs(total: float, bad: set[int]) -> list[tuple[float, float]]:
    runs, start = [], None
    for sec in range(int(total) + 1):
        if sec in bad:
            if start is not None:
                runs.append((float(start), float(sec)))
                start = None
        elif start is None:
            start = sec
    if start is not None:
        runs.append((float(start), total))
    return runs


def main() -> None:
    outdir = Path(sys.argv[1])
    outdir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    for src in [Path(p) for p in sys.argv[2:]]:
        stem = src.stem[:8]
        timeline = tag(src)["parsed"]
        segs = timeline.get("segments") or []
        bad, total = bad_seconds(src)
        runs = usable_runs(total, bad)
        print(f"\n=== {stem}  {total:.0f}s · {len(segs)} subject segments · "
              f"{len(bad)}s unusable")

        n = 0
        for seg in segs:
            s, e = float(seg["start"]), float(seg["end"])
            for ra, rb in runs:
                a, b = max(s, ra), min(e, rb)
                if b - a < MIN_CLIP_S:
                    continue
                n += 1
                # Why this clip ends where it does — the planner and the
                # reviewer both want to know which boundaries are subject
                # changes and which are damage. Asked of the DAMAGE, not of
                # the segment's declared end: Gemini's last segment often runs
                # a fraction past the real duration, and comparing against it
                # labelled an undamaged take as trimmed.
                trimmed = (int(a) - 1 in bad) or (int(b) in bad)
                out = outdir / f"{stem}-{n:02d}.mp4"
                subprocess.run([
                    "ffmpeg", "-y", "-v", "error", "-ss", f"{a:.3f}",
                    "-t", f"{b - a:.3f}", "-i", str(src), "-vf", NORM,
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-c:a", "aac", "-b:a", "192k", str(out),
                ], check=True, timeout=600)
                manifest.append({
                    "file": out.name, "source": src.name,
                    "start": round(a, 2), "end": round(b, 2),
                    "duration": round(b - a, 2),
                    "boundary": "unusable span removed" if trimmed
                                else ("whole take"
                                      if len(segs) == 1 and not bad
                                      else "subject change"),
                    "parent_room": seg.get("room_type"),
                })
        print(f"  → {n} clip(s)")

    print(f"\n=== tagging {len(manifest)} clips")
    for entry in manifest:
        try:
            t = tag(outdir / entry["file"])["parsed"]
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

    (outdir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\n{'clip':<16}{'s':>7}{'dur':>6}  {'room':<10}{'q':>5}{'hero':>6}  "
          f"{'boundary':<22}caption")
    for e in manifest:
        print(f"{e['file']:<16}{e['start']:>7.1f}{e['duration']:>6.1f}  "
              f"{str(e.get('room_type'))[:9]:<10}{e.get('quality') or 0:>5.2f}"
              f"{e.get('hero_score') or 0:>6.2f}  {e['boundary']:<22}"
              f"{str(e.get('caption'))[:44]}")
    print(f"\n{len(manifest)} clips · "
          f"{sum(e['duration'] for e in manifest):.1f}s · lengths "
          f"{min(e['duration'] for e in manifest):.1f}-"
          f"{max(e['duration'] for e in manifest):.1f}s")


if __name__ == "__main__":
    main()
