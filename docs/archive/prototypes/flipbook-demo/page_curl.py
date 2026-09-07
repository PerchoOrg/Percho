"""Page-curl transition renderer.

Given two still images (outgoing/incoming) render N frames simulating a page
peeling from the right edge, revealing the incoming image underneath.

Approach:
 - The outgoing page rotates around its LEFT edge, folding to the left, with
   perspective (right edge lifting toward camera then flipping past). Uses
   PIL's Image.transform with PERSPECTIVE (8-tuple homography).
 - A shadow gradient tracks the fold line and darkens the incoming page under
   the curl.
 - Back-of-page tint added when >50% folded (paper backside).

Simplification vs a true cylindrical curl: we do a flat page rotation (like a
book page swinging from its left edge), NOT a rolling cylinder. It reads as
"翻书" — page-flip — which is what the owner asked for. A true rolling
cylinder needs a mesh warp shader; not worth building.

Coord frame: (0,0) top-left, x right, y down. Rotation axis is the LEFT edge
(x=0). At progress P=0 the outgoing page fills the frame. At P=1 the outgoing
page has swung 180° to the left and is off-screen; incoming page is fully
visible.
"""
from __future__ import annotations
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


def _perspective_coeffs(src, dst):
    """Given 4 src corners → 4 dst corners, return 8-tuple for PIL PERSPECTIVE.
    PIL wants the INVERSE mapping (dst → src) so we solve the linear system."""
    matrix = []
    for (sx, sy), (dx, dy) in zip(src, dst):
        matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    # Solve 8x8 linear system via numpy
    import numpy as np
    A = np.array(matrix, dtype=float)
    B = np.array([s for pair in src for s in pair], dtype=float)
    res = np.linalg.solve(A, B)
    return tuple(float(x) for x in res)


def _page_frame(img_out: Image.Image, img_in: Image.Image, p: float) -> Image.Image:
    """Compose one transition frame at progress p in [0,1]."""
    W, H = img_in.size
    # Angle from 0 (flat, right edge at x=W) to π (flipped, right edge at x=-W).
    # Ease slightly so the middle 0.4-0.6 has visible tilt.
    angle = p * math.pi
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)

    # Right edge x-position after rotation around left edge (x=0):
    right_x = W * cos_a
    # Perspective foreshortening: as the page tilts, the top/bottom of the
    # right edge come toward camera then away. Simulate with y-inset that
    # peaks at p=0.5.
    lift = int(H * 0.08 * abs(sin_a))  # 8% max inset

    # Destination quad for outgoing page corners:
    #   top-left     (0, 0)   stays
    #   top-right    (right_x, lift)
    #   bottom-right (right_x, H - lift)
    #   bottom-left  (0, H)   stays
    src_corners = [(0, 0), (W, 0), (W, H), (0, H)]
    dst_corners = [(0, 0), (right_x, lift), (right_x, H - lift), (0, H)]

    # Base = incoming (fully opaque)
    base = img_in.copy().convert("RGBA")

    # If fold is more than halfway (p >= 0.5), we're seeing the BACK of the page.
    # Show a mirrored, tinted version.
    if p >= 0.5:
        page = Image.eval(img_out.convert("RGB"), lambda v: int(v * 0.72))
        page = page.transpose(Image.FLIP_LEFT_RIGHT).convert("RGBA")
        # Add a subtle paper tint (warm cream) so backside reads as paper
        tint = Image.new("RGBA", page.size, (245, 235, 210, 40))
        page = Image.alpha_composite(page, tint)
    else:
        page = img_out.convert("RGBA")

    # Warp the page using perspective transform.
    # PIL applies the transform to sample the source at inverse-mapped
    # coordinates. Coeffs = dst → src mapping.
    try:
        coeffs = _perspective_coeffs(src_corners, dst_corners)
    except Exception:
        return base.convert("RGB")

    # Compute inverse for PIL (PIL PERSPECTIVE wants the transform that takes
    # output pixel to source pixel — i.e. inverse of what we specified above).
    # Easier: use Image.transform with PERSPECTIVE and pass the inverse mapping
    # directly: we need dst_corners → src_corners.
    import numpy as np
    # Re-solve for inverse
    def solve(src_pts, dst_pts):
        matrix = []
        for (sx, sy), (dx, dy) in zip(src_pts, dst_pts):
            matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
            matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        A = np.array(matrix, dtype=float)
        B = np.array([s for pair in src_pts for s in pair], dtype=float)
        return tuple(float(x) for x in np.linalg.solve(A, B))

    inv_coeffs = solve(src_corners, dst_corners)

    warped = page.transform(
        (W, H), Image.PERSPECTIVE, inv_coeffs,
        resample=Image.BILINEAR, fillcolor=(0, 0, 0, 0),
    )

    # Build a shadow to cast on the incoming page along the fold seam.
    # Shadow is a soft dark gradient centered on the current right edge x.
    if 0.02 < p < 0.98:
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        # Shadow strength peaks near p=0.5
        strength = int(140 * math.sin(angle))
        seam_x = int(max(0, min(W - 1, right_x)))
        # Draw a vertical band right of the seam, then blur
        band_w = max(20, int(W * 0.15))
        for dx in range(band_w):
            alpha = int(strength * (1 - dx / band_w) ** 2)
            x = seam_x + dx
            if 0 <= x < W:
                sd.line([(x, 0), (x, H)], fill=(0, 0, 0, alpha), width=1)
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=8))
        base = Image.alpha_composite(base, shadow)

    # Composite warped page over base
    out = Image.alpha_composite(base, warped)
    return out.convert("RGB")


def render_transition_frames(img_out_path: str, img_in_path: str,
                              out_dir: Path, n_frames: int,
                              w: int, h: int) -> list[Path]:
    """Render N frames of the page-curl transition to out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    imgA = Image.open(img_out_path).convert("RGB").resize((w, h), Image.LANCZOS)
    imgB = Image.open(img_in_path).convert("RGB").resize((w, h), Image.LANCZOS)
    paths = []
    for i in range(n_frames):
        # p in (0, 1) exclusive — first and last frames redundant with clips.
        p = (i + 1) / (n_frames + 1)
        frame = _page_frame(imgA, imgB, p)
        pth = out_dir / f"trans_{i:04d}.jpg"
        frame.save(pth, quality=88)
        paths.append(pth)
    return paths


if __name__ == "__main__":
    import argparse, subprocess, tempfile
    ap = argparse.ArgumentParser()
    ap.add_argument("--img-a", required=True)
    ap.add_argument("--img-b", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--duration", type=float, default=0.4)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("-w", type=int, default=1080)
    ap.add_argument("-H", "--height", type=int, default=1920)
    args = ap.parse_args()
    n = int(args.duration * args.fps)
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        render_transition_frames(args.img_a, args.img_b, tdp, n, args.w, args.height)
        subprocess.run([
            "ffmpeg", "-y", "-framerate", str(args.fps),
            "-i", str(tdp / "trans_%04d.jpg"),
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p", "-r", str(args.fps),
            args.out,
        ], check=True)
        print(f"wrote {args.out} ({n} frames @ {args.fps}fps)")
