#!/usr/bin/env python3
"""
Ken Burns slideshow generator for Percho listings.

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
    Build a Ken Burns filter for a given mode with a "blur letterbox" composition:

      - Background layer: source scaled to cover w×h (crop overflow), heavily
        blurred and dimmed. Fills the vertical canvas without introducing
        black bars for landscape photos.
      - Foreground layer: source scaled to fit inside w×h (aspect preserved,
        no crop). The full photo is always visible, centered.
      - Composite layer: overlay fg on bg, then apply a mild pan/zoom
        (max 1.10x) so most of the photo stays visible throughout the clip.

    This replaces the older "increase + crop" approach that cropped ~60% off
    landscape source photos and revealed only the center at low effective
    resolution. Users complained the resulting videos looked pixelated and
    zoomed-in — now the full image is always in frame.
    """
    frames = int(duration * FPS)
    # Upscale factor for smooth zoompan motion (integer-pixel steps at output size).
    scale_w = w * 4
    scale_h = h * 4

    # Phase 86 (2026-07-15): fill-crop only. The photo is scaled to cover the
    # entire target frame (aspect_ratio=increase + crop=w:h), so pan/zoom moves
    # within a fully-filled canvas — no letterbox, no blur bg, no black edges
    # when pan-lr slides horizontally. Landscape photos lose some left/right
    # content; portrait photos lose some top/bottom. Center-cropped in both
    # cases so the composition's focal area stays visible.
    compose = (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},setsar=1,"
        f"scale={scale_w}:{scale_h}:flags=lanczos,setsar=1"
    )

    # Milder motion than before (max zoom 1.10 instead of 1.5) so most of the
    # composite (and therefore the fully-visible foreground photo) stays in frame.
    if mode == "zoom-in":
        z = "min(zoom+0.0009,1.10)"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif mode == "zoom-out":
        z = f"if(lte(zoom,1.0),1.10,max(1.001,zoom-0.0009))"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif mode == "pan-lr":
        z = "1.08"
        x = f"(iw-iw/zoom)*on/{max(frames-1,1)}"
        y = "(ih-ih/zoom)/2"
    elif mode == "pan-tb":
        z = "1.08"
        x = "(iw-iw/zoom)/2"
        y = f"(ih-ih/zoom)*on/{max(frames-1,1)}"
    else:
        z = "min(zoom+0.0006,1.08)"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"

    zp = (
        f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={w}x{h}:fps={FPS}"
    )
    return compose + "," + zp + f",format=yuv420p"


def pick_mode(index: int, zoom_mode: str) -> str:
    if zoom_mode != "auto":
        return zoom_mode
    return ["pan-lr", "zoom-in", "pan-tb", "zoom-out"][index % 4]


def listing_overlay_filter(overlay: dict, w: int, h: int) -> str:
    """
    Build a filter chain that draws a bottom gradient bar + listing details.
    Approximates a linear alpha gradient (0 at top → 0.65 at bottom) via
    stacked semi-transparent drawboxes, then two columns of drawtext.
    """
    price = overlay.get("price_display", "")
    specs = overlay.get("specs", "")
    address = overlay.get("address", "")
    neighborhood = overlay.get("neighborhood", "")

    bar_h = 150
    bar_top = h - bar_h
    bands = 15
    band_h = bar_h // bands  # 10px

    font_bold_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    font_reg_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    font_bold = next((f for f in font_bold_candidates if os.path.exists(f)), None)
    font_reg = next((f for f in font_reg_candidates if os.path.exists(f)), None)

    parts = []
    for i in range(bands):
        alpha = 0.65 * (i + 1) / bands
        y = bar_top + i * band_h
        parts.append(
            f"drawbox=x=0:y={y}:w={w}:h={band_h}:color=black@{alpha:.3f}:t=fill"
        )

    def _draw(text, size, color, x_expr, y, bold=True):
        if not text:
            return None
        d = [
            f"text='{escape_drawtext(text)}'",
            f"fontsize={size}",
            f"fontcolor={color}",
            f"x={x_expr}",
            f"y={y}",
        ]
        f = font_bold if bold else font_reg
        if f:
            d.append(f"fontfile={f}")
        return "drawtext=" + ":".join(d)

    # Left column
    left_x = 60
    price_y = bar_top + 30
    specs_y = bar_top + 95
    # Right column (right-aligned via w-tw)
    right_pad = 60
    addr_y = bar_top + 42
    hood_y = bar_top + 100

    for d in [
        _draw(price, 48, "white", left_x, price_y, bold=True),
        _draw(specs, 26, "0xd9dde8", left_x, specs_y, bold=False),
        _draw(address, 28, "white", f"w-tw-{right_pad}", addr_y, bold=True),
        _draw(neighborhood, 22, "0xa9b1c6", f"w-tw-{right_pad}", hood_y, bold=False),
    ]:
        if d:
            parts.append(d)

    return ",".join(parts)


def render_clip(src: str, dst: str, duration: float, mode: str, w: int, h: int,
                overlay: dict | None = None,
                caption: dict | None = None,
                archetype: str = "TRUST") -> None:
    vf = kenburns_filter(mode, duration, w, h)
    if overlay:
        vf = vf + "," + listing_overlay_filter(overlay, w, h)
    if caption:
        cap_vf = build_archetype_caption(archetype, caption, w, h)
        if cap_vf:
            vf = vf + "," + cap_vf
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


# ---------------------------------------------------------------------------
# Phase 85: archetype caption renderers.
#
# Each archetype builds a per-clip drawtext filter chain that paints the POI
# name/distance in a distinct visual language. Inputs:
#   caption: {"title": str, "distance": str, "beat": str}  (all optional)
#   w, h:    output frame size (portrait 1080x1920 or landscape 1920x1080)
# Returns: comma-joined ffmpeg filter fragment (no leading comma).
# Empty title → returns "" (no caption rendered on that clip).
# ---------------------------------------------------------------------------

def _fonts():
    bold_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    reg_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    return (
        next((f for f in bold_candidates if os.path.exists(f)), None),
        next((f for f in reg_candidates if os.path.exists(f)), None),
    )


def _dt(text: str, size: int, color: str, x: str, y: str,
        font: str | None, box: bool = False, box_color: str = "black@0.5",
        box_border: int = 20) -> str:
    d = [
        f"text='{escape_drawtext(text)}'",
        f"fontsize={size}",
        f"fontcolor={color}",
        f"x={x}",
        f"y={y}",
    ]
    if font:
        d.append(f"fontfile={font}")
    if box:
        d += [f"box=1", f"boxcolor={box_color}", f"boxborderw={box_border}"]
    return "drawtext=" + ":".join(d)


def _caption_trust(cap: dict, w: int, h: int) -> str:
    """TRUST (schools, healthcare): bottom sheet, institutional feel.
    Full-width dark bar + large name + small distance line."""
    title = (cap.get("title") or "").strip()
    if not title:
        return ""
    dist = (cap.get("distance") or "").strip()
    font_b, font_r = _fonts()
    sheet_h = int(h * 0.14)
    y_top = h - sheet_h
    parts = [f"drawbox=x=0:y={y_top}:w={w}:h={sheet_h}:color=black@0.55:t=fill"]
    parts.append(_dt(title, 54, "white", "(w-tw)/2", f"{y_top + 28}", font_b))
    if dist:
        parts.append(_dt(dist, 30, "0xcfd6e4", "(w-tw)/2", f"{y_top + 100}", font_r))
    return ",".join(parts)


def _caption_lifestyle(cap: dict, w: int, h: int) -> str:
    """LIFESTYLE (dining, fitness): chapter card. Centered warm-tinted card,
    editorial. Title medium, small caps kicker with distance."""
    title = (cap.get("title") or "").strip()
    if not title:
        return ""
    dist = (cap.get("distance") or "").strip()
    font_b, font_r = _fonts()
    card_w = int(w * 0.78)
    card_h = 200
    x0 = (w - card_w) // 2
    y0 = int(h * 0.72)
    parts = [
        f"drawbox=x={x0}:y={y0}:w={card_w}:h={card_h}:color=0xe8b878@0.85:t=fill",
        _dt(title, 52, "0x1a1a1a", "(w-tw)/2", f"{y0 + 60}", font_b),
    ]
    if dist:
        # Bumped from 0x333 (low contrast on amber) to full black
        parts.append(_dt(dist.upper(), 24, "0x0a0a0a", "(w-tw)/2", f"{y0 + 140}", font_r))
    return ",".join(parts)


def _caption_utility(cap: dict, w: int, h: int) -> str:
    """UTILITY (shopping, errands, pets): compact top chip pill.
    Minimal — 'NAME · 0.4 mi' style, doesn't cover main image."""
    title = (cap.get("title") or "").strip()
    if not title:
        return ""
    dist = (cap.get("distance") or "").strip()
    font_b, _ = _fonts()
    text = f"{title} · {dist}" if dist else title
    y0 = 60
    return _dt(text, 34, "white", "(w-tw)/2", str(y0),
               font_b, box=True, box_color="black@0.6", box_border=18)


def _caption_narrative(cap: dict, w: int, h: int) -> str:
    """NARRATIVE (nightlife): full-screen big statement mid-frame.
    Beat text if present, otherwise title. Cinematic. Distance appended below."""
    beat = (cap.get("beat") or "").strip()
    title = (cap.get("title") or "").strip()
    dist = (cap.get("distance") or "").strip()
    text = beat or title
    if not text:
        return ""
    font_b, font_r = _fonts()
    # Bigger, darker band for readability on light-wall backgrounds
    band_h = 260 if dist else 200
    band_y = h // 2 - band_h // 2
    parts = [
        f"drawbox=x=0:y={band_y}:w={w}:h={band_h}:color=black@0.6:t=fill",
        _dt(text, 46, "white", "(w-tw)/2", f"{band_y + 60}", font_b),
    ]
    if dist:
        parts.append(_dt(dist, 30, "0xcfd6e4", "(w-tw)/2",
                         f"{band_y + band_h - 70}", font_r))
    return ",".join(parts)


def _caption_magazine(cap: dict, w: int, h: int) -> str:
    """MAGAZINE (kids, asian_community, faith): editorial masthead.
    Large all-caps title top, thin rule, small kicker with distance."""
    title = (cap.get("title") or "").strip().upper()
    if not title:
        return ""
    dist = (cap.get("distance") or "").strip()
    font_b, font_r = _fonts()
    y0 = int(h * 0.08)
    parts = [
        _dt(title, 44, "white", "(w-tw)/2", str(y0), font_b,
            box=True, box_color="black@0.7", box_border=24),
    ]
    # Thicker, brighter rule beneath (was 2px 0.9)
    parts.append(
        f"drawbox=x={w // 2 - 80}:y={y0 + 100}:w=160:h=4:color=white:t=fill"
    )
    if dist:
        # Boxed for guaranteed contrast — was floating light-gray text over image
        parts.append(_dt(dist, 24, "white", "(w-tw)/2", f"{y0 + 120}", font_r,
                         box=True, box_color="black@0.7", box_border=12))
    return ",".join(parts)


def _caption_map(cap: dict, w: int, h: int) -> str:
    """MAP (outdoor, transit, work_hubs): coordinate/waypoint overlay.
    Top-left pin marker feel with title + distance stacked."""
    title = (cap.get("title") or "").strip()
    if not title:
        return ""
    dist = (cap.get("distance") or "").strip()
    font_b, font_r = _fonts()
    x0 = 60
    y0 = int(h * 0.08)
    # Bigger, brighter red pin dot for legibility
    parts = [
        f"drawbox=x={x0}:y={y0 + 16}:w=22:h=22:color=0xff3b3b@1.0:t=fill",
        _dt(title, 40, "white", f"{x0 + 42}", str(y0),
            font_b, box=True, box_color="black@0.65", box_border=14),
    ]
    if dist:
        # White text on dark pill (was red-on-red — vision caught unreadable)
        parts.append(
            _dt(dist, 26, "white", f"{x0 + 42}", f"{y0 + 74}", font_r,
                box=True, box_color="black@0.65", box_border=10)
        )
    return ",".join(parts)


CAPTION_RENDERERS = {
    "TRUST": _caption_trust,
    "LIFESTYLE": _caption_lifestyle,
    "UTILITY": _caption_utility,
    "NARRATIVE": _caption_narrative,
    "MAGAZINE": _caption_magazine,
    "MAP": _caption_map,
}


def build_archetype_caption(archetype: str, cap: dict, w: int, h: int) -> str:
    renderer = CAPTION_RENDERERS.get(archetype, _caption_trust)
    return renderer(cap, w, h)


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
    wordmark = card.get("wordmark", "")
    cta = card.get("cta", "")
    footer = card.get("footer", "Powered by Percho")

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

    # Layout: footer pinned near the bottom, everything else centered as a tight
    # block around the vertical midpoint. y_expr uses ffmpeg expressions
    # ((h-text_h)/2 or absolute) for placement.
    lines: list[tuple[str, int, str, str]] = []
    # (text, fontsize, y_expr, color) — absolute y coords for a 1920-tall canvas
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

    # Thin divider under the wordmark to visually segment the header.
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
        "-profile:v", "high", "-level", "4.0",
        "-pix_fmt", "yuv420p",
        # Phase 86.1: explicit color metadata so CF Stream transcoder
        # doesn't add safety pillarbox for "unknown color range" inputs.
        "-color_range", "tv",
        "-colorspace", "bt709",
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-movflags", "+faststart",
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
    p.add_argument("--resolution", default=None,
                   help="Explicit output resolution (WxH). Overrides --orientation.")
    p.add_argument("--orientation", default="portrait",
                   choices=["portrait", "landscape"],
                   help="portrait=1080x1920 (default, feed), landscape=1920x1080 (fullscreen)")
    p.add_argument("--bgm", default=None, help="Path to background music (mp3/m4a/wav)")
    p.add_argument("--ending-card", default=None,
                   help="Path to JSON with {price,beds,baths,sqft,address,agent_name}")
    p.add_argument("--listing-overlay", default=None,
                   help="Path to JSON with {price_display,specs,address,neighborhood,show_on_clips}")
    p.add_argument("--transition", default="crossfade", choices=["crossfade"])
    p.add_argument("--zoom-mode", default="auto",
                   choices=["auto", "pan-lr", "pan-tb", "zoom-in", "zoom-out"])
    p.add_argument("--xfade-duration", type=float, default=0.5)
    p.add_argument("--archetype", default="TRUST",
                   choices=["TRUST", "LIFESTYLE", "UTILITY", "NARRATIVE", "MAGAZINE", "MAP"],
                   help="Caption template family (Phase 85). NARRATIVE deferred; "
                        "unknown falls back to TRUST layout.")
    p.add_argument("--captions", default=None,
                   help="Path to JSON with {archetype, clips:[{clip,title,distance,beat}]}. "
                        "clip is 1-indexed. Empty title on a clip → no caption for it.")
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

    if args.resolution:
        w, h = parse_resolution(args.resolution)
    elif args.orientation == "landscape":
        w, h = 1920, 1080
    else:
        w, h = 1080, 1920
    per = float(args.duration_per_photo)
    xfade = min(args.xfade_duration, per / 2 - 0.1)
    if xfade < 0.1:
        xfade = 0.3

    ending = None
    if args.ending_card:
        with open(args.ending_card) as f:
            ending = json.load(f)

    listing_overlay = None
    overlay_clips: set[int] = set()
    if args.listing_overlay:
        with open(args.listing_overlay) as f:
            listing_overlay = json.load(f)
        overlay_clips = set(listing_overlay.get("show_on_clips", []) or [])

    captions_by_clip: dict[int, dict] = {}
    caption_archetype = args.archetype
    if args.captions:
        with open(args.captions) as f:
            captions_data = json.load(f)
        caption_archetype = captions_data.get("archetype", args.archetype)
        for c in captions_data.get("clips", []) or []:
            if isinstance(c.get("clip"), int):
                captions_by_clip[c["clip"]] = c

    print(f"[ken-burns] {len(photos)} photos, {per}s each, {w}x{h}, xfade={xfade}s")

    with tempfile.TemporaryDirectory(prefix="kenburns-") as tmp:
        clips = []
        for i, ph in enumerate(photos):
            mode = pick_mode(i, args.zoom_mode)
            out = os.path.join(tmp, f"clip_{i:03d}.mp4")
            # show_on_clips is 1-indexed by convention
            clip_overlay = listing_overlay if (i + 1) in overlay_clips else None
            clip_caption = captions_by_clip.get(i + 1)
            tag = f" +overlay" if clip_overlay else ""
            if clip_caption and (clip_caption.get("title") or clip_caption.get("beat")):
                tag += f" +cap[{caption_archetype}]"
            print(f"[ken-burns] ({i+1}/{len(photos)}) rendering {ph.name} → {mode}{tag}")
            render_clip(str(ph), out, per, mode, w, h,
                        overlay=clip_overlay,
                        caption=clip_caption,
                        archetype=caption_archetype)
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
