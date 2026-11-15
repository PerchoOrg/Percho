"""City-film callouts — one fact, drawn over the picture it belongs to.

Its own module for the same reason `xfade.py` is: `worker.py` cannot be
imported by a test without a full environment, and this is drawing, not I/O.

Why it exists (phase326). The city film's second cut put its figures on frames
of their own — a title, a timeline, a bar chart, each over a blurred photo —
and the owner's verdict was "前半部分感觉在罗列数字 不生动 像ppt". The figures
were the subject. Here they are a caption: the picture stays sharp and full
screen, and a figure arrives over it once the crossfade has finished, says one
thing, and leaves with the clip.

The callout SPECS are written by the web side from `cities.profile`
(`apps/web/lib/cities/film.ts`, schema in `lib/zod/city-profile.ts`); this file
only draws what it is handed. Four kinds:

  title — the city's name, large, and where it is.
  stat  — one figure, what it measures, who says so.
  count — a figure that changed: it counts up beside a small line chart.
  tag   — a place or a date in the top corner; no figure.

Drawn with Pillow because this worker's ffmpeg has no drawtext (phase66.1).
`draw_callout` takes the time since the clip started, so one function gives
both the build-up and the frame that is then held.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

FPS = 30
#: Nothing is drawn until the crossfade into the clip (0.5s) has finished.
ARRIVE_S = 0.55
#: How long one element takes to fade and rise in.
ELEMENT_S = 0.45
#: A counter runs this long at most, and never past the clip it is on.
COUNT_MAX_S = 2.6
COUNT_MIN_S = 1.2
#: What a counter leaves of its clip: its arrival before, a held result after.
COUNT_REST_S = 2.4

WHITE = (255, 255, 255)
AMBER = (240, 169, 75)  # `accentOnCard` in apps/mobile/theme/tokens.ts
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


_PROBE = ImageDraw.Draw(Image.new("L", (8, 8)))


def _fit(text: str, make, size: int, max_w: float, floor: int) -> ImageFont.FreeTypeFont:
    """The largest font at or under `size` whose `text` fits `max_w`."""
    while size > floor:
        font = make(size)
        if _PROBE.textlength(text, font=font) <= max_w:
            return font
        size -= 4
    return make(floor)


def _wrap(text: str, font: ImageFont.FreeTypeFont, max_w: float, max_lines: int) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if _PROBE.textlength(trial, font=font) <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" ,;:—-·") + "…"
    return lines


def _ease(t: float) -> float:
    """Ease-out cubic, clamped."""
    t = min(1.0, max(0.0, t))
    return 1 - (1 - t) ** 3


def _appear(t: float, delay: float = 0.0) -> float:
    """How far in an element is at clip time `t`, 0..1."""
    return _ease((t - ARRIVE_S - delay) / ELEMENT_S)


class _Canvas:
    """A transparent frame that elements are stamped onto with their own alpha."""

    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def stamp(self, draw_fn, a: float, rise: int = 22) -> None:
        """Draw one element; it fades in and rises `rise` px as `a` goes 0→1."""
        if a <= 0:
            return
        layer = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        draw_fn(ImageDraw.Draw(layer))
        if a < 1:
            layer.putalpha(layer.getchannel("A").point(lambda v: round(v * a)))
            shifted = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
            shifted.paste(layer, (0, round(rise * (1 - a))))
            layer = shifted
        self.img = Image.alpha_composite(self.img, layer)


def _tracked(d: ImageDraw.ImageDraw, xy, text: str, font, fill, track: float) -> None:
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + track


def _tracked_width(text: str, font, track: float) -> float:
    return sum(_PROBE.textlength(ch, font=font) + track for ch in text) - track


def count_seconds(clip_seconds: float) -> float:
    """How long a counter runs on a clip of this length."""
    return min(COUNT_MAX_S, max(COUNT_MIN_S, clip_seconds - COUNT_REST_S))


def count_progress(t: float, clip_seconds: float) -> float:
    """How far a counter has run at clip time `t`, 0..1 — slow, fast, slow."""
    p = min(1.0, max(0.0, (t - ARRIVE_S - 0.3) / count_seconds(clip_seconds)))
    return 0.5 - math.cos(math.pi * p) / 2


def anim_seconds(callout: dict[str, Any], clip_seconds: float) -> float:
    """When the callout has finished arriving; the frame after this is held."""
    if callout.get("type") == "count":
        return ARRIVE_S + 0.3 + count_seconds(clip_seconds) + 0.1
    return ARRIVE_S + 0.4 + ELEMENT_S + 0.1


def _scrim(c: _Canvas, a: float) -> None:
    """Darken the lower part of the picture so white type reads on any photo."""
    if a <= 0:
        return
    w, h = c.w, c.h
    column = Image.new("L", (1, h))
    for row in range(h):
        k = _ease((row / h - 0.42) / 0.46)
        column.putpixel((0, row), round(255 * 0.66 * k * a))
    layer = Image.new("RGBA", (w, h), WASH + (0,))
    layer.putalpha(column.resize((w, h)))
    c.img = Image.alpha_composite(c.img, layer)


def _figure_block(c: _Canvas, callout: dict[str, Any], t: float, big_scale: float) -> None:
    """`title` and `stat`: a large figure, a rule, a label and (stat) a source."""
    w, h = c.w, c.h
    mx = round(w * 0.085)
    inner = w - 2 * mx
    big = str(callout.get("big", ""))
    bfont = _fit(big, _serif, round(w * big_scale), inner, round(w * 0.033))
    lfont = _sans(round(w * 0.043), "Semibold")
    lines = _wrap(str(callout.get("label", "")), lfont, inner * 0.92, 2)
    source = str(callout.get("source") or "")
    sfont = _sans(round(w * 0.027), "Regular")

    rule_gap, rule_h = round(w * 0.022), max(4, round(w * 0.006))
    label_h = round(len(lines) * lfont.size * 1.28)
    source_h = round(sfont.size * 1.9) if source else 0
    total = round(bfont.size * 1.12) + rule_gap + rule_h + rule_gap + label_h + source_h
    y = round(h * 0.885) - total

    _scrim(c, _appear(t))
    c.stamp(lambda d: d.text((mx, y), big, font=bfont, fill=WHITE + (255,)), _appear(t))
    y_rule = y + round(bfont.size * 1.12) + rule_gap
    grow = _appear(t, 0.14)
    c.stamp(
        lambda d: d.rounded_rectangle(
            (mx, y_rule, mx + max(rule_h, round(w * 0.13 * grow)), y_rule + rule_h),
            radius=rule_h // 2, fill=AMBER + (255,),
        ),
        1.0 if grow > 0 else 0.0, rise=0,
    )
    y_label = y_rule + rule_h + rule_gap

    def label_fn(d):
        for i, line in enumerate(lines):
            d.text((mx, y_label + i * lfont.size * 1.28), line, font=lfont, fill=WHITE + (245,))

    c.stamp(label_fn, _appear(t, 0.22))
    if source:
        y_source = y_label + label_h + round(sfont.size * 0.5)
        c.stamp(lambda d: d.text((mx, y_source), _wrap(source, sfont, inner, 1)[0], font=sfont,
                                 fill=WHITE + (180,)), _appear(t, 0.36), rise=0)


def _count_block(c: _Canvas, callout: dict[str, Any], t: float, clip_seconds: float) -> None:
    """`count`: a small line chart, the counter under it, then what it counts."""
    w, h = c.w, c.h
    mx = round(w * 0.085)
    pad = round(w * 0.042)
    series = callout.get("series") or []
    lo, hi = float(callout.get("from") or 0), float(callout.get("to") or 0)
    q = count_progress(t, clip_seconds)

    # Sized for the widest value, so the panel does not breathe as it counts.
    widest = f"{round(max(lo, hi)):,}"
    bfont = _fit(widest, _serif, round(w * 0.150), w * 0.62, round(w * 0.07))
    lfont = _sans(round(w * 0.040), "Semibold")
    sfont = _sans(round(w * 0.027), "Regular")
    yfont = _sans(round(w * 0.026), "Medium")
    panel_w = round(w * 0.70)
    inner = panel_w - 2 * pad
    lines = _wrap(str(callout.get("label", "")), lfont, inner, 2)
    source = str(callout.get("source") or "")

    chart_h = round(w * 0.150)
    years_h = round(yfont.size * 1.9)
    big_h = round(bfont.size * 1.24)
    rule_h = max(4, round(w * 0.006))
    label_h = round(len(lines) * lfont.size * 1.28)
    source_h = round(sfont.size * 1.9) if source else 0
    panel_h = pad + chart_h + years_h + big_h + rule_h + round(w * 0.04) + label_h + source_h + pad
    x0, y1 = mx - round(pad * 0.4), round(h * 0.90)
    y0 = y1 - panel_h
    arrive = _appear(t)

    c.stamp(
        lambda d: d.rounded_rectangle((x0, y0, x0 + panel_w, y1), radius=round(w * 0.04),
                                      fill=WASH + (168,), outline=WHITE + (36,), width=2),
        arrive,
    )
    if arrive <= 0:
        return

    # The chart: a line that is drawn as the counter runs, a dot at each census.
    cx0, cx1 = x0 + pad + round(w * 0.02), x0 + panel_w - pad - round(w * 0.02)
    cy1 = y0 + pad + chart_h
    top = max((float(p.get("value") or 0) for p in series), default=1.0) or 1.0
    n = len(series)
    pts = [
        (cx0 + (cx1 - cx0) * (i / max(1, n - 1)), cy1 - chart_h * 0.92 * float(p.get("value") or 0) / top)
        for i, p in enumerate(series)
    ]

    def chart_fn(d):
        reach = q * (n - 1)
        drawn = [pts[0]]
        for i in range(1, n):
            if reach >= i:
                drawn.append(pts[i])
            elif reach > i - 1:
                f = reach - (i - 1)
                drawn.append((pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
                              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f))
        if len(drawn) > 1:
            d.line(drawn, fill=AMBER + (255,), width=max(4, round(w * 0.007)), joint="curve")
        r = round(w * 0.011)
        for i, (px, py) in enumerate(pts):
            if reach >= i - 0.02:
                d.ellipse((px - r, py - r, px + r, py + r), fill=AMBER + (255,))
            d.text((px, cy1 + yfont.size * 0.5), str(series[i].get("label", "")), font=yfont,
                   fill=WHITE + (200,), anchor="ma")

    c.stamp(chart_fn, arrive, rise=0)

    y = cy1 + years_h
    value = f"{round(lo + (hi - lo) * q):,}"
    c.stamp(lambda d: d.text((x0 + pad, y), value, font=bfont, fill=WHITE + (255,)), arrive, rise=0)
    y += big_h
    c.stamp(lambda d: d.rounded_rectangle((x0 + pad, y, x0 + pad + round(w * 0.13), y + rule_h),
                                          radius=rule_h // 2, fill=AMBER + (255,)), arrive, rise=0)
    y += rule_h + round(w * 0.04)

    def label_fn(d, y=y):
        for i, line in enumerate(lines):
            d.text((x0 + pad, y + i * lfont.size * 1.28), line, font=lfont, fill=WHITE + (245,))
        if source:
            d.text((x0 + pad, y + label_h + sfont.size * 0.5), _wrap(source, sfont, inner, 1)[0],
                   font=sfont, fill=WHITE + (180,))

    c.stamp(label_fn, arrive, rise=0)


def _tag_block(c: _Canvas, callout: dict[str, Any], t: float) -> None:
    """`tag`: a small plate in the top corner — where this is, or when."""
    w, h = c.w, c.h
    mx = round(w * 0.085)
    pad_x, pad_y = round(w * 0.030), round(w * 0.024)
    kicker = str(callout.get("kicker", "")).upper()
    text = str(callout.get("text") or "")
    track = w * 0.0035
    kfont = _sans(round(w * 0.029), "Bold")
    tfont = _sans(round(w * 0.037), "Medium")
    max_w = w * 0.72 - 2 * pad_x
    while kfont.size > round(w * 0.020) and _tracked_width(kicker, kfont, track) > max_w:
        kfont = _sans(kfont.size - 2, "Bold")
    lines = _wrap(text, tfont, max_w, 2) if text else []
    body_w = max([_tracked_width(kicker, kfont, track)] + [_PROBE.textlength(l, font=tfont) for l in lines])
    box_w = round(body_w + 2 * pad_x)
    box_h = round(pad_y * 2 + kfont.size * 1.1 + (len(lines) * tfont.size * 1.3 + w * 0.008 if lines else 0))
    x0, y0 = mx - round(pad_x * 0.5), round(h * 0.062)

    def tag_fn(d):
        d.rounded_rectangle((x0, y0, x0 + box_w, y0 + box_h), radius=round(w * 0.028),
                            fill=WASH + (150,), outline=WHITE + (44,), width=2)
        _tracked(d, (x0 + pad_x, y0 + pad_y), kicker, kfont, AMBER + (255,), track)
        for i, line in enumerate(lines):
            d.text((x0 + pad_x, y0 + pad_y + kfont.size * 1.1 + w * 0.008 + i * tfont.size * 1.3),
                   line, font=tfont, fill=WHITE + (245,))

    c.stamp(tag_fn, _appear(t), rise=-14)


def draw_callout(callout: dict[str, Any], w: int, h: int, t: float, clip_seconds: float) -> Image.Image:
    """The callout on a transparent canvas, `t` seconds into its clip."""
    c = _Canvas(w, h)
    kind = callout.get("type")
    if kind == "title":
        _figure_block(c, callout, t, 0.185)
    elif kind == "stat":
        _figure_block(c, callout, t, 0.165)
    elif kind == "count":
        _count_block(c, callout, t, clip_seconds)
    elif kind == "tag":
        _tag_block(c, callout, t)
    return c.img


def _seconds_of(clip: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(clip)],
        capture_output=True, text=True, check=True, timeout=15,
    )
    return float(out.stdout.strip())


def burn_callout(clip: Path, callout: dict[str, Any], dest: Path, workdir: Path, w: int, h: int) -> None:
    """`clip` with `callout` drawn over it, at the canvas size, as `dest`.

    The build-up is a PNG sequence; ffmpeg lays it over the clip and holds its
    last frame to the end, so the callout leaves with the clip's crossfade.
    The clip is scaled and cover-cropped to the canvas first, exactly as the
    assembly would have done — a Seedance clip arrives at 496x864.
    """
    workdir.mkdir(parents=True, exist_ok=True)
    seconds = _seconds_of(clip)
    last = math.ceil(min(seconds, anim_seconds(callout, seconds)) * FPS)
    for i in range(last + 1):
        draw_callout(callout, w, h, i / FPS, seconds).save(workdir / f"ov_{i:03d}.png", compress_level=1)
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", str(clip),
        "-framerate", str(FPS), "-i", str(workdir / "ov_%03d.png"),
        "-filter_complex",
        (
            f"[0:v]fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},setsar=1[bg];"
            f"[bg][1:v]overlay=0:0:eof_action=repeat:format=auto,format=yuv420p[v]"
        ),
        "-map", "[v]", "-an", "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        str(dest),
    ]
    subprocess.run(cmd, check=True, timeout=300)
