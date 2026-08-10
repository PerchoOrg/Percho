#!/usr/bin/env python3
"""
Render ONE clip with DepthFlow 2.5D parallax, for generate.py's
`--engine depthflow` path.

Kept as a separate script on purpose: generate.py is stdlib-only and runs
under the worker's system interpreter, while DepthFlow needs torch and a depth
model. generate.py shells out to this with a dedicated interpreter, the same
shape as its caption-render call.

Output is the parallax render at the photo's own aspect ratio. generate.py
does the canvas composition, so the blur-letterbox / cover-crop behaviour stays
in one place and both engines share it.

Usage:
  <depthflow-python> depthflow_clip.py --photo P --out O --mode M \
      --duration 3.0 --width 1080 --height 810
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Sibling import: the worker invokes this by absolute path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from attrs import define
from depthflow.scene import DepthScene, DepthState

from depthflow_modes import resolve

def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


@define
class ListingMove(DepthScene):
    move: str = "orbit_right"

    def update(self) -> None:
        s = ease(self.tau)
        st = self.state
        st.steady = 0.30
        st.height = 0.25

        if self.move in ("orbit_left", "orbit_right"):
            sign = -1.0 if self.move == "orbit_left" else 1.0
            st.focus = 0.30
            st.zoom = 0.94
            st.isometric = 0.60
            st.offset = (sign * (0.70 * s - 0.35), 0.0)

        elif self.move == "zoom_in":
            st.height = 0.20
            st.isometric = 0.40
            st.zoom = 1.0 - 0.10 * s

        elif self.move == "zoom_out":
            st.height = 0.20
            st.isometric = 0.40
            st.zoom = 0.90 + 0.10 * s

        elif self.move == "tilt_parallax":
            st.focus = 0.30
            st.zoom = 0.94
            st.isometric = 0.60
            st.offset = (0.0, 0.50 * s - 0.25)

        elif self.move == "dolly_in":
            st.isometric = 0.40
            st.dolly = 0.60 * s
            st.zoom = 1.0 - 0.06 * s

        elif self.move == "parallax_bloom":
            st.isometric = 0.50
            st.zoom = 0.96
            st.height = 0.05 + 0.35 * s
            st.offset = (0.12 * s, 0.0)

        elif self.move == "static":
            st.height = 0.0
            st.isometric = 0.0
            st.zoom = 0.98


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--photo", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--mode", required=True)
    p.add_argument("--duration", required=True, type=float)
    p.add_argument("--width", required=True, type=int)
    p.add_argument("--height", required=True, type=int)
    p.add_argument("--fps", type=int, default=30)
    args = p.parse_args()

    move = resolve(args.mode)
    if move is None:
        print(f"depthflow_clip: unknown mode {args.mode!r}", file=sys.stderr)
        raise SystemExit(2)

    scene = ListingMove(backend="headless")
    scene.ffmpeg.h264(preset="slow")
    scene.input(image=args.photo)
    scene.state = DepthState()
    scene.move = move
    args.out.parent.mkdir(parents=True, exist_ok=True)
    scene.main(output=args.out, time=args.duration, fps=args.fps,
               width=args.width, height=args.height, ssaa=2.0)


if __name__ == "__main__":
    main()
