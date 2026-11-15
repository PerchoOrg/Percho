"""City-film data frames — a city's fundamentals, drawn over its own photos.

Its own module for the same reason `xfade.py` is: `worker.py` cannot be
imported by a test without a full environment, and this is drawing, not I/O.

Why it exists (phase322): the first city film was a reel of places and the
owner's verdict was "看完我对这个城市没有基本的了解 … 可以有可视化的visualization".
Act 1 of a city film is now a handful of these frames — title, history, growth,
schools, getting around, planning — each spoken over by one narration line.
The frame SPECS are written by the web side from `cities.profile`
(`apps/web/lib/cities/film.ts`, schema in `lib/zod/city-profile.ts`); this
file only draws what it is handed.

Drawn with Pillow because this worker's ffmpeg has no drawtext (phase66.1).
Every draw function takes `p`, the animation's progress 0..1, so the same code
gives the still at p=1 and the build-up before it: elements rise in one after
another and bars grow. ffmpeg then lays the sequence over a slow push on the
photo and holds the last frame.

Four frame types, one layout: eyebrow, headline, then the body.

  title — the city's name, a ranking chip, where it is. Photo left sharp.
  rows  — key/value lines: a history timeline, drive times, plans.
  bars  — a bar chart: population by decade.
  stats — one to three big figures with their labels.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FPS = 30
#: The build-up: nothing for the crossfade, then this long to assemble.
HOLD_BEFORE_S = 0.35
BUILD_S = 1.5

WHITE = (255, 255, 255)
AMBER = (240, 169, 75)  # `accentOnCard` in apps/mobile/theme/tokens.ts
INK = (43, 33, 22)
WASH = (20, 15, 10)

SANS_CANDIDATES = (
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
)
SERIF = Path(__file__).resolve().parents[2] / "apps/mobile/assets/fonts/DMSerifDisplay-Regular.ttf"


def _sans(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    path = next((p for p in SANS_CANDIDATES if Path(p).exists()), None)
    if path is None:
        return ImageFont.load_default(size)
    font = ImageFont.truetype(path, size)
    try:
        font.set_variation_by_name(weight)
    except (OSError, ValueError, AttributeError):
        pass  # not a variable font — it is whatever weight the file is
    return font


def _serif(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(SERIF), size) if SERIF.exists() else _sans(size, "Bold")


def _fit(text: str, make, size: int, max_w: float, floor: int) -> ImageFont.FreeTypeFont:
    """The largest font at or under `size` whose `text` fits `max_w`."""
    probe = ImageDraw.Draw(Image.new("L", (8, 8)))
    while size > floor:
        font = make(size)
        if probe.textlength(text, font=font) <= max_w:
            return font
        size -= 4
    return make(floor)


def _wrap(text: str, font: ImageFont.FreeTypeFont, max_w: float, max_lines: int) -> list[str]:
    probe = ImageDraw.Draw(Image.new("L", (8, 8)))
    lines: list[str] = []
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if probe.textlength(trial, font=font) <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" ,;:—-") + "…"
    return lines


def _ease(t: float) -> float:
    """Ease-out cubic, clamped."""
    t = min(1.0, max(0.0, t))
    return 1 - (1 - t) ** 3


def _appear(p: float, order: int, total: int) -> float:
    """When element `order` of `total` has arrived, 0..1, staggered."""
    step = 0.62 / max(1, total)
    return _ease((p - order * step) / 0.38)


class _Canvas:
    """A transparent frame that elements are stamped onto with their own alpha."""

    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def stamp(self, draw_fn, a: float, rise: int = 26) -> None:
        """Draw one element; it fades in and rises `rise` px as `a` goes 0→1."""
        if a <= 0:
            return
        layer = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        draw_fn(ImageDraw.Draw(layer))
        if a < 1:
            alpha = layer.getchannel("A").point(lambda v: round(v * a))
            layer.putalpha(alpha)
            shifted = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
            shifted.paste(layer, (0, round(rise * (1 - a))))
            layer = shifted
        self.img = Image.alpha_composite(self.img, layer)


def _tracked(d: ImageDraw.ImageDraw, xy, text: str, font, fill, track: float) -> None:
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + track


def draw_overlay(frame: dict[str, Any], w: int, h: int, p: float = 1.0) -> Image.Image:
    """The frame's text and chart on a transparent canvas, at progress `p`."""
    c = _Canvas(w, h)
    mx = round(w * 0.085)
    inner = w - 2 * mx
    kind = frame.get("type") or "rows"
    body: list[Any] = (
        frame.get("rows") if kind == "rows"
        else frame.get("bars") if kind == "bars"
        else frame.get("stats") if kind == "stats"
        else []
    ) or []
    parts = 2 + (1 if frame.get("chip") else 0) + (1 if frame.get("sub") else 0) + max(1, len(body))
    order = 0

    # Title sits low, over the photo; everything else starts a quarter down.
    y = round(h * (0.565 if kind == "title" else 0.235))

    eyebrow = (frame.get("eyebrow") or "").upper()
    if eyebrow:
        font = _sans(round(w * 0.030), "Bold")
        c.stamp(lambda d, y=y: _tracked(d, (mx, y), eyebrow, font, AMBER + (255,), w * 0.0045),
                _appear(p, order, parts))
        y += round(w * 0.058)
    order += 1

    headline = frame.get("headline") or ""
    big = round(w * (0.150 if kind == "title" else 0.104))
    hfont = _fit(headline, _serif, big, inner, round(w * 0.035))
    c.stamp(lambda d, y=y: d.text((mx, y), headline, font=hfont, fill=WHITE + (255,)),
            _appear(p, order, parts))
    y += round(hfont.size * (1.30 if kind == "title" else 1.20))
    order += 1

    if frame.get("chip"):
        chip = frame["chip"]
        cfont = _fit(chip, lambda s: _sans(s, "Bold"), round(w * 0.034), inner - w * 0.07, round(w * 0.024))
        pad_x, pad_y = round(w * 0.030), round(w * 0.016)
        tw = ImageDraw.Draw(Image.new("L", (8, 8))).textlength(chip, font=cfont)
        box = (mx, y, mx + tw + 2 * pad_x, y + cfont.size + 2 * pad_y)

        def chip_fn(d, box=box, cfont=cfont, chip=chip):
            d.rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=AMBER + (255,))
            d.text((box[0] + pad_x, box[1] + pad_y - cfont.size * 0.08), chip, font=cfont, fill=INK + (255,))

        c.stamp(chip_fn, _appear(p, order, parts))
        y = box[3] + round(w * 0.030)
        order += 1

    if frame.get("sub"):
        sfont = _sans(round(w * 0.037), "Medium")
        lines = _wrap(frame["sub"], sfont, inner, 2)

        def sub_fn(d, y=y, lines=lines, sfont=sfont):
            for i, line in enumerate(lines):
                d.text((mx, y + i * sfont.size * 1.3), line, font=sfont, fill=WHITE + (222,))

        c.stamp(sub_fn, _appear(p, order, parts))
        y += round(len(lines) * sfont.size * 1.3) + round(w * 0.030)
        order += 1

    y += round(w * 0.020)

    if kind == "rows":
        kfont = _sans(round(w * 0.046), "Bold")
        vfont = _sans(round(w * 0.037), "Regular")
        probe = ImageDraw.Draw(Image.new("L", (8, 8)))
        kcol = min(inner * 0.42, max(probe.textlength(r.get("k", ""), font=kfont) for r in body) + w * 0.035)
        for row in body:
            lines = _wrap(row.get("v", ""), vfont, inner - kcol, 2)
            row_h = max(kfont.size * 1.25, len(lines) * vfont.size * 1.3)

            def row_fn(d, y=y, row=row, lines=lines, w=w):
                d.line((mx, y, mx + inner, y), fill=WHITE + (60,), width=2)
                top = y + round(w * 0.024)
                d.text((mx, top), row.get("k", ""), font=kfont, fill=AMBER + (255,))
                for i, line in enumerate(lines):
                    d.text((mx + kcol, top + kfont.size * 0.12 + i * vfont.size * 1.3), line,
                           font=vfont, fill=WHITE + (240,))

            c.stamp(row_fn, _appear(p, order, parts))
            y += round(row_h + w * 0.050)
            order += 1

    elif kind == "bars":
        chart_h = round(h * 0.30)
        base = y + chart_h + round(w * 0.06)
        top_val = max((b.get("value") or 0) for b in body) or 1
        n = len(body)
        slot = inner / n
        bar_w = min(slot * 0.62, w * 0.17)
        vfont = _sans(round(w * 0.036), "Bold")
        lfont = _sans(round(w * 0.031), "Medium")
        grow = _ease((p - 0.28) / 0.72)

        def axis_fn(d, w=w):
            d.line((mx, base, mx + inner, base), fill=WHITE + (90,), width=2)
            for i, b in enumerate(body):
                cx = mx + slot * (i + 0.5)
                d.text((cx, base + w * 0.018), str(b.get("label", "")), font=lfont,
                       fill=WHITE + (215,), anchor="ma")

        c.stamp(axis_fn, _appear(p, order, parts), rise=0)
        for i, b in enumerate(body):
            cx = mx + slot * (i + 0.5)
            full = chart_h * (b.get("value") or 0) / top_val
            bh = max(4, full * grow)
            # Pale to full amber, so the last bar — where the city is now — carries the eye.
            pale = (1 - i / max(1, n - 1)) * 0.45
            colour = tuple(round(AMBER[k] + (255 - AMBER[k]) * pale) for k in range(3))

            def bar_fn(d, cx=cx, bh=bh, colour=colour, b=b, w=w):
                d.rounded_rectangle((cx - bar_w / 2, base - bh, cx + bar_w / 2, base),
                                    radius=round(w * 0.012), fill=colour + (255,))
                if grow > 0.55:
                    d.text((cx, base - bh - w * 0.014), str(b.get("display", "")), font=vfont,
                           fill=WHITE + (round(255 * _ease((grow - 0.55) / 0.45)),), anchor="md")

            c.stamp(bar_fn, 1.0 if grow > 0 else 0.0, rise=0)
        y = base + round(w * 0.085)

    elif kind == "stats":
        for stat in body:
            value = str(stat.get("value", ""))
            nfont = _fit(value, lambda s: _sans(s, "Heavy"), round(w * 0.150), inner, round(w * 0.07))
            lfont = _sans(round(w * 0.038), "Medium")
            lines = _wrap(stat.get("label", ""), lfont, inner, 2)

            def stat_fn(d, y=y, value=value, nfont=nfont, lines=lines, lfont=lfont):
                d.text((mx, y), value, font=nfont, fill=AMBER + (255,))
                for i, line in enumerate(lines):
                    d.text((mx, y + nfont.size * 1.10 + i * lfont.size * 1.3), line, font=lfont,
                           fill=WHITE + (235,))

            c.stamp(stat_fn, _appear(p, order, parts))
            y += round(nfont.size * 1.10 + len(lines) * lfont.size * 1.3 + w * 0.050)
            order += 1

    if frame.get("source"):
        srcfont = _sans(round(w * 0.026), "Regular")
        text = _wrap(str(frame["source"]), srcfont, inner, 1)[0]
        sy = min(max(y + round(w * 0.01), round(h * 0.80)), round(h * 0.90))
        c.stamp(lambda d: d.text((mx, sy), text, font=srcfont, fill=WHITE + (150,)),
                _ease((p - 0.6) / 0.4), rise=0)

    return c.img


def render_background(photo: Path, w: int, h: int, sharp: bool) -> Image.Image:
    """The photo behind a frame, at 2× the canvas so the slow push stays smooth.

    `sharp` is the title frame: the photo is the picture, and only a gradient
    is laid over it so the name reads. Every other frame is a reading surface —
    the photo is blurred and washed dark and warm, so it is texture, never a
    second look at a place the film shows elsewhere.
    """
    W, H = w * 2, h * 2
    src = Image.open(photo).convert("RGB")
    ratio = max(W / src.width, H / src.height)
    src = src.resize((round(src.width * ratio), round(src.height * ratio)), Image.LANCZOS)
    x, y = (src.width - W) // 2, (src.height - H) // 2
    img = src.crop((x, y, x + W, y + H))
    if sharp:
        shade = Image.new("L", (1, H))
        for row in range(H):
            t = row / H
            # A little at the top for the app's own chrome, heavy under the name.
            a = 0.30 * max(0.0, 1 - t / 0.22) + 0.90 * _ease((t - 0.36) / 0.40)
            shade.putpixel((0, row), round(255 * min(0.92, a)))
        img = Image.composite(Image.new("RGB", (W, H), WASH), img, shade.resize((W, H)))
    else:
        img = img.filter(ImageFilter.GaussianBlur(round(W * 0.012)))
        img = Image.blend(img, Image.new("RGB", (W, H), WASH), 0.66)
    return img


def render_data_clip(
    frame: dict[str, Any],
    photo: Path,
    seconds: float,
    dest: Path,
    workdir: Path,
    w: int,
    h: int,
) -> None:
    """One data frame as an mp4 of `seconds`: slow push on the photo, the
    overlay building up, then holding."""
    workdir.mkdir(parents=True, exist_ok=True)
    bg = workdir / "bg.png"
    render_background(photo, w, h, sharp=frame.get("type") == "title").save(bg)

    hold = round(HOLD_BEFORE_S * FPS)
    build = round(BUILD_S * FPS)
    for i in range(hold + build + 1):
        p = 0.0 if i < hold else (i - hold) / build
        draw_overlay(frame, w, h, p).save(workdir / f"ov_{i:03d}.png")

    frames = max(1, round(seconds * FPS))
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", str(bg),
        "-framerate", str(FPS), "-i", str(workdir / "ov_%03d.png"),
        "-filter_complex",
        (
            f"[0:v]zoompan=z='1+0.045*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={frames}:s={w}x{h}:fps={FPS}[bg];"
            f"[bg][1:v]overlay=0:0:eof_action=repeat:format=auto,format=yuv420p[v]"
        ),
        "-map", "[v]", "-frames:v", str(frames), "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        str(dest),
    ]
    subprocess.run(cmd, check=True, timeout=300)
