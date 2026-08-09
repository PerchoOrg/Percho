"""Render every Ken Burns mode and every DepthFlow move on the same photo, so
the two engines can be compared shot for shot.

Ken Burns clips go through the production renderer (generate.render_clip with
use_v2, the path a real listing takes). DepthFlow clips use the same portrait
canvas and blur-letterbox composition, so the only variable is the motion.

Usage:
  .venv-depthflow/bin/python scripts/prototypes/photo-motion/effects_catalog.py \
      <photo.jpg> --label exterior
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from attrs import define
from depthflow.scene import DepthScene, DepthState
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "ken-burns"))
import generate as kb  # noqa: E402

from depthflow_listing import to_canvas  # noqa: E402

OUT = Path(__file__).parent / "out"
W, H = 1080, 1920
CLIP_W, CLIP_H = 1080, 810
SECONDS = 3

# Every mode kenburns_filter_v2 implements — the production set.
KB_MODES = [
    "push_in", "push_in_slow", "pull_back", "pan_lr", "pan_rl",
    "push_pan_lr", "push_pan_rl", "tilt_td", "pan_to_subject", "static",
]

# The four from the original prototype, plus five built from DepthState knobs
# the prototype never touched.
DF_MODES = [
    "orbit_right", "orbit_left", "zoom_in", "zoom_out",
    "tilt_parallax", "orbit_to_subject", "dolly_in", "parallax_bloom",
    "rack_focus",
]

# Centre of the subject, normalised. Stands in for photo_tagger's bbox so
# pan_to_subject / orbit_to_subject have something to aim at.
SUBJECT = (0.72, 0.62)


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


@define
class CatalogMove(DepthScene):
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
            # Vertical parallax — the depth-aware answer to tilt_td.
            st.focus = 0.30
            st.zoom = 0.94
            st.isometric = 0.60
            st.offset = (0.0, 0.50 * s - 0.25)

        elif self.move == "orbit_to_subject":
            # Camera drifts to sit above the subject while orbiting past it.
            st.focus = 0.30
            st.zoom = 0.94
            st.isometric = 0.60
            st.offset = (0.50 * s - 0.25, 0.0)
            st.center = ((SUBJECT[0] - 0.5) * 2.0 * s, (0.5 - SUBJECT[1]) * 2.0 * s)

        elif self.move == "dolly_in":
            # Ray origins actually move forward, unlike a crop zoom.
            st.isometric = 0.40
            st.dolly = 0.60 * s
            st.zoom = 1.0 - 0.06 * s

        elif self.move == "parallax_bloom":
            # Depth opens up over the clip. No Ken Burns equivalent.
            st.isometric = 0.50
            st.zoom = 0.96
            st.height = 0.05 + 0.35 * s
            st.offset = (0.12 * s, 0.0)

        elif self.move == "rack_focus":
            # Depth-of-field sweep from background to foreground.
            st.isometric = 0.40
            st.zoom = 0.97
            st.offset = (0.10 * s, 0.0)
            # intensity is a 0-100 scale (the shader divides by 100). 25 already
            # smears the whole facade; a listing still has to be legible, so
            # this stays subtle and only touches the far band.
            st.blur.intensity = 14.0 * s
            st.blur.start = 0.50
            st.blur.end = 0.95


def label_png(text: str, sub: str, dst: Path) -> None:
    img = Image.new("RGBA", (W, 150), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 150], fill=(0, 0, 0, 170))
    try:
        big = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 54)
        small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 34)
    except OSError:
        big = small = ImageFont.load_default()
    d.text((40, 26), text, font=big, fill=(255, 255, 255, 255))
    d.text((40, 92), sub, font=small, fill=(180, 190, 200, 255))
    img.save(dst)


def stamp(clip: Path, png: Path, dst: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", str(clip), "-i", str(png),
         "-filter_complex", "[0:v][1:v]overlay=0:0",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", str(dst)],
        check=True,
    )


def concat(clips: list[Path], dst: Path) -> None:
    lst = dst.parent / f"{dst.stem}-concat.txt"
    lst.write_text("".join(f"file '{c.resolve()}'\n" for c in clips))
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat",
         "-safe", "0", "-i", str(lst), "-c", "copy",
         "-movflags", "+faststart", str(dst)],
        check=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo", type=Path)
    ap.add_argument("--label", required=True, help="Short name used in output filenames")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="effects-catalog-"))
    bbox = [SUBJECT[0] - 0.1, SUBJECT[1] - 0.1, 0.2, 0.2]

    kb_clips = []
    for mode in KB_MODES:
        raw = work / f"kb-{mode}.mp4"
        kb.render_clip(str(args.photo), str(raw), SECONDS, mode, W, H,
                       bbox=bbox, use_v2=True)
        png = work / f"kb-{mode}.png"
        label_png(f"Ken Burns — {mode}", "ffmpeg zoompan, no depth", png)
        stamped = work / f"kb-{mode}-l.mp4"
        stamp(raw, png, stamped)
        kb_clips.append(stamped)
        print(f"[kb] {mode}")
    concat(kb_clips, OUT / f"catalog-kenburns-{args.label}.mp4")

    scene = CatalogMove(backend="headless")
    scene.ffmpeg.h264(preset="slow")
    df_clips = []
    for mode in DF_MODES:
        raw = work / f"df-{mode}-raw.mp4"
        scene.input(image=args.photo)
        scene.state = DepthState()
        scene.move = mode
        scene.main(output=raw, time=SECONDS, fps=kb.FPS,
                   width=CLIP_W, height=CLIP_H, ssaa=2.0)
        composed = work / f"df-{mode}.mp4"
        to_canvas(raw, composed)
        png = work / f"df-{mode}.png"
        label_png(f"DepthFlow — {mode}", "2.5D parallax, DA2-Small depth", png)
        stamped = work / f"df-{mode}-l.mp4"
        stamp(composed, png, stamped)
        df_clips.append(stamped)
        print(f"[df] {mode}")
    concat(df_clips, OUT / f"catalog-depthflow-{args.label}.mp4")

    print(f"[done] {OUT}/catalog-{{kenburns,depthflow}}-{args.label}.mp4")


if __name__ == "__main__":
    main()
