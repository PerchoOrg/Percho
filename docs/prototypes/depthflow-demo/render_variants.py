"""Render the 4-clip demo with a chosen depth source: da2-small | da2-large | pro.

Usage: python render_variants.py <variant>
For 'pro', expects precomputed depth at depth-pro/<stem>.npy (see depth_pro_infer.py).
"""

import math
import sys
import time
from pathlib import Path
from typing import Literal

import numpy as np
from attrs import define
from depthflow.estimators.anything import DepthAnythingBase, DepthAnythingV2
from depthflow.scene import DepthScene, DepthState

PHOTOS = Path.home() / "Workspace/fmls-scrape/photos/582110389"
ROOT = Path(__file__).parent

Move = Literal["zoom_in", "zoom_out", "orbit_left", "orbit_right"]


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


@define
class RealEstateMove(DepthScene):
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


CLIPS: list[tuple[str, Move]] = [
    ("00.jpg", "orbit_right"),
    ("05.jpg", "zoom_in"),
    ("07.jpg", "orbit_left"),
    ("03.jpg", "zoom_out"),
]


def main() -> None:
    variant = sys.argv[1]
    out = ROOT / f"clips-{variant}"
    out.mkdir(exist_ok=True)

    scene = RealEstateMove(backend="headless")
    scene.ffmpeg.h264(preset="slow")

    if variant == "da2-large":
        scene.estimator = DepthAnythingV2(model=DepthAnythingBase.Model.Large)
    elif variant not in ("da2-small", "pro"):
        raise SystemExit(f"unknown variant: {variant}")

    for photo, move in CLIPS:
        stem = Path(photo).stem
        depth = None
        if variant == "pro":
            depth = np.load(ROOT / "depth-pro" / f"{stem}.npy")
        scene.input(image=PHOTOS / photo, depth=depth)
        scene.state = DepthState()
        scene.move = move
        t0 = time.time()
        scene.main(
            output=out / f"{stem}-{move}.mp4",
            time=3, fps=30, width=800, height=600, ssaa=2.0,
        )
        print(f"[timing] {variant} {photo} {move}: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
