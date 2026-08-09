"""Render a listing as a DepthFlow parallax video in the production format:
vertical 1080x1920, blur-letterbox composition, crossfades, BGM.

Same output shape as scripts/ken-burns/generate.py — the only thing swapped is
the per-photo motion (2.5D parallax instead of ffmpeg pan/zoom), so the two can
be compared directly.

Usage:
  .venv-depthflow/bin/python scripts/prototypes/photo-motion/depthflow_listing.py \
      <photo-dir> --out listing.mp4 --bgm path/to.mp3
"""

import argparse
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Literal

from attrs import define
from depthflow.scene import DepthScene, DepthState

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "ken-burns"))
import generate as kb  # noqa: E402  — production concat/BGM, reused verbatim

OUT = Path(__file__).parent / "out"

W, H = 1080, 1920          # production portrait canvas
CLIP_W, CLIP_H = 1080, 810  # 4:3 parallax render, letterboxed onto the canvas
SECONDS = 3
XFADE = 0.5

Move = Literal["zoom_in", "zoom_out", "orbit_left", "orbit_right"]
CHOREOGRAPHY: list[Move] = ["orbit_right", "zoom_in", "orbit_left", "zoom_out"]


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


@define
class RealEstateMove(DepthScene):
    """The camera moves from the original demo, unchanged."""

    move: Move = "zoom_in"

    def update(self) -> None:
        s = ease(self.tau)

        if self.move == "zoom_in":
            self.state.height = 0.20
            self.state.steady = 0.30
            self.state.isometric = 0.40
            self.state.zoom = 1.0 - 0.10 * s

        elif self.move == "zoom_out":
            self.state.height = 0.20
            self.state.steady = 0.30
            self.state.isometric = 0.40
            self.state.zoom = 0.90 + 0.10 * s

        elif self.move in ("orbit_left", "orbit_right"):
            sign = -1.0 if self.move == "orbit_left" else 1.0
            self.state.height = 0.25
            self.state.steady = 0.30
            self.state.focus = 0.30
            self.state.zoom = 0.94
            self.state.isometric = 0.60
            self.state.offset = (sign * (0.70 * s - 0.35), 0.0)


def to_canvas(clip: Path, dst: Path) -> None:
    """Blur-letterbox the parallax clip onto the portrait canvas.

    Copied from kenburns_filter in scripts/ken-burns/generate.py: background is
    the same frame scaled to cover, heavily blurred and dimmed; foreground is
    the frame scaled to fit, centred. Keeping it identical is the point — it
    isolates the motion as the only difference between the two videos.
    """
    bg = (
        f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
        f"boxblur=40:2,eq=brightness=-0.15:saturation=0.85,setsar=1"
    )
    fg = f"scale={W}:{H}:force_original_aspect_ratio=decrease,setsar=1"
    graph = (
        f"[0:v]split=2[bgsrc][fgsrc];[bgsrc]{bg}[bg];[fgsrc]{fg}[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(clip),
         "-filter_complex", graph, "-c:v", "libx264", "-preset", "slow",
         "-crf", "20", "-pix_fmt", "yuv420p", str(dst)],
        check=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo_dir", type=Path)
    ap.add_argument("--out", required=True)
    ap.add_argument("--bgm", type=Path, default=None)
    args = ap.parse_args()

    photos = sorted(args.photo_dir.glob("*.jpg"))
    OUT.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="depthflow-listing-"))

    scene = RealEstateMove(backend="headless")
    scene.ffmpeg.h264(preset="slow")

    canvas_clips: list[str] = []
    for i, photo in enumerate(photos):
        move = CHOREOGRAPHY[i % len(CHOREOGRAPHY)]
        raw = work / f"{i:02d}-raw.mp4"
        scene.input(image=photo)
        scene.state = DepthState()
        scene.move = move
        t0 = time.time()
        scene.main(output=raw, time=SECONDS, fps=kb.FPS,
                   width=CLIP_W, height=CLIP_H, ssaa=2.0)
        composed = work / f"{i:02d}-canvas.mp4"
        to_canvas(raw, composed)
        canvas_clips.append(str(composed))
        print(f"[clip] {photo.name} {move}: {time.time() - t0:.1f}s")

    concat = work / "concat.mp4"
    total = kb.concat_with_crossfade(canvas_clips, str(concat), XFADE, W, H)
    dst = OUT / args.out
    if args.bgm:
        kb.mux_bgm(str(concat), str(args.bgm), str(dst), total)
    else:
        subprocess.run(["cp", str(concat), str(dst)], check=True)
    print(f"[done] {dst} — {total:.1f}s, {len(canvas_clips)} clips")


if __name__ == "__main__":
    main()
