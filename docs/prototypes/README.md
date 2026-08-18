# Prototypes

Standalone HTML/JS/Python sketches built before the corresponding feature
existed. **Source only** — the rendered media each one produced (mp4s, frame
sequences, depth maps; ~139 MB) was left behind, because every one of these
regenerates its own output.

They ran out of `~/Workspace/percho-prototypes`, outside any repo, until
phase53 moved the source here and deleted the scratch directory.

Not maintained, and not wired into either app. They are kept because
`packages/shared` and `docs/design/discovery-feed.md` cite them as the origin
of decisions that are still live.

| Prototype | What it explored |
|---|---|
| `discovery-v3/` | The discovery feed — card kinds, slot rhythm, the evidence model. `_data.js` `window.DIMS` is the origin of `DimKey` in `@percho/shared/types`. |
| `discovery-v3-snapshot/` | Frozen copy of the above at the point the spec was written against it. `packages/shared` ported `DIMS` from this file. |
| `vibe/` | Persona derivation and the scope strip — `window.derivePersona`, `window.ASK_POOL`. Ported to `packages/shared` in July 2026 and retired in phase53 when the mobile app shipped its own feed instead. |
| `flipbook-demo/` | Page-curl transition between listing photos. Python + ffmpeg. |
| `depthflow-demo/` | Depth-map parallax on a still photo — the technique behind the DepthFlow render path in `scripts/render-worker/`. |
| `competitive-map/` | One-page competitive landscape, used in a positioning discussion. |
| `subdivision-page-v1/` | First pass at the community page, before `app/(public)/c/[slug]`. |

To run one, open its `index.html` / `feed.html` directly; the Python ones
carry their own usage line at the top.

## One thing that was fixed on the way in

`flipbook-demo/prepare.py` had a Supabase **service-role key hardcoded on line
11**, pointed at the production project. It sat in plaintext in an untracked
folder from July 2026 until phase53. It now reads
`os.environ["SUPABASE_SERVICE_ROLE_KEY"]` like the rest of the repo.

The key itself should be treated as compromised and rotated — it was on disk
in the clear for six weeks, and nothing here can tell you what read it.

If you add a prototype: no credentials in the file, ever. GitHub push
protection caught this one, which is luck, not process.
