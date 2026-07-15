#!/usr/bin/env python3
"""Render caption overlay PNGs (1080x1920, transparent) from a captions.json file.

Usage:
    render.py --captions <path> --out-dir <dir>

captions.json schema:
    {
      "archetype": "TRUST|LIFESTYLE|UTILITY|NARRATIVE|MAGAZINE|MAP",
      "bucket": "schools",
      "clips": [
        { "clip": 1, "poi": "...", "type": "...", "dist": 2.4, "drive": "6 min",
          "badges": [{"t":"⭐ 9/10","c":"gold"}], "why": "...", "chapter": "...",
          "quote": "...", "section": "...", "title": "...", "credit": "...",
          "mode": "Drive", "time": "6 min" }
      ]
    }

Output: <out-dir>/clip_1.png ... clip_N.png (1080x1920 RGBA, transparent background)
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OVERLAY = HERE / "overlay.html"


def render_all(captions_path: Path, out_dir: Path) -> list[Path]:
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
                viewport={"width": 1080, "height": 1920},
                device_scale_factor=1,
            )
            for i, clip in enumerate(clips, start=1):
                payload = dict(clip)
                payload["archetype"] = archetype
                payload["clip_index"] = i
                payload["total_clips"] = total
                page = ctx.new_page()
                page.add_init_script(f"window.CLIP = {json.dumps(payload)};")
                # transparent background via omit_background=True at screenshot time
                page.goto(OVERLAY.as_uri())
                page.wait_for_function("window.__READY__ === true", timeout=5000)
                out = out_dir / f"clip_{i}.png"
                page.screenshot(path=str(out), omit_background=True, full_page=False,
                                clip={"x": 0, "y": 0, "width": 1080, "height": 1920})
                page.close()
                written.append(out)
        finally:
            browser.close()
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--captions", required=True)
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()
    written = render_all(Path(args.captions), Path(args.out_dir))
    for p in written:
        print(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
