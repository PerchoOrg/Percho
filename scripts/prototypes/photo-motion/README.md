# Photo motion prototypes

Camera-move research for listing video. **Production today is
`scripts/ken-burns/generate.py`**, called by the render worker — nothing here
is wired into the product.

## Direction (owner call, 2026-08-09)

Stay on Ken Burns. If we add parallax, it is **DepthFlow + Depth Anything V2
Small** (`depthflow_demo.py`). Depth Pro and the layered-slice route were
tested and dropped: sharper depth maps did not produce a better video — both
read as soft in motion.

## Files

| File | What it is |
|---|---|
| `depthflow_demo.py` | The kept version. DA2-Small depth, DepthFlow renders the parallax. Four clips, orbit/zoom alternating. |
| `depth_infer.py` | Apple Depth Pro inference, cached to `.cache/depth/`. Dropped route. |
| `layered_render.py` | Depth-slice layered renderer + LaMa inpainting. Dropped route. |
| `render_listing.py` | Renders a whole listing through the orbit/zoom choreography. Dropped route. |

`depthflow_demo.py` needs `depthflow` installed, which is **not** in
`requirements.txt` — that env was not rebuilt after the direction changed. The
other three run in `.venv-motion` (see `requirements.txt`).

Derived artifacts (`.cache/`, `out/`) are gitignored and regenerable.
