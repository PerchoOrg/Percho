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

    # Phase 90 (2026-07-15): fit-within + blur letterbox. Landscape photos
    # (POI thumbnails, exterior shots) keep their full width — we scale to
    # fit inside w×h without cropping and fill the remaining vertical space
    # with a heavily blurred+dimmed copy of the same photo. Portrait photos
    # fit the height and get a blurred left/right (rarely visible in practice).
    #
    # We only apply zoom-in/zoom-out motion here (pan disabled — see
    # pick_mode below). Zoom is center-symmetric so the blur seam stays put
    # instead of sliding across the frame like a dark bar.
    #
    # Phase 86 tried the opposite trade-off (fill-crop, no letterbox) but
    # sacrificed ~44% of every landscape photo's horizontal content, which
    # dining/storefront/wide-angle POI shots cannot afford.
    bg = (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},"
        f"boxblur=40:2,eq=brightness=-0.15:saturation=0.85,setsar=1"
    )
    fg = (
        f"scale={w}:{h}:force_original_aspect_ratio=decrease,setsar=1"
    )
    compose = (
        f"split=2[bgsrc][fgsrc];"
        f"[bgsrc]{bg}[bg];"
        f"[fgsrc]{fg}[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,"
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


def ffprobe_wh(path: str) -> tuple[int, int]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height",
         "-of", "csv=p=0:s=x", path],
        capture_output=True, text=True, check=True,
    )
    w, h = out.stdout.strip().split("x")
    return int(w), int(h)


def fit_inside(src_w: int, src_h: int, box_w: int, box_h: int,
               no_upscale: bool = True) -> tuple[int, int]:
    """Return the largest w×h that fits inside box while preserving aspect.
    If no_upscale=True, never scale >1.0 (keeps native pixels for small photos).
    Rounded to even numbers (yuv420p requirement)."""
    scale = min(box_w / src_w, box_h / src_h)
    if no_upscale:
        scale = min(scale, 1.0)
    fw = int(round(src_w * scale)) & ~1
    fh = int(round(src_h * scale)) & ~1
    return max(fw, 2), max(fh, 2)


def kenburns_filter_v2(mode: str, duration: float, w: int, h: int,
                       fg_w: int, fg_h: int,
                       bbox: list[float] | None = None) -> str:
    """
    Phase 93.1 filter for LISTING videos. Blur-letterbox composition so
    landscape photos keep their FULL width (no crop) at their native
    resolution (no upscale). The bg layer is a heavily blurred cover-fit
    copy of the same photo, filling the vertical canvas.

    Key fix vs Phase 90: bg layer is COMPLETELY STATIC — only the fg layer
    animates on top of it via zoompan. The blurred seam therefore stays
    fixed in the frame instead of sliding with the pan, which is what
    Phase 90 got wrong (it zoompan'd the composited image so both layers
    moved together).

    Modes: push_in, push_in_slow, pull_back (center-zoom fg),
           pan_lr, pan_rl (horizontal fg pan across the blurred bg),
           tilt_td (vertical fg pan),
           push_pan_lr, push_pan_rl (combined),
           pan_to_subject (drift fg's zoom target toward subject bbox),
           static (fg locked, no motion).
    """
    frames = int(duration * FPS)
    fl = max(frames - 1, 1)

    if bbox and len(bbox) == 4 and bbox[2] > 0.01 and bbox[3] > 0.01:
        bx, by, bw, bh = bbox
        subj_cx = max(0.0, min(1.0, bx + bw / 2))
        subj_cy = max(0.0, min(1.0, by + bh / 2))
    else:
        subj_cx, subj_cy = 0.5, 0.5

    x_center = "iw/2-(iw/zoom/2)"
    y_center = "ih/2-(ih/zoom/2)"

    # Gentler motion than the fill-crop v2 draft: we're zoompan'ing the fg
    # (which is a fit-inside scale, so the fg's zoom=1.0 already leaves
    # letterbox around it). Push to 1.10 max keeps most of the photo in view.
    if mode == "push_in":
        z = "min(zoom+0.0007,1.10)"; x = x_center; y = y_center
    elif mode == "push_in_slow":
        z = "min(zoom+0.0005,1.08)"; x = x_center; y = y_center
    elif mode == "pull_back":
        z = "if(lte(zoom,1.0),1.10,max(1.001,zoom-0.0007))"
        x = x_center; y = y_center
    elif mode == "pan_lr":
        z = "1.10"
        x = f"(iw-iw/zoom)*on/{fl}"
        y = y_center
    elif mode == "pan_rl":
        z = "1.10"
        x = f"(iw-iw/zoom)*(1-on/{fl})"
        y = y_center
    elif mode == "push_pan_lr":
        z = f"min(1.0+on/{fl}*0.10,1.10)"
        x = f"(iw-iw/zoom)*on/{fl}"
        y = y_center
    elif mode == "push_pan_rl":
        z = f"min(1.0+on/{fl}*0.10,1.10)"
        x = f"(iw-iw/zoom)*(1-on/{fl})"
        y = y_center
    elif mode == "tilt_td":
        z = "1.10"
        x = x_center
        y = f"(ih-ih/zoom)*on/{fl}"
    elif mode == "pan_to_subject":
        z = f"min(1.0+on/{fl}*0.10,1.10)"
        sx1 = f"clip({subj_cx}*iw-(iw/zoom/2),0,iw-iw/zoom)"
        sy1 = f"clip({subj_cy}*ih-(ih/zoom/2),0,ih-ih/zoom)"
        t = f"(on/{fl})"
        x = f"({x_center})*(1-{t})+({sx1})*{t}"
        y = f"({y_center})*(1-{t})+({sy1})*{t}"
    elif mode == "static":
        z = "1.001"; x = x_center; y = y_center
    else:
        z = "min(zoom+0.0005,1.08)"; x = x_center; y = y_center

    # BG: static, cover-scaled to w×h, blurred and dimmed.
    bg = (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},boxblur=40:2,eq=brightness=-0.15:saturation=0.85,setsar=1"
    )
    # FG: fit-inside so the whole photo stays visible at NATIVE PIXEL SCALE
    # (no upscaling, no cropping). We scale directly to fg_w × fg_h (the
    # aspect-preserving fit-inside dimensions for a w×h box), then zoompan
    # renders motion into that same fg_w × fg_h canvas at 30fps.
    # zoompan's zoom=1.0 shows the full photo; zoom=1.10 shows the middle 90%.
    fg = (
        f"scale={fg_w}:{fg_h}:flags=lanczos,setsar=1,"
        f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={fg_w}x{fg_h}:fps={FPS}"
    )
    # Compose: overlay fg centered over the blurred static bg.
    ox = (w - fg_w) // 2
    oy = (h - fg_h) // 2
    compose = (
        f"split=2[bgsrc][fgsrc];"
        f"[bgsrc]{bg}[bg];"
        f"[fgsrc]{fg}[fg];"
        f"[bg][fg]overlay={ox}:{oy}:format=auto,format=yuv420p"
    )
    return compose


def pick_mode(index: int, zoom_mode: str) -> str:
    if zoom_mode != "auto":
        return zoom_mode
    # Phase 90: only zoom modes in the blur-letterbox composition. Pan modes
    # slide the fg image across the frame, dragging the blurred seam through
    # the center and making it read as a dark bar. Zoom is center-symmetric
    # so the seam stays put on both sides.
    return ["zoom-in", "zoom-out"][index % 2]


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


def v2_caption_filter(text: str, w: int, h: int) -> str:
    """Bottom-left caption for Phase 93 listing videos.
    Semi-transparent black gradient bar + white DejaVu Bold text.
    Text is UTF-8; ffmpeg drawtext requires escaping ':' and '\\'."""
    if not text:
        return ""
    safe = text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    fonts = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    font = next((f for f in fonts if os.path.exists(f)), None)
    if not font:
        return ""
    # Position: 60px from left, 180px from bottom (above where listing overlay
    # would sit if present, but v1 doesn't add that overlay).
    x = 60
    y = h - 260
    box_w = 720
    box_h = 96
    # Semi-transparent black rounded-ish bar + text
    bar = f"drawbox=x={x-24}:y={y-24}:w={box_w}:h={box_h}:color=black@0.55:t=fill"
    txt = (
        f"drawtext=fontfile={font}:text='{safe}':"
        f"fontcolor=white:fontsize=52:x={x}:y={y}:"
        f"shadowcolor=black@0.7:shadowx=2:shadowy=2"
    )
    return f"{bar},{txt}"


def render_clip(src: str, dst: str, duration: float, mode: str, w: int, h: int,
                overlay: dict | None = None,
                caption_png: str | None = None,
                bbox: list[float] | None = None,
                use_v2: bool = False,
                v2_caption: str | None = None) -> None:
    """Render one Ken Burns clip.

    Phase 88: caption is now a pre-rendered transparent PNG overlay produced
    by scripts/caption-render/render.py (HTML → PNG via Playwright). The
    caller passes `caption_png` and we compose it with ffmpeg overlay filter.
    Old drawtext archetype path (P85) is removed.

    Phase 93: `use_v2=True` picks the blur-letterbox+animated-fg v2 filter
    (listings). Default stays on the blur-letterbox v1 (POI bucket videos,
    unchanged). `v2_caption` overlays a lightweight drawtext label
    (Kitchen Island, Master Suite …) on v2 clips only.
    """
    if use_v2:
        src_w, src_h = ffprobe_wh(src)
        fg_w, fg_h = fit_inside(src_w, src_h, w, h, no_upscale=True)
        vf = kenburns_filter_v2(mode, duration, w, h, fg_w, fg_h, bbox=bbox)
        if v2_caption:
            cap_vf = v2_caption_filter(v2_caption, w, h)
            if cap_vf:
                vf = vf + "," + cap_vf
    else:
        vf = kenburns_filter(mode, duration, w, h)
    if overlay:
        vf = vf + "," + listing_overlay_filter(overlay, w, h)

    cmd: list[str] = ["ffmpeg", "-y", "-loop", "1", "-i", src]
    if caption_png:
        cmd += ["-loop", "1", "-i", caption_png]
        # Build filter_complex: [0] kenburns → [bg]; [bg][1] overlay → [v]
        fc = f"[0:v]{vf}[bg];[bg][1:v]overlay=0:0[v]"
        cmd += ["-filter_complex", fc, "-map", "[v]"]
    else:
        cmd += ["-vf", vf]
    cmd += [
        "-t", f"{duration:.3f}",
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
# Phase 88: caption rendering moved out.
# HTML/CSS captions are rendered by scripts/caption-render/render.py into
# transparent 1080x1920 PNGs, then composited via ffmpeg overlay in
# render_clip(). See overlay.html for the design system.
# ---------------------------------------------------------------------------

CAPTION_RENDER_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "caption-render", "render.py"
)


def render_caption_pngs(captions_path: str, out_dir: str,
                        width: int = 1080, height: int = 1920) -> dict[int, str]:
    """Invoke scripts/caption-render/render.py to build per-clip caption PNGs.

    Phase 92.4: pass canvas dimensions so landscape videos (1920x1080) get a
    matching PNG. Previously hard-coded to portrait, causing bottom sheets to
    fall off-canvas in landscape output.

    Returns {clip_index: png_path}. Missing clips (no entry in captions.json)
    are simply absent from the returned dict — render_clip() treats
    caption_png=None as "no overlay".
    """
    os.makedirs(out_dir, exist_ok=True)
    cmd = [
        sys.executable if sys.executable else "python3",
        os.path.abspath(CAPTION_RENDER_SCRIPT),
        "--captions", captions_path,
        "--out-dir", out_dir,
        "--width", str(width),
        "--height", str(height),
    ]
    run(cmd)
    with open(captions_path) as f:
        data = json.load(f)
    out: dict[int, str] = {}
    for c in data.get("clips", []) or []:
        idx = c.get("clip")
        if isinstance(idx, int):
            p = os.path.join(out_dir, f"clip_{idx}.png")
            if os.path.exists(p):
                out[idx] = p
    return out


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
    p.add_argument("--shot-plan", default=None,
                   help="Phase 93: JSON from photo_selector.build_plan(). When set, "
                        "photos are matched by sort_order or filename and per-clip "
                        "duration/mode/bbox come from the plan (overrides "
                        "--duration-per-photo and --zoom-mode).")
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

    # Phase 93: shot plan overrides sequence + per-clip params.
    shot_plan: list[dict] | None = None
    if args.shot_plan:
        with open(args.shot_plan) as f:
            plan_data = json.load(f)
        shot_plan = plan_data.get("plan", plan_data if isinstance(plan_data, list) else []) or []
        # Map available photos by their sort_order prefix (worker writes
        # {sort:03d}_{id}.jpg) OR by filename stem, then reorder per plan.
        by_sort: dict[int, Path] = {}
        by_stem: dict[str, Path] = {}
        for p in photos:
            stem = p.stem
            by_stem[stem] = p
            head = stem.split("_", 1)[0]
            if head.isdigit():
                by_sort[int(head)] = p
        ordered: list[Path] = []
        matched_plan: list[dict] = []
        for shot in shot_plan:
            sort_order = shot.get("sort_order")
            pid = str(shot.get("id") or "")
            match = None
            if sort_order is not None and int(sort_order) in by_sort:
                match = by_sort[int(sort_order)]
            elif pid and pid in by_stem:
                match = by_stem[pid]
            if match is None:
                print(f"[ken-burns] WARN: no photo for plan entry sort={sort_order} id={pid}", file=sys.stderr)
                continue
            ordered.append(match)
            matched_plan.append(shot)
        if not ordered:
            die("shot plan matched zero photos in --photos directory")
        photos = ordered
        shot_plan = matched_plan
        print(f"[ken-burns] shot plan: {len(shot_plan)} clips (v2 filter, listing mode)")

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

    caption_pngs: dict[int, str] = {}
    caption_archetype = args.archetype
    tmp_caption_dir: str | None = None
    if args.captions:
        with open(args.captions) as f:
            captions_data = json.load(f)
        caption_archetype = captions_data.get("archetype", args.archetype)

    print(f"[ken-burns] {len(photos)} photos, {per}s each, {w}x{h}, xfade={xfade}s")

    with tempfile.TemporaryDirectory(prefix="kenburns-") as tmp:
        # Phase 88: pre-render caption PNGs (transparent 1080x1920) via
        # scripts/caption-render/render.py, then overlay them per-clip.
        if args.captions:
            tmp_caption_dir = os.path.join(tmp, "captions")
            print(f"[ken-burns] rendering captions PNGs → {tmp_caption_dir}")
            caption_pngs = render_caption_pngs(args.captions, tmp_caption_dir,
                                                width=w, height=h)

        clips = []
        for i, ph in enumerate(photos):
            if shot_plan:
                shot = shot_plan[i]
                mode = shot["mode"]
                clip_dur = float(shot["duration_s"])
                bbox = shot.get("subject_bbox")
                use_v2 = True
                v2_cap = shot.get("caption") or ""
            else:
                mode = pick_mode(i, args.zoom_mode)
                clip_dur = per
                bbox = None
                use_v2 = False
                v2_cap = ""
            out = os.path.join(tmp, f"clip_{i:03d}.mp4")
            # show_on_clips is 1-indexed by convention
            clip_overlay = listing_overlay if (i + 1) in overlay_clips else None
            clip_cap_png = caption_pngs.get(i + 1)
            tag = f" +overlay" if clip_overlay else ""
            if clip_cap_png:
                tag += f" +cap[{caption_archetype}]"
            print(f"[ken-burns] ({i+1}/{len(photos)}) rendering {ph.name} → {mode} {clip_dur:.2f}s{tag}")
            render_clip(str(ph), out, clip_dur, mode, w, h,
                        overlay=clip_overlay,
                        caption_png=clip_cap_png,
                        bbox=bbox,
                        use_v2=use_v2,
                        v2_caption=v2_cap)
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
