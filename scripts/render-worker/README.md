# Percho render worker

Long-running poller on the EC2 render box. Turns queued `render_jobs` rows
into Cloudflare Stream videos.

Trigger path: agent clicks **Generate home tour video** on the listing edit
page → `POST /api/listings/[id]/generate-tour` inserts a placeholder
`listing_videos` row + a `render_jobs` row → this worker picks it up.

## Requirements on the host

- Python 3 with `requests` (stdlib for the rest — no supabase-py, no dotenv).
- `ffmpeg` in `PATH` (used by `scripts/ken-burns/generate.py`).
- **`opencv-contrib-python-headless`** for the photo-enhancement pass
  (`enhance.py`). Must be the `contrib` build — plain `opencv-python` has no
  `cv2.dnn_superres`, and the FSRCNN fallback then fails:
  ```bash
  /usr/bin/python3 -m pip install --break-system-packages opencv-contrib-python-headless
  ```
  Verify: `python3 -c "import cv2; print(hasattr(cv2,'dnn_superres'))"` → `True`.
- **`onnxruntime` + the Real-ESRGAN x2 weights** for the SR step. Weights are
  66 MB and gitignored:
  ```bash
  /usr/bin/python3 -m pip install --break-system-packages onnxruntime
  scripts/render-worker/models/fetch.sh
  ```
  On the Mac mini install `onnxruntime` (the wheel carries the CoreML EP) —
  `enhance.py` picks CoreML → CUDA → CPU automatically, no per-host config.
  Without either piece it silently falls back to FSRCNN_x2 and keeps working;
  `enhance.py --self-check` prints which backend is live.
  `ENHANCE_THREADS` overrides the intra-op thread count (defaults to all cores).
- Repo checked out at `/home/ubuntu/Percho` with `.env.local` containing
  `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`.

## Photo enhancement queue

There is no jobs table — `{listing,poi}_photos.enhanced_status` IS the queue.
Admin queues from `/admin/pipeline/tour-jobs/[id]` or
`/admin/pipeline/poi-library/[id]`; the worker polls it *after* render jobs so
batch enhancement never delays a render someone is watching.

Photos are claimed **per listing, not per photo** (`ENHANCE_GROUP_MAX = 24`).
That is not an optimisation: exposure matching targets the median brightness of
the listing, which cannot be computed one photo at a time.

The chain, in order:

| Step | What | Ceiling / refusal |
|---|---|---|
| straighten | roll-only rotation, walls plumb | ≤4°, ≥0.3°, refused unless detected verticals agree; corners cropped to real pixels, never filled |
| superres | Real-ESRGAN x2 (ONNX) → FSRCNN x2 → none | skipped when long edge ≥ 2400 |
| denoise | NLM colored | halved when ESRGAN ran |
| sharpen | unsharp mask | halved when ESRGAN ran |
| local contrast | CLAHE on L + shadow lift | clip 1.1 default |
| color correct | gray-world | ±2% |
| indoor WB | illuminant from the bright half | ±10%, **interiors only** |
| exposure match | pull toward the listing's median luma | ±0.35 stop, 70% strength, linear light |

Every op is clamped and has a no-op path, because an MLS photo must not
misrepresent the property. `enhanced_meta.chain` records which ops actually
fired per photo, and the admin photo table shows it under the status.

Straighten fires on roughly **1 in 18** real listing photos (measured
2026-08-03) — MLS shooters use tripods. It is kept because the cost of a miss is
one Canny+Hough pass and the win when it fires is a visibly crooked photo fixed.
Perspective/keystone correction is deliberately NOT implemented: pulling
converging verticals parallel stretches ceilings and bows door frames, which is
exactly the manipulated look the product can't ship.

`ready` means the enhanced JPEG exists at
`listing-photos/enhanced/<original path>` and is awaiting review. Renders read it
only once an admin sets `approved` — see `approved_enhanced_path()`.

Self-checks:

```bash
/usr/bin/python3 scripts/render-worker/enhance.py --self-check   # every op + its refusal path
/usr/bin/python3 scripts/render-worker/enhance_smoke.py          # queue → storage, end to end
/usr/bin/python3 scripts/render-worker/enhance_sample.py 3       # BEFORE/AFTER JPEGs for review
```

One listing by hand (exposure matched across the group):

```bash
/usr/bin/python3 scripts/render-worker/enhance.py --group-json \
  '{"preset":"default","pairs":[["a.jpg","a-out.jpg"],["b.jpg","b-out.jpg"]]}'
```

## Manual run (for testing)

```bash
cd /home/ubuntu/Percho
python3 scripts/render-worker/worker.py
```

Ctrl-C to stop. Idle polls every 5s.

## Install as systemd service

```bash
sudo cp scripts/render-worker/percho-render-worker.service \
        /etc/systemd/system/percho-render-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now percho-render-worker
sudo systemctl status percho-render-worker
```

Logs:

```bash
sudo tail -f /var/log/percho-render-worker.log
# or
journalctl -u percho-render-worker -f
```

## What a job does

1. Claims oldest `render_jobs` row where `status='queued'` (optimistic
   `UPDATE ... WHERE status='queued'` to avoid double-run).
2. Downloads all `listing_photos` from the `listing-photos` Supabase
   Storage bucket in `sort_order`, service role bypasses RLS.
3. Builds a listing-overlay JSON (price / specs / address / neighborhood)
   with the shape `{price_display, specs, address, neighborhood, show_on_clips: [int]}`.
4. Runs `scripts/ken-burns/generate.py` with `--listing-overlay` and
   `--ending-card`. Output: `/tmp/render-<jobid>/out.mp4`.
5. Uploads MP4 to Cloudflare Stream (simple upload endpoint, fine
   for <200MB). Grabs the returned `uid`.
6. Sets `listing_videos.cf_video_id` + `status='ready'` and
   `render_jobs.status='done'`.

On any error: job → `failed` with `error` populated, video row →
`status='error'`. Agent can click the button again to re-render (the API
route deletes the previous walkthrough row + CF video first).
