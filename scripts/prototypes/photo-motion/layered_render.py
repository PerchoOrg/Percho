"""Layered-depth-image renderer for listing photos.

Splits the scene into N depth slices cut at histogram valleys, builds one
textured mesh per slice, and inpaints each slice's plate so it extends behind
the slices in front of it. Disocclusions during a camera move then reveal
generated pixels instead of a stretched edge.

Replaces the local-contrast object mask of the earlier prototype, which only
fired on small isolated objects (a mailbox) and left the house itself as one
stretched sheet.

Usage:
  .venv-motion/bin/python scripts/prototypes/photo-motion/layered_render.py \
      <photo.jpg> [--layers 4] [--amplitude 0.35] [--direction right]
"""

import argparse
import subprocess
import time
from pathlib import Path

import cv2
import imageio.v3 as imageio
import moderngl
import numpy as np

from depth_infer import load_depth

ROOT = Path(__file__).parent
OUT = ROOT / "out"
PLATES = ROOT / ".cache" / "plates"

FPS, SECONDS = 30, 3
STEADY = 0.30
STRENGTH = 0.50


def crop_zoom(amplitude: float) -> float:
    """Crop margin has to exceed the largest displacement any layer can take.

    A nearest-layer vertex moves by amplitude * (1 - STEADY) * STRENGTH. If the
    crop is tighter than that, objects the photo clipped at its own edge get
    dragged into frame with their missing half unrecoverable — they read as
    torn fragments floating over the scene.
    """
    return 1.0 / (1.0 + amplitude * (1.0 - STEADY) * STRENGTH * 1.15)

VERT = """
#version 330
in vec2 in_pos;                // [0,1]^2 grid
uniform sampler2D depth_tex;
uniform vec2 offset;
uniform float zoom;
uniform float steady;
uniform float strength;
out vec2 uv;
void main() {
    uv = in_pos;
    float d = texture(depth_tex, uv).r;
    vec2 ndc = vec2(in_pos.x, 1.0 - in_pos.y) * 2.0 - 1.0;
    vec2 pos = ndc * (1.0 / zoom) + offset * (d - steady) * strength;
    gl_Position = vec4(pos, 0.0, 1.0);
}
"""

FRAG = """
#version 330
uniform sampler2D image_tex;
uniform sampler2D alpha_tex;
in vec2 uv;
out vec4 color;
void main() {
    float a = texture(alpha_tex, uv).r;
    if (a < 0.02) discard;
    color = vec4(texture(image_tex, uv).rgb, a);
}
"""


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def slice_bounds(depth: np.ndarray, n: int) -> list[float]:
    """Cut points between depth slices, placed at histogram valleys.

    Uniform cuts would slice straight through continuous surfaces (a receding
    lawn, a wall in perspective) and show a seam where the plane jumps. Valleys
    are the empty depth ranges between real surfaces, so cutting there puts the
    seam where there are no pixels to tear.
    """
    hist, edges = np.histogram(depth, bins=256, range=(0.0, 1.0))
    smooth = cv2.GaussianBlur(hist.astype(np.float32), (1, 31), 0).ravel()
    centers = (edges[:-1] + edges[1:]) / 2

    # Candidate valleys: local minima, ignoring the tails where there is
    # nothing to separate.
    lo, hi = np.percentile(depth, [2, 98])
    cand = [
        (smooth[i], centers[i])
        for i in range(1, len(smooth) - 1)
        if smooth[i] <= smooth[i - 1] and smooth[i] <= smooth[i + 1] and lo < centers[i] < hi
    ]
    cand.sort(key=lambda c: c[0])

    picked: list[float] = []
    for _, c in cand:
        # Keep cuts apart so we don't get slivers.
        if all(abs(c - p) > (hi - lo) / (n + 1) for p in picked):
            picked.append(c)
        if len(picked) == n - 1:
            break

    if len(picked) < n - 1:  # flat histogram — fall back to equal population
        picked = list(np.percentile(depth, np.linspace(0, 100, n + 1)[1:-1]))
    return sorted(picked)


def _peel_plates(photo: Path, image: np.ndarray, bands: list[np.ndarray], n: int) -> list[np.ndarray]:
    """RGB plate per layer, front to back. plates[k] has every band in front
    of k inpainted away, one band at a time."""
    from PIL import Image
    from simple_lama_inpainting import SimpleLama

    key = f"{photo.parent.name}-{photo.stem}-n{n}"
    cached = [PLATES / f"{key}-l{k}.png" for k in range(n)]
    if all(c.exists() for c in cached):
        return [imageio.imread(c)[..., :3] for c in cached]

    PLATES.mkdir(parents=True, exist_ok=True)
    lama = SimpleLama()
    plates: list[np.ndarray] = [image] * n
    plate = image
    for k in range(n - 1, -1, -1):
        plates[k] = plate
        imageio.imwrite(cached[k], plate)
        if k == 0:
            break
        hole = cv2.dilate(bands[k].astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
        t0 = time.time()
        plate = np.array(lama(Image.fromarray(plate), Image.fromarray(hole)))[
            : image.shape[0], : image.shape[1]
        ]
        print(f"[timing] peel band {k} lama: {time.time() - t0:.1f}s")
    return plates


def build_layers(photo: Path, depth: np.ndarray, n: int) -> list[dict]:
    """Back-to-front list of {rgb, depth, alpha}. Layer 0 is the far plate."""
    image = imageio.imread(photo)[..., :3]
    depth = cv2.resize(depth, (image.shape[1], image.shape[0]))
    cuts = slice_bounds(depth, n)
    print(f"[slices] cuts at {[round(c, 3) for c in cuts]}")

    bounds = [0.0, *cuts, 1.0001]
    bands = [(depth >= bounds[k]) & (depth < bounds[k + 1]) for k in range(n)]

    # Plates are peeled front to back: each pass removes exactly one band and
    # inpaints only that band's footprint. Asking LaMa to fill everything
    # nearer in one shot (the far plate's hole would be ~95% of the frame)
    # returns hallucinated garbage, which then shows through as a torn hole at
    # the disocclusions this whole technique exists to fill.
    plates = _peel_plates(photo, image, bands, n)

    layers = []
    for k in range(n):
        in_band = bands[k]
        nearer = depth >= bounds[k + 1]
        band_px = int(in_band.sum())
        if band_px < 500:  # empty slice, skip it
            print(f"[slices] layer {k} empty ({band_px}px) — skipped")
            continue

        # Displacement for this layer must come only from this layer's own
        # pixels. Sampling the raw depth map instead makes a vertex on a thin
        # silhouette (a mailbox post) pick up the ramp toward the surface
        # behind it and shear the object into an S-bend.
        layer_depth = cv2.inpaint(
            (depth * 255).astype(np.uint8),
            (~in_band).astype(np.uint8) * 255,
            5,
            cv2.INPAINT_TELEA,
        ).astype(np.float32) / 255

        rgb = plates[k]
        # A layer covers its own band plus everything in front of it, so the
        # layer behind is never asked to fill a gap it has no content for.
        alpha = ((in_band | nearer).astype(np.uint8)) * 255

        # Feather only, never dilate. Dilating (the earlier prototype's mistake)
        # makes each layer carry a rim of the layer behind it, which slides
        # along as a soft ghost edge; eroding erases thin structures like a
        # mailbox post outright.
        alpha = cv2.GaussianBlur(alpha, (3, 3), 0).astype(np.float32) / 255
        layers.append({"rgb": rgb, "depth": layer_depth, "alpha": alpha})

    print(f"[slices] {len(layers)} layers built")
    return layers


def make_grid(ctx, prog, gw: int, gh: int):
    xs = np.linspace(0, 1, gw, dtype=np.float32)
    ys = np.linspace(0, 1, gh, dtype=np.float32)
    gx, gy = np.meshgrid(xs, ys)
    verts = np.stack([gx.ravel(), gy.ravel()], axis=1)
    r, c = np.mgrid[0 : gh - 1, 0 : gw - 1]
    i = (r * gw + c).ravel()
    idx = np.stack(
        [i, i + 1, i + gw, i + 1, i + gw + 1, i + gw], axis=1
    ).ravel().astype(np.uint32)
    vbo = ctx.buffer(verts.tobytes())
    ibo = ctx.buffer(idx.tobytes())
    return ctx.vertex_array(prog, [(vbo, "2f", "in_pos")], ibo)


def render(layers: list[dict], out: Path, direction: str, amplitude: float) -> None:
    h, w = layers[0]["rgb"].shape[:2]
    ctx = moderngl.create_context(standalone=True)
    prog = ctx.program(vertex_shader=VERT, fragment_shader=FRAG)
    grid = make_grid(ctx, prog, w, h)  # one vertex per pixel
    fbo = ctx.framebuffer(color_attachments=[ctx.texture((w, h), 3)])

    gl_layers = []
    for layer in layers:
        img = ctx.texture((w, h), 3, np.ascontiguousarray(layer["rgb"]).tobytes())
        dep = ctx.texture((w, h), 1, np.ascontiguousarray(layer["depth"], np.float32).tobytes(), dtype="f4")
        alp = ctx.texture((w, h), 1, np.ascontiguousarray(layer["alpha"], np.float32).tobytes(), dtype="f4")
        for t in (img, dep, alp):
            t.filter = (moderngl.LINEAR, moderngl.LINEAR)
        gl_layers.append((img, dep, alp))

    out.parent.mkdir(parents=True, exist_ok=True)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "rawvideo", "-s", f"{w}x{h}", "-pix_fmt", "rgb24", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
         "-movflags", "+faststart", "-pix_fmt", "yuv420p", str(out)],
        stdin=subprocess.PIPE,
    )

    sign = -1.0 if direction == "left" else 1.0
    prog["zoom"].value = crop_zoom(amplitude)
    prog["steady"].value = STEADY
    prog["strength"].value = STRENGTH
    ctx.enable(moderngl.BLEND)

    t0 = time.time()
    frames = FPS * SECONDS
    for i in range(frames):
        s = ease(i / (frames - 1))
        prog["offset"].value = (sign * (2.0 * amplitude * s - amplitude), 0.0)
        fbo.use()
        ctx.clear(0.0, 0.0, 0.0)
        for img, dep, alp in gl_layers:  # back to front
            img.use(0); dep.use(1); alp.use(2)
            prog["image_tex"].value = 0
            prog["depth_tex"].value = 1
            prog["alpha_tex"].value = 2
            grid.render()
        frame = np.frombuffer(fbo.read(components=3), np.uint8).reshape(h, w, 3)[::-1]
        ff.stdin.write(frame.tobytes())

    ff.stdin.close()
    ff.wait()
    print(f"[timing] {out.name}: {time.time() - t0:.1f}s")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo", type=Path)
    ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--amplitude", type=float, default=0.35)
    ap.add_argument("--direction", default="right")
    args = ap.parse_args()

    depth = load_depth(args.photo)
    image = imageio.imread(args.photo)[..., :3]
    depth_full = cv2.resize(depth, (image.shape[1], image.shape[0]))
    stem = f"{args.photo.stem}-{args.direction}-a{args.amplitude:g}"

    # Baseline: the whole scene as one stretched sheet, for side-by-side.
    flat = [{"rgb": image, "depth": depth_full, "alpha": np.ones(image.shape[:2], np.float32)}]
    render(flat, OUT / f"{stem}-flat.mp4", args.direction, args.amplitude)

    layers = build_layers(args.photo, depth, args.layers)
    render(layers, OUT / f"{stem}-sliced.mp4", args.direction, args.amplitude)


if __name__ == "__main__":
    main()
