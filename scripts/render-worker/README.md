# Percho render worker

Long-running poller on the EC2 render box. Turns queued `render_jobs` rows
into Cloudflare Stream videos.

Trigger path: agent clicks **Generate home tour video** on the listing edit
page → `POST /api/listings/[id]/generate-tour` inserts a placeholder
`listing_videos` row + a `render_jobs` row → this worker picks it up.

## Requirements on the host

- Python 3 with `requests` (stdlib for the rest — no supabase-py, no dotenv).
- `ffmpeg` in `PATH` (used by `scripts/ken-burns/generate.py`).
- Repo checked out at `/home/ubuntu/Percho` with `.env.local` containing
  `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`.

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
   matching `docs/ken-burns/demo/flagship-overlay.json` schema.
4. Runs `scripts/ken-burns/generate.py` with `--listing-overlay` and
   `--ending-card`. Output: `/tmp/render-<jobid>/out.mp4`.
5. Uploads MP4 to Cloudflare Stream (simple upload endpoint, fine
   for <200MB). Grabs the returned `uid`.
6. Sets `listing_videos.cf_video_id` + `status='ready'` and
   `render_jobs.status='done'`.

On any error: job → `failed` with `error` populated, video row →
`status='error'`. Agent can click the button again to re-render (the API
route deletes the previous walkthrough row + CF video first).
