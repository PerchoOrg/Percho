"""Run Apple Depth Pro over a listing's photos, cache DepthFlow-convention
depth maps (float32, 0-1, larger = nearer) to .cache/depth/.

Usage: .venv-motion/bin/python scripts/prototypes/photo-motion/depth_infer.py <photo-dir> [stem...]
"""

import sys
import time
from pathlib import Path

import numpy as np
import torch
from huggingface_hub import hf_hub_download

import depth_pro
from depth_pro.depth_pro import DEFAULT_MONODEPTH_CONFIG_DICT as CONFIG

CACHE = Path(__file__).parent / ".cache" / "depth"


def load_depth(photo: Path) -> np.ndarray:
    """Cached depth for one photo. Runs the model only on a cache miss."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{photo.parent.name}-{photo.stem}.npy"
    if cached.exists():
        return np.load(cached)
    depths = infer([photo])
    return depths[0]


def infer(photos: list[Path]) -> list[np.ndarray]:
    CACHE.mkdir(parents=True, exist_ok=True)
    CONFIG.checkpoint_uri = hf_hub_download("apple/DepthPro", "depth_pro.pt")
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    t0 = time.time()
    model, transform = depth_pro.create_model_and_transforms(CONFIG, device=device)
    model.eval()
    print(f"[timing] model load: {time.time() - t0:.1f}s on {device}")

    out = []
    for photo in photos:
        image, _, f_px = depth_pro.load_rgb(photo)
        t0 = time.time()
        with torch.no_grad():
            pred = model.infer(transform(image), f_px=f_px)
        meters = pred["depth"].detach().cpu().numpy()
        # Metric depth -> inverse, normalized 0-1. Larger = nearer, matching
        # the convention the renderer's vertex shader expects.
        inv = 1.0 / np.clip(meters, 0.1, None)
        inv01 = ((inv - inv.min()) / (inv.max() - inv.min())).astype(np.float32)
        np.save(CACHE / f"{photo.parent.name}-{photo.stem}.npy", inv01)
        print(f"[timing] {photo.stem}: {time.time() - t0:.1f}s | {meters.min():.1f}-{meters.max():.1f}m")
        out.append(inv01)
    return out


if __name__ == "__main__":
    photo_dir = Path(sys.argv[1])
    stems = sys.argv[2:]
    photos = (
        [photo_dir / f"{s}.jpg" for s in stems]
        if stems
        else sorted(photo_dir.glob("*.jpg"))
    )
    infer(photos)
