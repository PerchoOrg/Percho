"""Render a whole listing as one video: every photo gets a 3s camera move,
alternating orbit and zoom, concatenated in listing order.

Usage:
  .venv-motion/bin/python scripts/prototypes/photo-motion/render_listing.py \
      <photo-dir> --variant sliced --amplitude 0.35 --out listing-sliced.mp4
"""

import argparse
import subprocess
from pathlib import Path

from depth_infer import load_depth
from layered_render import MOVES, OUT, build_layers, flat_layer, render

# Orbit / zoom alternate so consecutive clips don't feel like the same move.
CHOREOGRAPHY = ["orbit_right", "zoom_in", "orbit_left", "zoom_out"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo_dir", type=Path)
    ap.add_argument("--variant", choices=("flat", "sliced"), default="sliced")
    ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--amplitude", type=float, default=0.35)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    photos = sorted(args.photo_dir.glob("*.jpg"))
    clips_dir = OUT / f"listing-{args.variant}-a{args.amplitude:g}"
    clips = []
    for i, photo in enumerate(photos):
        move = CHOREOGRAPHY[i % len(CHOREOGRAPHY)]
        assert move in MOVES
        depth = load_depth(photo)
        layers = (
            flat_layer(photo, depth)
            if args.variant == "flat"
            else build_layers(photo, depth, args.layers)
        )
        clip = clips_dir / f"{i:02d}-{photo.stem}-{move}.mp4"
        render(layers, clip, move, args.amplitude)
        clips.append(clip)

    listing = "\n".join(f"file '{c.resolve()}'" for c in clips)
    concat_file = clips_dir / "concat.txt"
    concat_file.write_text(listing + "\n")
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat",
         "-safe", "0", "-i", str(concat_file), "-c", "copy",
         "-movflags", "+faststart", str(OUT / args.out)],
        check=True,
    )
    print(f"[done] {OUT / args.out} ({len(clips)} clips)")


if __name__ == "__main__":
    main()
