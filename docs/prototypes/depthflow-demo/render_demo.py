"""Percho demo: AutoReel-style per-photo camera moves via DepthFlow 2.5D parallax."""

import math
import time
from pathlib import Path
from typing import Literal

from attrs import define
from depthflow.scene import DepthScene, DepthState

PHOTOS = Path.home() / "Workspace/fmls-scrape/photos/582110389"
OUT = Path(__file__).parent / "demo-clips"
OUT.mkdir(exist_ok=True)

Move = Literal["zoom_in", "zoom_out", "orbit_left", "orbit_right"]


def ease(t: float) -> float:
    """Smoothstep ease-in-out, t in [0,1]."""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


@define
class RealEstateMove(DepthScene):
    move: Move = "zoom_in"

    def update(self) -> None:
        s = ease(self.tau)  # 0 -> 1 over clip duration, eased

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
    ("00.jpg", "orbit_right"),   # front exterior
    ("05.jpg", "zoom_in"),       # living room
    ("07.jpg", "orbit_left"),    # kitchen
    ("03.jpg", "zoom_out"),      # rear exterior
]


def main() -> None:
    scene = RealEstateMove(backend="headless")
    scene.ffmpeg.h264(preset="slow")

    for photo, move in CLIPS:
        scene.input(image=PHOTOS / photo)
        scene.state = DepthState()
        scene.move = move
        t0 = time.time()
        scene.main(
            output=OUT / f"{Path(photo).stem}-{move}.mp4",
            time=3, fps=30, width=800, height=600, ssaa=2.0,
        )
        print(f"[timing] {photo} {move}: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
