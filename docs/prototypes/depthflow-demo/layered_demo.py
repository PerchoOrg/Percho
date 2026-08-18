"""Layered-depth orbit prototype: foreground/background split + LaMa inpainting,
so disocclusions reveal generated pixels instead of stretched edges.

Pipeline (once per photo):
  Depth Pro depth -> local-contrast foreground mask -> LaMa inpaints background
  RGB -> Telea inpaints background depth -> two textured grid meshes rendered
  with the same parallax warp, FG composited over BG.
"""

import subprocess
import sys
import time
from pathlib import Path

import cv2
import imageio.v3 as imageio
import moderngl
import numpy as np

ROOT = Path(__file__).parent
PHOTOS = Path.home() / "Workspace/fmls-scrape/photos/582110389"
OUT = ROOT / "clips-layered"
OUT.mkdir(exist_ok=True)

W, H, FPS, SECONDS = 800, 600, 30, 3
GRID_W, GRID_H = 400, 300
STEADY = 0.30
STRENGTH = 0.50
ZOOM = 0.94

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
uniform bool use_alpha;
in vec2 uv;
out vec4 color;
void main() {
    float a = use_alpha ? texture(alpha_tex, uv).r : 1.0;
    if (a < 0.02) discard;
    color = vec4(texture(image_tex, uv).rgb, a);
}
"""


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def build_layers(stem: str):
    """Split into FG (original + mask) and BG (LaMa-inpainted plate + depth)."""
    from PIL import Image
    from simple_lama_inpainting import SimpleLama

    image = imageio.imread(PHOTOS / f"{stem}.jpg")[..., :3]
    depth = np.load(ROOT / "depth-pro" / f"{stem}.npy")
    depth = cv2.resize(depth, (image.shape[1], image.shape[0]))

    # Foreground = locally nearer than surroundings (skips smooth ground gradient)
    local = cv2.medianBlur((depth * 255).astype(np.uint8), 121).astype(np.float32) / 255
    fg = ((depth - local) > 0.045).astype(np.uint8) * 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # Drop sliver noise (thin depth-edge triangles along rooflines etc.)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 400:
            fg[labels == i] = 0

    lama_mask = cv2.dilate(fg, np.ones((25, 25), np.uint8))
    t0 = time.time()
    lama = SimpleLama()
    bg_rgb = np.array(lama(Image.fromarray(image), Image.fromarray(lama_mask)))
    bg_rgb = bg_rgb[: image.shape[0], : image.shape[1]]
    print(f"[timing] {stem} lama inpaint: {time.time() - t0:.1f}s")

    bg_depth = cv2.inpaint(
        (depth * 255).astype(np.uint8), lama_mask, 5, cv2.INPAINT_TELEA
    ).astype(np.float32) / 255

    fg_alpha = cv2.GaussianBlur(cv2.dilate(fg, np.ones((3, 3), np.uint8)), (5, 5), 0)

    imageio.imwrite(OUT / f"{stem}-fg-mask.png", fg)
    imageio.imwrite(OUT / f"{stem}-bg-plate.png", bg_rgb)
    return image, depth, fg_alpha, bg_rgb, bg_depth


def make_grid(ctx, prog):
    xs = np.linspace(0, 1, GRID_W, dtype=np.float32)
    ys = np.linspace(0, 1, GRID_H, dtype=np.float32)
    gx, gy = np.meshgrid(xs, ys)
    verts = np.stack([gx.ravel(), gy.ravel()], axis=1)
    idx = []
    for r in range(GRID_H - 1):
        for c in range(GRID_W - 1):
            i = r * GRID_W + c
            idx += [i, i + 1, i + GRID_W, i + 1, i + GRID_W + 1, i + GRID_W]
    vbo = ctx.buffer(verts.tobytes())
    ibo = ctx.buffer(np.array(idx, dtype=np.uint32).tobytes())
    return ctx.vertex_array(prog, [(vbo, "2f", "in_pos")], ibo)


def tex_rgb(ctx, arr):
    return ctx.texture((arr.shape[1], arr.shape[0]), 3, np.ascontiguousarray(arr).tobytes())


def tex_gray(ctx, arr01):
    data = np.ascontiguousarray(arr01.astype(np.float32))
    t = ctx.texture((arr01.shape[1], arr01.shape[0]), 1, data.tobytes(), dtype="f4")
    return t


def render(stem: str, direction: str, amplitude: float, suffix: str = "") -> None:
    image, depth, fg_alpha, bg_rgb, bg_depth = build_layers(stem)

    ctx = moderngl.create_context(standalone=True)
    prog = ctx.program(vertex_shader=VERT, fragment_shader=FRAG)
    grid = make_grid(ctx, prog)
    fbo = ctx.framebuffer(color_attachments=[ctx.texture((W, H), 3)])

    textures = {
        "bg_img": tex_rgb(ctx, bg_rgb), "bg_dep": tex_gray(ctx, bg_depth),
        "fg_img": tex_rgb(ctx, image), "fg_dep": tex_gray(ctx, depth),
        "fg_a": tex_gray(ctx, fg_alpha.astype(np.float32) / 255),
    }
    for t in textures.values():
        t.filter = (moderngl.LINEAR, moderngl.LINEAR)

    out = OUT / f"{stem}-orbit_{direction}{suffix}.mp4"
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "rawvideo", "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
         "-movflags", "+faststart", "-pix_fmt", "yuv420p", str(out)],
        stdin=subprocess.PIPE,
    )

    sign = -1.0 if direction == "left" else 1.0
    prog["zoom"].value = ZOOM
    prog["steady"].value = STEADY
    prog["strength"].value = STRENGTH
    ctx.enable(moderngl.BLEND)

    t0 = time.time()
    frames = FPS * SECONDS
    for i in range(frames):
        s = ease(i / (frames - 1))
        ox = sign * (2.0 * amplitude * s - amplitude)
        prog["offset"].value = (ox, 0.0)

        fbo.use()
        ctx.clear(0.0, 0.0, 0.0)
        # background plate
        textures["bg_img"].use(0); textures["bg_dep"].use(1)
        prog["image_tex"].value = 0; prog["depth_tex"].value = 1
        prog["use_alpha"].value = False
        grid.render()
        # foreground over it
        textures["fg_img"].use(0); textures["fg_dep"].use(1); textures["fg_a"].use(2)
        prog["alpha_tex"].value = 2
        prog["use_alpha"].value = True
        grid.render()

        raw = fbo.read(components=3)
        frame = np.frombuffer(raw, np.uint8).reshape(H, W, 3)[::-1]
        ff.stdin.write(frame.tobytes())

    ff.stdin.close()
    ff.wait()
    print(f"[timing] {stem} layered orbit_{direction}{suffix}: {time.time() - t0:.1f}s -> {out.name}")


if __name__ == "__main__":
    stem = sys.argv[1] if len(sys.argv) > 1 else "00"
    render(stem, "right", amplitude=0.35)          # same amplitude as DepthFlow clips
    render(stem, "right", amplitude=0.70, suffix="-wide")  # 2x headroom showcase
