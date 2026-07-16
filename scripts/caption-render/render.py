#!/usr/bin/env python3
"""Render caption overlay PNGs (transparent) from a captions.json file.

Usage:
    render.py --captions <path> --out-dir <dir> [--width 1080] [--height 1920]

Phase 92.4 (2026-07-15): caption PNG dimensions are now parameterised so the
overlay matches the video canvas. Previously hard-coded to 1080x1920 which
worked for portrait output; landscape videos (1920x1080) got a portrait PNG
composited at (0,0) via ffmpeg — bottom sheets fell off-canvas, users saw
"schools video has only photos, no template" (2026-07-15 bug report).
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OVERLAY = HERE / "overlay.html"


def render_all(captions_path: Path, out_dir: Path,
               width: int = 1080, height: int = 1920) -> list[Path]:
    data = json.loads(captions_path.read_text())
    archetype = data["archetype"]
    clips = data["clips"]
    total = len(clips)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        try:
            ctx = browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
            )
            for i, clip in enumerate(clips, start=1):
                payload = dict(clip)
                payload["archetype"] = archetype
                payload["clip_index"] = i
                payload["total_clips"] = total
                payload["canvas_w"] = width
                payload["canvas_h"] = height
                page = ctx.new_page()
                page.add_init_script(f"window.CLIP = {json.dumps(payload)};")
                # transparent background via omit_background=True at screenshot time
                page.goto(OVERLAY.as_uri())
                page.wait_for_function("window.__READY__ === true", timeout=5000)
                out = out_dir / f"clip_{i}.png"
                page.screenshot(path=str(out), omit_background=True, full_page=False,
                                clip={"x": 0, "y": 0, "width": width, "height": height})
                page.close()
                written.append(out)
        finally:
            browser.close()
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--captions", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--width", type=int, default=1080,
                    help="Caption canvas width in px (must match video output).")
    ap.add_argument("--height", type=int, default=1920,
                    help="Caption canvas height in px (must match video output).")
    args = ap.parse_args()
    written = render_all(Path(args.captions), Path(args.out_dir),
                         width=args.width, height=args.height)
    for p in written:
        print(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
