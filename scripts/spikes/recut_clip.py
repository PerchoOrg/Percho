#!/usr/bin/env python3
"""
recut_clip — replace the unusable SECONDS of a clip without touching a word.

Spike, 2026-09-02. Owner on the phase150 cut: 「需要granular control 视频画面
有些抖动 有些画面不清楚 单个镜头时间很长 打碎之后重新拼凑的可能性大不大」.

The measurement (clip_quality_probe) says 8% of the footage is smeared, in
runs of 2-5 seconds. The transcript says those runs land INSIDE her sentences
— 13-15s falls in the middle of 「然后上来了之后，首先是一个开放式的楼上的小
客厅」. So cutting video and audio together destroys the narration, and
`deshake` cannot help: the frames carry baked-in motion blur from fast pans,
not jitter.

The way out is to decouple the two. Her audio is the SPINE and never moves;
the picture is free to change under it. A bad window is covered by a slow push
on the sharpest frame from just before it — Ken Burns on a still, which is
what the photo pipeline already does for every listing.

Usage:
    python3 scripts/spikes/recut_clip.py <out.mp4> <clip.mp4> <a-b> [<a-b> ...]
    e.g.  ... upstairs.mp4 8b85be07.mp4 6-8 13-15 33-34 37-41
"""
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

CW, CH = 1080, 1576
FPS = 30
NORM = (f"fps={FPS},scale={CW}:{CH}:force_original_aspect_ratio=increase,"
        f"crop={CW}:{CH},setsar=1,format=yuv420p")


def run(args: list[str]) -> None:
    subprocess.run(args, check=True, timeout=900,
                   capture_output=True, text=True)


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True, timeout=30)
    return float(out.stdout.strip())


def blur_of(image: Path) -> float:
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-v", "error", "-i", str(image),
         "-vf", "blurdetect,metadata=mode=print:file=-", "-f", "null", "-"],
        capture_output=True, text=True, check=True, timeout=60)
    vals = [float(m) for m in re.findall(r"lavfi\.blur=([\d.]+)",
                                         out.stdout + out.stderr)]
    return min(vals) if vals else 999.0


def sharpest_frame(src: Path, before: float, work: Path, tag: str) -> Path:
    """The least-blurred frame in the 1.5s leading up to `before`."""
    best: tuple[float, Path] | None = None
    for i in range(6):
        t = max(0.0, before - 1.5 + i * 0.25)
        cand = work / f"{tag}-{i}.png"
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(src),
             "-frames:v", "1", "-vf", NORM, str(cand)])
        if not cand.exists():
            continue
        b = blur_of(cand)
        if best is None or b < best[0]:
            best = (b, cand)
    if best is None:
        raise RuntimeError(f"no frame found before {before}s")
    print(f"    cover for {before:.0f}s ← sharpest frame blur={best[0]:.2f}")
    return best[1]


def main() -> None:
    out_path = Path(sys.argv[1])
    src = Path(sys.argv[2])
    spans = []
    for raw in sys.argv[3:]:
        a, b = raw.split("-")
        spans.append((float(a), float(b)))
    spans.sort()

    work = Path(tempfile.mkdtemp(prefix="recut-"))
    total = duration(src)

    # Alternate good source / generated cover across the whole timeline.
    pieces: list[Path] = []
    cursor = 0.0
    idx = 0
    for a, b in spans:
        if a > cursor:
            keep = work / f"{idx:02d}-keep.mp4"
            run(["ffmpeg", "-y", "-v", "error", "-ss", f"{cursor:.3f}",
                 "-t", f"{a - cursor:.3f}", "-i", str(src), "-an",
                 "-vf", NORM, "-c:v", "libx264", "-preset", "medium",
                 "-crf", "18", str(keep)])
            pieces.append(keep)
            idx += 1
        still = sharpest_frame(src, a, work, f"{idx:02d}")
        cover = work / f"{idx:02d}-cover.mp4"
        frames = int(round((b - a) * FPS))
        run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(still),
             "-vf", f"zoompan=z='min(zoom+0.0009,1.12)':d={frames}:"
                    f"s={CW}x{CH}:fps={FPS},format=yuv420p",
             "-frames:v", str(frames), "-c:v", "libx264", "-preset", "medium",
             "-crf", "18", str(cover)])
        pieces.append(cover)
        idx += 1
        cursor = b
    if cursor < total:
        tail = work / f"{idx:02d}-keep.mp4"
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{cursor:.3f}",
             "-i", str(src), "-an", "-vf", NORM, "-c:v", "libx264",
             "-preset", "medium", "-crf", "18", str(tail)])
        pieces.append(tail)

    listing = work / "list.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in pieces))
    video = work / "video.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", str(listing), "-c", "copy", str(video)])

    # Her audio, whole and unedited, over the rebuilt picture.
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", str(src),
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-shortest", "-movflags", "+faststart",
         str(out_path)])
    print(f"  {out_path} — {duration(out_path):.2f}s "
          f"(source {total:.2f}s), {len(pieces)} pieces")


if __name__ == "__main__":
    main()
