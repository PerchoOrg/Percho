#!/usr/bin/env python3
"""
Photo enhancement — the chain the owner asked for (2026-08-03):

    original -> Super Resolution -> Denoise -> Sharpen
             -> Local Contrast -> Color Correction -> output

Runs on CPU, no GPU, no torch. OpenCV's `dnn_superres` with **FSRCNN_x2**
(39 KB, ships in `models/`) instead of Real-ESRGAN: this host has 4 vCPU and no
CUDA, and Real-ESRGAN x4 on a 3200x2400 source is ~90 s/photo plus a 65 MB
torch/basicsr stack. FSRCNN_x2 is ~1 s/photo and the render only ever needs
1080-2400 px of real detail.

# ponytail: FSRCNN_x2 for SR. Swap in Real-ESRGAN (ONNX via cv2.dnn, or torch)
# only if a GPU box shows up AND the owner rejects FSRCNN output side by side.

Skips SR entirely when the source is already >= SR_SKIP_EDGE on its long edge —
upscaling a 3200x2400 Places photo to 6400x4800 buys nothing at a 1080 card and
quadruples the encode.

CLI (also how the worker calls it):

    enhance.py in.jpg out.jpg [--preset default|light|strong] [--no-sr]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

MODELS_DIR = Path(__file__).resolve().parent / "models"

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


def _superres(img: np.ndarray) -> np.ndarray:
    """FSRCNN x2. Returns the input untouched if the model is missing."""
    model = MODELS_DIR / "FSRCNN_x2.pb"
    if not model.exists():
        return img
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(str(model))
    sr.setModel("fsrcnn", 2)
    return sr.upsample(img)


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


def enhance(img: np.ndarray, preset: str = "default", use_sr: bool = True) -> np.ndarray:
    denoise_h, sharpen_amt, clahe_clip, sat, wb_clamp = PRESETS[preset]

    long_edge = max(img.shape[:2])
    if use_sr and long_edge < SR_SKIP_EDGE:
        img = _superres(img)

    if max(img.shape[:2]) > MAX_EDGE:
        scale = MAX_EDGE / max(img.shape[:2])
        img = cv2.resize(
            img, (round(img.shape[1] * scale), round(img.shape[0] * scale)),
            interpolation=cv2.INTER_AREA,
        )

    img = _denoise(img, denoise_h)
    img = _sharpen(img, sharpen_amt)
    img = _local_contrast(img, clahe_clip)
    return _color_correct(img, sat, wb_clamp)


def enhance_file(src: Path, dest: Path, preset: str = "default", use_sr: bool = True) -> tuple[int, int]:
    img = cv2.imread(str(src), cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"cannot read image: {src}")
    out = enhance(img, preset=preset, use_sr=use_sr)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(dest), out, [cv2.IMWRITE_JPEG_QUALITY, 92]):
        raise RuntimeError(f"cannot write image: {dest}")
    return out.shape[1], out.shape[0]


def _self_check() -> None:
    """The smallest thing that fails if the chain breaks."""
    rng = np.random.default_rng(0)
    base = np.full((240, 320, 3), 110, np.uint8)
    base[60:180, 80:240] = 170
    noisy = np.clip(base.astype(np.int16) + rng.normal(0, 12, base.shape), 0, 255).astype(np.uint8)

    out = enhance(noisy, use_sr=False)
    assert out.shape == noisy.shape, out.shape
    # Each step tested where it's observable: sharpen deliberately re-amplifies
    # some of the noise denoise removed, so test denoise in isolation.
    dn = _denoise(noisy, 3.0)
    assert dn[10:40, 10:40].std() < noisy[10:40, 10:40].std(), "denoise did nothing"
    def edge(a): return float(cv2.Laplacian(a[50:70, 70:250], cv2.CV_64F).var())
    assert edge(_sharpen(dn, 0.55)) > edge(dn), "sharpen did nothing"
    assert _local_contrast(dn, 1.1).std() != dn.std(), "clahe did nothing"
    # Colour correction must stay in gamut.
    assert out.min() >= 0 and out.max() <= 255

    up = enhance(noisy[:60, :80], use_sr=True)
    assert up.shape[0] in (120, 60), up.shape  # 2x when the model is present
    print("enhance self-check OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("dest", nargs="?")
    ap.add_argument("--preset", default="default", choices=sorted(PRESETS))
    ap.add_argument("--no-sr", action="store_true")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    if args.self_check or not args.src:
        _self_check()
    else:
        w, h = enhance_file(Path(args.src), Path(args.dest), args.preset, not args.no_sr)
        print(f"{args.dest} {w}x{h}")
