#!/usr/bin/env python3
"""
Ken Burns slideshow generator for Vicinity listings.

Reads a directory of listing photos, generates a vertical (1080x1920) MP4
with alternating pan/zoom effects, crossfade transitions, optional BGM,
and an optional listing-detail ending card.

Dependencies: ffmpeg on PATH. Python stdlib only.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


FPS = 30
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(code)


def run(cmd: list[str], quiet: bool = True) -> None:
    """Run an ffmpeg subprocess, raise on failure."""
    proc = subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL if quiet else None,
        stderr=subprocess.PIPE,
        text=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or "")
        die(f"ffmpeg failed (exit {proc.returncode}) running: {' '.join(cmd[:3])}...")


def ffprobe_duration(path: str) -> float:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def kenburns_filter(mode: str, duration: float, w: int, h: int) -> str:
    """
    Build a Ken Burns zoompan filter for a given mode.

    We upscale the source to a large canvas so zoompan (which works in integer
    pixel steps at output size) has smooth motion. Output is always w x h.
    """
    frames = int(duration * FPS)
    # Upscale factor for smoothness (zoompan jitter mitigation).
    scale_w = w * 4
    scale_h = h * 4
    base = (
        f"scale={scale_w}:{scale_h}:force_original_aspect_ratio=increase,"
        f"crop={scale_w}:{scale_h},setsar=1,"
    )

    if mode == "zoom-in":
        z = "min(zoom+0.0015,1.5)"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif mode == "zoom-out":
        # start zoomed, ease out
        z = f"if(lte(zoom,1.0),1.5,max(1.001,zoom-0.0015))"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif mode == "pan-lr":
        z = "1.25"
        x = f"(iw-iw/zoom)*on/{max(frames-1,1)}"
        y = "(ih-ih/zoom)/2"
    elif mode == "pan-tb":
        z = "1.25"
        x = "(iw-iw/zoom)/2"
        y = f"(ih-ih/zoom)*on/{max(frames-1,1)}"
    else:
        # fallback slow zoom-in
        z = "min(zoom+0.001,1.3)"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"

    zp = (
        f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={w}x{h}:fps={FPS}"
    )
    return base + zp + f",format=yuv420p"


def pick_mode(index: int, zoom_mode: str) -> str:
    if zoom_mode != "auto":
        return zoom_mode
    return ["pan-lr", "zoom-in", "pan-tb", "zoom-out"][index % 4]


def render_clip(src: str, dst: str, duration: float, mode: str, w: int, h: int) -> None:
    vf = kenburns_filter(mode, duration, w, h)
    cmd = [
        "ffmpeg", "-y", "-loop", "1", "-i", src,
        "-t", f"{duration:.3f}",
        "-vf", vf,
        "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-an",
        dst,
    ]
    run(cmd)


def escape_drawtext(s: str) -> str:
    # Escape for ffmpeg drawtext text= value.
    return (
        s.replace("\\", "\\\\")
        .replace(":", r"\:")
        .replace("'", r"\'")
        .replace("%", r"\%")
    )


def render_ending_card(dst: str, card: dict, duration: float, w: int, h: int) -> None:
    """
    Render an ending card: dark radial-ish gradient background + white text lines.
    Uses ffmpeg lavfi color + gradients + drawtext.
    """
    price = card.get("price", "")
    beds = card.get("beds", "")
    baths = card.get("baths", "")
    sqft = card.get("sqft", "")
    address = card.get("address", "")
    agent = card.get("agent_name", "")
    demo_flag = card.get("demo", False)
    wordmark = card.get("wordmark", "")
    cta = card.get("cta", "")
    footer = card.get("footer", "Powered by Vicinity")

    stats = " · ".join(
        [x for x in [
            f"{beds} bed" if beds else "",
            f"{baths} bath" if baths else "",
            f"{sqft} sqft" if sqft else "",
        ] if x]
    )

    # Build dark gradient background using gradients filter.
    # Two-stop vertical gradient: near-black to deep navy.
    bg = (
        f"gradients=size={w}x{h}:c0=0x0a0f1e:c1=0x1a2340:"
        f"x0=0:y0=0:x1={w}:y1={h}:duration={duration}:speed=0.00001"
    )

    # Layout: DEMO banner pinned near the top, footer pinned near the bottom,
    # everything else centered as a tight block around the vertical midpoint.
    # y_expr uses ffmpeg expressions ((h-text_h)/2 or absolute) for placement.
    lines: list[tuple[str, int, str, str]] = []
    # (text, fontsize, y_expr, color) — absolute y coords for a 1920-tall canvas
    if demo_flag:
        lines.append(("DEMO — NOT A REAL LISTING", 36, "80", "0xff8888"))
    if wordmark:
        # Brand header wordmark, bright gold-tan, near top.
        lines.append((wordmark, 64, "280", "0xc9a961"))
    if price:
        lines.append((price, 130, "700", "white"))
    if stats:
        lines.append((stats, 56, "870", "0xd9dde8"))
    if address:
        lines.append((address, 52, "970", "white"))
    if agent:
        lines.append((f"Listed by {agent}", 44, "1060", "0xa9b1c6"))
    if cta:
        arrow_cta = f"→ {cta}" if not cta.lstrip().startswith("→") else cta
        lines.append((arrow_cta, 52, "1500", "0xff6b6b"))
    if footer:
        lines.append((footer, 38, "1830", "0x8892b0"))

    # Try to find a decent font.
    font_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    fontfile = next((f for f in font_candidates if os.path.exists(f)), None)

    draws = []
    for text, size, y_expr, color in lines:
        parts = [
            f"text='{escape_drawtext(text)}'",
            f"fontsize={size}",
            f"fontcolor={color}",
            "x=(w-text_w)/2",
            f"y={y_expr}",
        ]
        if fontfile:
            parts.append(f"fontfile={fontfile}")
        draws.append("drawtext=" + ":".join(parts))

    # Thin divider between DEMO banner and wordmark to visually segment header.
    divider_w = 420
    divider = (
        f"drawbox=x=(iw-{divider_w})/2:y=180:w={divider_w}:h=2:"
        f"color=0x2a3556@1.0:t=fill"
    )
    vf = bg + "," + divider + "," + ",".join(draws) + ",format=yuv420p"

    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i", vf,
        "-t", f"{duration:.3f}",
        "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-an", dst,
    ]
    run(cmd)


def concat_with_crossfade(clips: list[str], dst: str, xfade: float, w: int, h: int) -> float:
    """Concatenate clips with xfade transitions. Returns total duration."""
    if len(clips) == 1:
        shutil.copyfile(clips[0], dst)
        return ffprobe_duration(dst)

    durations = [ffprobe_duration(c) for c in clips]

    # Build filter graph: chain xfade transitions.
    inputs = []
    for c in clips:
        inputs += ["-i", c]

    filter_parts = []
    prev = "0:v"
    offset = 0.0
    for i in range(1, len(clips)):
        offset += durations[i - 1] - xfade
        out_label = f"v{i}"
        filter_parts.append(
            f"[{prev}][{i}:v]xfade=transition=fade:duration={xfade}:offset={offset:.3f}[{out_label}]"
        )
        prev = out_label

    filter_complex = ";".join(filter_parts) if filter_parts else ""

    total = sum(durations) - xfade * (len(clips) - 1)
    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", filter_complex,
        "-map", f"[{prev}]",
        "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        dst,
    ]
    run(cmd)
    return total


def mux_bgm(video_in: str, bgm: str, video_out: str, video_dur: float) -> None:
    """Loop BGM to video length, fade last 2s, mux."""
    fade_start = max(0.0, video_dur - 2.0)
    cmd = [
        "ffmpeg", "-y", "-i", video_in,
        "-stream_loop", "-1", "-i", bgm,
        "-shortest",
        "-t", f"{video_dur:.3f}",
        "-af", f"afade=t=out:st={fade_start:.3f}:d=2,volume=0.55",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "160k",
        "-map", "0:v:0", "-map", "1:a:0",
        video_out,
    ]
    run(cmd)


def parse_resolution(s: str) -> tuple[int, int]:
    try:
        w, h = s.lower().split("x")
        return int(w), int(h)
    except Exception:
        die(f"invalid --resolution {s!r} (expected WxH e.g. 1080x1920)")
        raise  # unreachable


def main() -> None:
    p = argparse.ArgumentParser(description="Ken Burns slideshow generator")
    p.add_argument("--photos", required=True, help="Directory of input photos")
    p.add_argument("--output", required=True, help="Output mp4 path")
    p.add_argument("--duration-per-photo", type=float, default=3.0)
    p.add_argument("--resolution", default="1080x1920")
    p.add_argument("--bgm", default=None, help="Path to background music (mp3/m4a/wav)")
    p.add_argument("--ending-card", default=None,
                   help="Path to JSON with {price,beds,baths,sqft,address,agent_name}")
    p.add_argument("--transition", default="crossfade", choices=["crossfade"])
    p.add_argument("--zoom-mode", default="auto",
                   choices=["auto", "pan-lr", "pan-tb", "zoom-in", "zoom-out"])
    p.add_argument("--xfade-duration", type=float, default=0.5)
    args = p.parse_args()

    if not shutil.which("ffmpeg"):
        die("ffmpeg not found on PATH")
    if not shutil.which("ffprobe"):
        die("ffprobe not found on PATH")

    photos_dir = Path(args.photos)
    if not photos_dir.is_dir():
        die(f"--photos {photos_dir} is not a directory")

    photos = sorted(
        [p for p in photos_dir.iterdir() if p.suffix.lower() in IMAGE_EXTS],
        key=lambda p: p.name,
    )
    if not photos:
        die(f"no .jpg/.jpeg/.png photos found in {photos_dir}")

    w, h = parse_resolution(args.resolution)
    per = float(args.duration_per_photo)
    xfade = min(args.xfade_duration, per / 2 - 0.1)
    if xfade < 0.1:
        xfade = 0.3

    ending = None
    if args.ending_card:
        with open(args.ending_card) as f:
            ending = json.load(f)

    print(f"[ken-burns] {len(photos)} photos, {per}s each, {w}x{h}, xfade={xfade}s")

    with tempfile.TemporaryDirectory(prefix="kenburns-") as tmp:
        clips = []
        for i, ph in enumerate(photos):
            mode = pick_mode(i, args.zoom_mode)
            out = os.path.join(tmp, f"clip_{i:03d}.mp4")
            print(f"[ken-burns] ({i+1}/{len(photos)}) rendering {ph.name} → {mode}")
            render_clip(str(ph), out, per, mode, w, h)
            clips.append(out)

        if ending is not None:
            print("[ken-burns] rendering ending card")
            end_dur = 4.0
            end_out = os.path.join(tmp, f"clip_{len(photos):03d}_end.mp4")
            render_ending_card(end_out, ending, end_dur, w, h)
            clips.append(end_out)

        concat_out = os.path.join(tmp, "concat.mp4")
        print(f"[ken-burns] concatenating {len(clips)} clips with crossfade")
        total_dur = concat_with_crossfade(clips, concat_out, xfade, w, h)

        os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)

        if args.bgm:
            if not os.path.exists(args.bgm):
                die(f"--bgm file not found: {args.bgm}")
            print(f"[ken-burns] muxing BGM {args.bgm}")
            mux_bgm(concat_out, args.bgm, args.output, total_dur)
        else:
            shutil.copyfile(concat_out, args.output)

    final_dur = ffprobe_duration(args.output)
    size_mb = os.path.getsize(args.output) / (1024 * 1024)
    print(f"[ken-burns] done → {args.output}")
    print(f"[ken-burns] duration={final_dur:.2f}s size={size_mb:.2f}MB")


if __name__ == "__main__":
    main()
