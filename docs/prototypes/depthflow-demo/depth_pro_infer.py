"""Run Apple Depth Pro on the demo photos; save DepthFlow-convention depth (.npy)
plus grayscale visualizations for all three depth sources (da2-small/large/pro)."""

import time
from pathlib import Path

import numpy as np
import torch
from huggingface_hub import hf_hub_download

import depth_pro
from depth_pro.depth_pro import DEFAULT_MONODEPTH_CONFIG_DICT as CONFIG

PHOTOS = Path.home() / "Workspace/fmls-scrape/photos/582110389"
ROOT = Path(__file__).parent
OUT = ROOT / "depth-pro"
VIZ = ROOT / "depth-viz"
OUT.mkdir(exist_ok=True)
VIZ.mkdir(exist_ok=True)

STEMS = ["00", "05", "07", "03"]


def save_gray(path: Path, depth01: np.ndarray) -> None:
    import imageio.v3 as imageio
    imageio.imwrite(path, (depth01 * 255).astype(np.uint8))


def main() -> None:
    ckpt = hf_hub_download("apple/DepthPro", "depth_pro.pt")
    CONFIG.checkpoint_uri = ckpt
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    t0 = time.time()
    model, transform = depth_pro.create_model_and_transforms(CONFIG, device=device)
    model.eval()
    print(f"[timing] model load: {time.time() - t0:.1f}s on {device}")

    for stem in STEMS:
        image, _, f_px = depth_pro.load_rgb(PHOTOS / f"{stem}.jpg")
        t0 = time.time()
        with torch.no_grad():
            pred = model.infer(transform(image), f_px=f_px)
        meters = pred["depth"].detach().cpu().numpy()
        print(f"[timing] {stem}: {time.time() - t0:.1f}s | range {meters.min():.2f}-{meters.max():.2f}m")

        inv = 1.0 / np.clip(meters, 0.1, None)
        inv01 = (inv - inv.min()) / (inv.max() - inv.min())
        np.save(OUT / f"{stem}.npy", inv01.astype(np.float32))
        save_gray(VIZ / f"{stem}-pro.png", inv01)

    # Depth Anything V2 small + large visualizations (cached by depthflow)
    import imageio.v3 as imageio
    from depthflow.estimators.anything import DepthAnythingBase, DepthAnythingV2
    for name, model_size in [("da2-small", "Small"), ("da2-large", "Large")]:
        est = DepthAnythingV2(model=DepthAnythingBase.Model[model_size])
        for stem in STEMS:
            img = imageio.imread(PHOTOS / f"{stem}.jpg")
            save_gray(VIZ / f"{stem}-{name}.png", est.estimate(img))


if __name__ == "__main__":
    main()
