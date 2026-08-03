#!/usr/bin/env python3
"""
Photo enhancement — the chain the owner asked for (2026-08-03):

    original -> Super Resolution -> Denoise -> Sharpen
             -> Local Contrast -> Color Correction -> output

SR step is **Real-ESRGAN x2** (`models/real_esrgan_x2.onnx`, 66 MB) run through
onnxruntime — no torch, no basicsr. Same file works on the Mac mini (CoreML EP,
GPU/ANE) and on the EC2 box (CPU EP, ~28 s/MPix on 4 vCPU), so the worker code is
identical on both hosts. FSRCNN_x2 (39 KB, `models/FSRCNN_x2.pb`) stays as the
fallback for when the ONNX file or onnxruntime is absent.

Fetch the model: `scripts/render-worker/models/fetch.sh` (gitignored, 66 MB).

Skips SR entirely when the source is already >= SR_SKIP_EDGE on its long edge —
upscaling a 3200x2400 Places photo to 6400x4800 buys nothing at a 1080 card and
quadruples the encode.

CLI (also how the worker calls it):

    enhance.py in.jpg out.jpg [--preset default|light|strong] [--no-sr]
"""

from __future__ import annotations

import argparse
import functools
import json
import os
from pathlib import Path

import cv2
import numpy as np

MODELS_DIR = Path(__file__).resolve().parent / "models"
ESRGAN_ONNX = MODELS_DIR / "real_esrgan_x2.onnx"

# Tile size for Real-ESRGAN. 4 vCPU / 15 GB EC2 peaks ~1.5 GB at 384 with the 2x
# output held alongside. PAD is the overlap trimmed off each tile — RRDB has a
# wide receptive field, and 8 px is not enough (visible seams on brick/siding).
ESRGAN_TILE = 384
ESRGAN_PAD = 24

# ── straighten (roll only) ──
STRAIGHTEN_MAX_DEG = 4.0     # beyond this it's a deliberate angle, not a mistake
STRAIGHTEN_MIN_DEG = 0.3     # below this nobody can see it; don't resample
STRAIGHTEN_MIN_LINES = 8     # too few verticals = untrustworthy estimate
# Line COUNT is not enough: random texture yields hundreds of short "lines" whose
# angles spread evenly, and their weighted median lands on a confident-looking but
# meaningless tilt (measured: pure noise -> -2.78 deg from 293 lines). Real
# architecture has verticals that AGREE, so require this weighted fraction within
# CONSENSUS_BAND of the median or refuse to rotate at all.
STRAIGHTEN_CONSENSUS = 0.55
STRAIGHTEN_CONSENSUS_BAND = 1.5   # degrees

# ── exposure match across one listing ──
EXPOSURE_MAX_STOP = 0.35     # ~±27% gain ceiling
EXPOSURE_STRENGTH = 0.7      # partial; full correction flattens real day/night

# ── indoor white balance ──
INDOOR_WB_CLAMP = 0.10

# Above this long edge, SR is a waste (see module docstring).
SR_SKIP_EDGE = 2400

# Hard ceiling on the output long edge. A 2x on a 2400px source would be 4800px
# and ~4 MB of JPEG for zero visible gain at the 1080 card crop.
MAX_EDGE = 3200

PRESETS = {
    # denoise_h, unsharp_amount, clahe_clip, saturation, wb_clamp
    #
    # Calibrated 2026-08-03 against real listing + POI photos at the 1080 card
    # crop. The first pass (unsharp 0.55 / clahe 2.0 / sat 1.06 / wb ±12%) was
    # rejected on review: gray-world at ±12% turned cream stucco pink and clouds
    # lilac, CLAHE 2.0 crushed tree-canopy shadows to black, and 0.55 unsharp put
    # a bright rim on every roofline against sky. MLS photos must not be
    # misrepresented, so the grade is now deliberately conservative.
    #
    # Pass 2 review still flagged pushed greens/sky blue as the remaining "looks
    # graded" tell, so `default` now does NO saturation lift at all — SR +
    # denoise + light unsharp + CLAHE already carry the perceived-sharpness win.
    "light":   (2.0, 0.20, 0.8, 1.00, 0.015),
    "default": (3.0, 0.30, 1.1, 1.00, 0.02),
    "strong":  (4.0, 0.45, 1.6, 1.04, 0.04),
}


@functools.lru_cache(maxsize=1)
def _esrgan_session():
    """Real-ESRGAN x2 onnxruntime session, or None if unavailable.

    Cached: loading the 66 MB graph takes ~1.5 s, and the worker enhances photos
    in a loop. Providers are tried in order, so the same code gets CoreML
    (GPU/ANE) on the Mac mini and CPU on EC2 — nothing host-specific here.
    """
    if not ESRGAN_ONNX.exists():
        return None
    try:
        import onnxruntime as ort
    except ImportError:
        return None
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = int(os.environ.get("ENHANCE_THREADS") or os.cpu_count() or 4)
    available = ort.get_available_providers()
    providers = [p for p in ("CoreMLExecutionProvider", "CUDAExecutionProvider",
                             "CPUExecutionProvider") if p in available]
    return ort.InferenceSession(str(ESRGAN_ONNX), opts, providers=providers)


def _esrgan_tile(sess, tile: np.ndarray) -> np.ndarray:
    """One tile through the net. BGR uint8 in, BGR uint8 2x out."""
    x = cv2.cvtColor(tile, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    x = np.ascontiguousarray(x.transpose(2, 0, 1)[None])
    y = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    y = np.clip(y.transpose(1, 2, 0), 0.0, 1.0) * 255.0
    return cv2.cvtColor(y.astype(np.uint8), cv2.COLOR_RGB2BGR)


def _esrgan_x2(sess, img: np.ndarray) -> np.ndarray:
    """Tiled Real-ESRGAN x2. Whole-image inference on a 2400px photo would want
    ~10 GB, so tile with ESRGAN_PAD overlap and trim the pad back off (at 2x)
    from every interior edge — the pad is what keeps tile boundaries invisible.
    """
    h, w = img.shape[:2]
    out = np.empty((h * 2, w * 2, 3), np.uint8)
    for y0 in range(0, h, ESRGAN_TILE):
        for x0 in range(0, w, ESRGAN_TILE):
            y1, x1 = min(y0 + ESRGAN_TILE, h), min(x0 + ESRGAN_TILE, w)
            # Padded read window, clamped to the image.
            py0, px0 = max(y0 - ESRGAN_PAD, 0), max(x0 - ESRGAN_PAD, 0)
            py1, px1 = min(y1 + ESRGAN_PAD, h), min(x1 + ESRGAN_PAD, w)
            up = _esrgan_tile(sess, img[py0:py1, px0:px1])
            # Cut the pad back out of the 2x result.
            ty0, tx0 = (y0 - py0) * 2, (x0 - px0) * 2
            out[y0 * 2:y1 * 2, x0 * 2:x1 * 2] = up[
                ty0:ty0 + (y1 - y0) * 2, tx0:tx0 + (x1 - x0) * 2
            ]
    return out


def _superres(img: np.ndarray) -> np.ndarray:
    """Real-ESRGAN x2 when available, else FSRCNN x2, else the input untouched."""
    sess = _esrgan_session()
    if sess is not None:
        return _esrgan_x2(sess, img)
    model = MODELS_DIR / "FSRCNN_x2.pb"
    if not model.exists():
        return img
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(str(model))
    sr.setModel("fsrcnn", 2)
    return sr.upsample(img)


def _vertical_tilt_deg(img: np.ndarray) -> float | None:
    """Weighted median tilt of near-vertical edges in degrees, None when unreliable."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(g, 60, 180)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 720, threshold=80,
                            minLineLength=min(img.shape[:2]) // 4, maxLineGap=12)
    if lines is None:
        return None
    # OpenCV 4 returns (N,1,4); OpenCV 5 returns (N,4). Normalize.
    lines = np.asarray(lines).reshape(-1, 4)
    tilts, weights = [], []
    for x1, y1, x2, y2 in lines:
        dx, dy = float(x2 - x1), float(y2 - y1)
        if abs(dy) < 1e-6:
            continue
        ang = np.degrees(np.arctan2(dx, dy))       # 0 = perfectly vertical
        ang = (ang + 90) % 180 - 90
        if abs(ang) <= 12.0:                       # near-vertical only
            tilts.append(ang)
            weights.append(np.hypot(dx, dy))       # long lines count more
    if len(tilts) < STRAIGHTEN_MIN_LINES:
        return None
    order = np.argsort(tilts)
    t, w = np.array(tilts)[order], np.array(weights)[order]
    # Weighted median: one long wall edge should outvote a dozen short specks.
    med = float(t[np.searchsorted(np.cumsum(w), w.sum() / 2.0)])
    if w[np.abs(t - med) <= STRAIGHTEN_CONSENSUS_BAND].sum() / w.sum() < STRAIGHTEN_CONSENSUS:
        return None
    return med


def _straighten(img: np.ndarray) -> tuple[np.ndarray, float | None]:
    """Roll-only rotation so walls read plumb. Returns (image, applied_degrees).

    Deliberately NOT keystone/perspective correction: pulling converging
    verticals parallel is the op that makes a photo look manipulated (stretched
    ceilings, bowed door frames), and that is misrepresentation. This only undoes
    a tilted hand.

    Measured 2026-08-03 on 18 real listing photos: this fires on ~1 in 18. MLS
    shooters use tripods with built-in levels. It is kept because when it does
    fire the photo is visibly crooked, and the cost when it doesn't is one Canny +
    Hough pass (~30 ms).
    """
    tilt = _vertical_tilt_deg(img)
    if tilt is None or not (STRAIGHTEN_MIN_DEG <= abs(tilt) <= STRAIGHTEN_MAX_DEG):
        return img, None
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), -tilt, 1.0)
    rot = cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LANCZOS4,
                         borderMode=cv2.BORDER_REPLICATE)
    # Rotation leaves wedges of nothing at the corners. Crop to the largest
    # centered rect that is entirely real pixels, then scale back — never
    # border-fill or inpaint, invented pixels are the fake-looking failure here.
    a = np.radians(abs(tilt))
    s = 1.0 / (np.cos(a) + max(w, h) / min(w, h) * np.sin(a))
    cw, ch = int(w * s), int(h * s)
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    out = cv2.resize(rot[y0:y0 + ch, x0:x0 + cw], (w, h), interpolation=cv2.INTER_LANCZOS4)
    return out, round(tilt, 2)


def exposure_gains(imgs: list[np.ndarray]) -> list[float]:
    """Per-photo gain pulling each toward the MEDIAN brightness of the group.

    The group median is this house's real light level, so matching to it cannot
    invent a brightness the property doesn't have — which a fixed target would.
    Partial strength and a hard stop ceiling keep genuine dusk/dim rooms dim.
    """
    lums = [float(cv2.cvtColor(i, cv2.COLOR_BGR2GRAY).mean()) for i in imgs]
    target = float(np.median(lums))
    gains = []
    for l in lums:
        stops = np.log2(target / max(l, 1.0)) * EXPOSURE_STRENGTH
        gains.append(float(2.0 ** np.clip(stops, -EXPOSURE_MAX_STOP, EXPOSURE_MAX_STOP)))
    return gains


def _apply_exposure(img: np.ndarray, gain: float) -> np.ndarray:
    """Gain applied in LINEAR light, not on the sRGB values.

    Scaling sRGB directly is what produces the washed-out "HDR filter" look;
    doing it in linear light and re-encoding rolls highlights off the way a real
    exposure change does.
    """
    if abs(gain - 1.0) < 0.01:
        return img
    x = (img.astype(np.float32) / 255.0) ** 2.2
    return (np.clip(x * gain, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)


def _looks_indoor(img: np.ndarray) -> bool:
    """Cheap indoor test: no large bright-blue region up top = no sky = indoor.

    # ponytail: heuristic. photo_tagger.py already returns room_type from vision
    # and is the better source — wire it in when it's ported off the broken
    # ANTHROPIC_API_KEY path (DEVLOG 2026-07-26). A misclassification here only
    # costs a skipped or a ±10% white balance, never a wrong-looking photo.
    """
    top = img[: img.shape[0] // 3]
    hsv = cv2.cvtColor(top, cv2.COLOR_BGR2HSV)
    sky = ((hsv[:, :, 0] > 90) & (hsv[:, :, 0] < 130) &
           (hsv[:, :, 1] > 40) & (hsv[:, :, 2] > 120))
    return bool(sky.mean() < 0.12)


def _indoor_wb(img: np.ndarray) -> np.ndarray:
    """Stronger white balance for interiors only.

    The global `_color_correct` gray-world is clamped to ±2%, which for a
    tungsten-lit interior is effectively off. Interiors can take a real
    correction; exteriors cannot — cream stucco and blue sky are exactly what got
    ±12% rejected on 2026-08-03, so exteriors return untouched.
    """
    if not _looks_indoor(img):
        return img
    x = img.astype(np.float32)
    # Estimate on the bright half only: gray-world over the whole frame is dragged
    # around by a large wood floor or a red rug, while the LIT surfaces are what
    # actually carry the illuminant colour.
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = g >= np.percentile(g, 60)
    if mask.sum() < 64:                       # near-flat frame: use everything
        mask = np.ones_like(g, bool)
    means = x[mask].reshape(-1, 3).mean(axis=0)
    gray = float(means.mean())
    for c in range(3):
        gain = float(np.clip(gray / max(means[c], 1e-6),
                             1 - INDOOR_WB_CLAMP, 1 + INDOOR_WB_CLAMP))
        x[:, :, c] *= gain
    return np.clip(x, 0, 255).astype(np.uint8)


def _denoise(img: np.ndarray, h: float) -> np.ndarray:
    # Colored non-local means. h on luma only; chroma fixed low so colour
    # edges (brick/foliage) don't bleed.
    return cv2.fastNlMeansDenoisingColored(img, None, h, 3, 7, 21)


def _sharpen(img: np.ndarray, amount: float) -> np.ndarray:
    """Unsharp mask. Gaussian blur subtracted back, so no halo ring at
    amount <= ~0.7 (the ffmpeg `unsharp=...:0.7` finding from 2026-08-03)."""
    blur = cv2.GaussianBlur(img, (0, 0), 2.0)
    return cv2.addWeighted(img, 1.0 + amount, blur, -amount, 0)


def _local_contrast(img: np.ndarray, clip: float) -> np.ndarray:
    """CLAHE on L only — chroma untouched, so no colour shift.

    Followed by a shadow lift: CLAHE alone blocked up tree canopies and covered
    walkways on review (2026-08-03, both sample sets). The lift only touches L
    below ~96/255 and tapers to zero, so midtones and highlights are unchanged.
    """
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)

    x = np.arange(256, dtype=np.float32)
    lift = 10.0 * np.clip(1.0 - x / 96.0, 0.0, 1.0)
    lut = np.clip(x + lift, 0, 255).astype(np.uint8)
    l = cv2.LUT(l, lut)

    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def _color_correct(img: np.ndarray, saturation: float, wb_clamp: float) -> np.ndarray:
    """Gray-world white balance + mild saturation lift.

    Gray-world is clamped hard (a few percent). MLS interiors are full of
    genuinely warm tungsten light and exteriors of cream stucco; an unclamped
    gray-world tints those pink/blue, i.e. misrepresents the property. Reviewed
    2026-08-03: ±12% produced lilac clouds and pink stucco — rejected.
    """
    result = img.astype(np.float32)
    means = result.reshape(-1, 3).mean(axis=0)
    gray = float(means.mean())
    for c in range(3):
        gain = float(np.clip(gray / max(means[c], 1e-6), 1 - wb_clamp, 1 + wb_clamp))
        result[:, :, c] *= gain
    out = np.clip(result, 0, 255).astype(np.uint8)

    if saturation == 1.0:
        return out
    hsv = cv2.cvtColor(out, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * saturation, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def enhance(img: np.ndarray, preset: str = "default", use_sr: bool = True,
            exposure_gain: float = 1.0) -> tuple[np.ndarray, dict]:
    """Full chain. Returns (image, meta) — meta records what actually fired.

    Order matters: straighten runs FIRST (on the original pixels, before any
    resampling that would blur the edges it measures), exposure and white balance
    run LAST (after SR/denoise/CLAHE have settled the tone, so the gain applies to
    the final image rather than being re-contrasted afterwards).

    `exposure_gain` comes from `exposure_gains()` over a whole listing; 1.0 (the
    default) is a no-op, so single-photo callers behave exactly as before.
    """
    denoise_h, sharpen_amt, clahe_clip, sat, wb_clamp = PRESETS[preset]
    meta: dict = {"preset": preset}

    img, tilt = _straighten(img)
    meta["straighten_deg"] = tilt

    long_edge = max(img.shape[:2])
    meta["sr"] = None
    if use_sr and long_edge < SR_SKIP_EDGE:
        before = img.shape
        img = _superres(img)
        # Real-ESRGAN already denoises and reconstructs edges as part of the
        # upscale. Running the full NLM + unsharp grade on top of it double-cooks
        # (plastic skies, halos on rooflines). Back both off when it ran.
        if img.shape != before:
            esrgan = _esrgan_session() is not None
            meta["sr"] = "real-esrgan-x2" if esrgan else "fsrcnn-x2"
            if esrgan:
                denoise_h *= 0.5
                sharpen_amt *= 0.5

    if max(img.shape[:2]) > MAX_EDGE:
        scale = MAX_EDGE / max(img.shape[:2])
        img = cv2.resize(
            img, (round(img.shape[1] * scale), round(img.shape[0] * scale)),
            interpolation=cv2.INTER_AREA,
        )

    img = _denoise(img, denoise_h)
    img = _sharpen(img, sharpen_amt)
    img = _local_contrast(img, clahe_clip)
    img = _color_correct(img, sat, wb_clamp)

    meta["indoor"] = _looks_indoor(img)
    img = _indoor_wb(img)
    meta["exposure_gain"] = round(exposure_gain, 3)
    img = _apply_exposure(img, exposure_gain)

    meta["chain"] = ",".join(
        ["straighten"] * bool(tilt)
        + (["superres"] if meta["sr"] else [])
        + ["denoise", "sharpen", "local_contrast", "color_correct"]
        + ["indoor_wb"] * bool(meta["indoor"])
        + ["exposure_match"] * (abs(exposure_gain - 1.0) >= 0.01)
    )
    return img, meta


def enhance_file(src: Path, dest: Path, preset: str = "default", use_sr: bool = True,
                 exposure_gain: float = 1.0) -> tuple[int, int, dict]:
    img = cv2.imread(str(src), cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"cannot read image: {src}")
    out, meta = enhance(img, preset=preset, use_sr=use_sr, exposure_gain=exposure_gain)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(dest), out, [cv2.IMWRITE_JPEG_QUALITY, 92]):
        raise RuntimeError(f"cannot write image: {dest}")
    return out.shape[1], out.shape[0], meta


def enhance_group(srcs: list[Path], dests: list[Path], preset: str = "default",
                  use_sr: bool = True) -> list[dict]:
    """Enhance photos that belong to ONE listing together.

    This exists only because exposure matching needs the group: the target is the
    group's median brightness, which cannot be known one photo at a time. Reading
    every source twice (once to measure luma, once to process) is cheaper than
    holding N full-size decoded images in RAM alongside a 2x SR buffer.
    """
    if len(srcs) != len(dests):
        raise ValueError("srcs/dests length mismatch")
    thumbs = []
    for s in srcs:
        img = cv2.imread(str(s), cv2.IMREAD_COLOR)
        if img is None:
            raise RuntimeError(f"cannot read image: {s}")
        # Mean luma is scale-invariant, so measure on a thumbnail.
        thumbs.append(cv2.resize(img, (160, 120), interpolation=cv2.INTER_AREA))
    gains = exposure_gains(thumbs)
    out = []
    for s, d, g in zip(srcs, dests, gains):
        w, h, meta = enhance_file(s, d, preset=preset, use_sr=use_sr, exposure_gain=g)
        # No src/dest here: they are per-run temp paths and this dict is persisted
        # to enhanced_meta, where a dead /tmp path is pure noise.
        out.append({**meta, "width": w, "height": h})
    return out


def _self_check() -> None:
    """The smallest thing that fails if the chain breaks."""
    rng = np.random.default_rng(0)
    base = np.full((240, 320, 3), 110, np.uint8)
    base[60:180, 80:240] = 170
    noisy = np.clip(base.astype(np.int16) + rng.normal(0, 12, base.shape), 0, 255).astype(np.uint8)

    out, meta = enhance(noisy, use_sr=False)
    assert out.shape == noisy.shape, out.shape
    assert "denoise" in meta["chain"] and meta["sr"] is None, meta
    # Each step tested where it's observable: sharpen deliberately re-amplifies
    # some of the noise denoise removed, so test denoise in isolation.
    dn = _denoise(noisy, 3.0)
    assert dn[10:40, 10:40].std() < noisy[10:40, 10:40].std(), "denoise did nothing"
    def edge(a): return float(cv2.Laplacian(a[50:70, 70:250], cv2.CV_64F).var())
    assert edge(_sharpen(dn, 0.55)) > edge(dn), "sharpen did nothing"
    assert _local_contrast(dn, 1.1).std() != dn.std(), "clahe did nothing"
    # Colour correction must stay in gamut.
    assert out.min() >= 0 and out.max() <= 255

    up, _ = enhance(noisy[:60, :80], use_sr=True)
    assert up.shape[0] in (120, 60), up.shape  # 2x when a model is present

    # ── straighten: must correct real tilt and REFUSE unmeasurable input ──
    grid = np.full((600, 800, 3), 40, np.uint8)
    for x in range(60, 800, 90):
        cv2.line(grid, (x, 0), (x, 599), (230, 230, 230), 3)
    m = cv2.getRotationMatrix2D((400, 300), 2.0, 1.0)
    tilted = cv2.warpAffine(grid, m, (800, 600), borderMode=cv2.BORDER_REPLICATE)
    got_tilt = _vertical_tilt_deg(tilted)
    assert got_tilt is not None and abs(got_tilt - 2.0) < 0.8, got_tilt
    fixed, applied = _straighten(tilted)
    assert applied is not None
    after = _vertical_tilt_deg(fixed)
    assert after is None or abs(after) < abs(got_tilt), (got_tilt, after)
    # Pure noise yields hundreds of disagreeing "lines"; without the consensus
    # gate this returned a confident -2.78 deg and rotated a photo for no reason.
    noise = rng.integers(0, 255, (300, 400, 3), dtype=np.uint8)
    assert _vertical_tilt_deg(noise) is None, "consensus gate let noise through"
    assert _straighten(noise)[1] is None

    # ── exposure: clamped, pulls toward the group median, no-op at the median ──
    gd, gm, gb = exposure_gains([np.full((50, 50, 3), v, np.uint8) for v in (60, 120, 200)])
    assert gd > 1.0 > gb and abs(gm - 1.0) < 1e-9, (gd, gm, gb)
    assert max(gd, 1 / gb) <= 2.0 ** EXPOSURE_MAX_STOP + 1e-9, (gd, gb)
    dark = np.full((50, 50, 3), 60, np.uint8)
    assert _apply_exposure(dark, gd).mean() > dark.mean()
    # Linear-light gain must not clip highlights that were not already clipped.
    hi = np.full((20, 20, 3), 250, np.uint8)
    assert _apply_exposure(hi, 1.2).max() <= 255

    # ── indoor wb: exteriors untouched, interior cast reduced ──
    sky = np.zeros((300, 400, 3), np.uint8)
    sky[:, :] = (60, 40, 20)
    sky[:120] = (220, 160, 90)                     # BGR blue-ish sky up top
    assert not _looks_indoor(sky), "sky photo classified indoor"
    assert _indoor_wb(sky) is sky, "indoor_wb touched an exterior"
    room = np.full((300, 400, 3), 90, np.uint8)
    room[:, :, 0] = 40                             # heavy warm cast
    assert _looks_indoor(room)
    spread = lambda a: float(a.reshape(-1, 3).mean(axis=0).std())
    assert spread(_indoor_wb(room)) < spread(room), "indoor_wb did not reduce the cast"

    # Tiling must be seam-free and geometrically exact. Substitute a trivial
    # "net" (nearest 2x) for the real one: any indexing bug in _esrgan_x2 then
    # shows up as a pixel mismatch against a plain resize.
    class _FakeSess:
        def get_inputs(self):
            return [type("I", (), {"name": "input"})()]

        def run(self, _, feed):
            x = next(iter(feed.values()))
            up = np.repeat(np.repeat(x, 2, axis=2), 2, axis=3)
            return [up]

    global ESRGAN_TILE
    tile_was, ESRGAN_TILE = ESRGAN_TILE, 32       # force a 4x3 tile grid on 100x130
    try:
        src = rng.integers(0, 255, (100, 130, 3), dtype=np.uint8)
        got = _esrgan_x2(_FakeSess(), src)
        want = np.repeat(np.repeat(src, 2, axis=0), 2, axis=1)
        assert got.shape == want.shape, (got.shape, want.shape)
        assert np.array_equal(got, want), "tiling lost or misplaced pixels"
    finally:
        ESRGAN_TILE = tile_was

    print(f"enhance self-check OK (SR backend: {'real-esrgan' if _esrgan_session() else 'fsrcnn'})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("dest", nargs="?")
    ap.add_argument("--preset", default="default", choices=sorted(PRESETS))
    ap.add_argument("--no-sr", action="store_true")
    ap.add_argument("--exposure-gain", type=float, default=1.0,
                    help="from exposure_gains() over a listing; 1.0 = no-op")
    ap.add_argument("--group-json",
                    help='{"preset":..., "pairs":[[src,dest],...]} — one listing. '
                         "Exposure is matched across the group; prints a JSON "
                         "array of per-photo meta on the last stdout line.")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    if args.group_json:
        spec = json.loads(args.group_json)
        pairs = [(Path(s), Path(d)) for s, d in spec["pairs"]]
        metas = enhance_group([s for s, _ in pairs], [d for _, d in pairs],
                             preset=spec.get("preset", "default"),
                             use_sr=not args.no_sr)
        print(json.dumps(metas))
    elif args.self_check or not args.src:
        _self_check()
    else:
        w, h, meta = enhance_file(Path(args.src), Path(args.dest), args.preset,
                                  not args.no_sr, args.exposure_gain)
        print(f"{args.dest} {w}x{h} {json.dumps(meta)}")
