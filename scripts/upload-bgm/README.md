# upload-bgm

One-shot uploader that mirrors the render-worker BGM library from local
disk (`scripts/render-worker/bgm/<vibe>/*.mp3`) into a public Supabase
Storage bucket called `bgm`, and regenerates `manifest.json` from disk
truth. Powers the `/admin/pipeline/bgm` audio library.

> ⚠️ Run this from the render-worker EC2 host (or anywhere the mp3s are
> on disk — they're gitignored, so they don't exist on a fresh clone).

## Prereqs

- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
  `.env.local` at repo root (or point `PERCHO_ENV` at another dotenv).
- Python 3.10+ with `requests` (`pip install requests`).

## Run

```bash
cd scripts/upload-bgm
python upload.py
```

Idempotent: existing objects (checked via HEAD on the public URL) are
skipped. Adding tracks later? Drop the mp3 in the right vibe dir and
re-run — only new files upload, and `manifest.json` picks them up.

## What it does

1. Ensures Supabase Storage bucket `bgm` exists and is public.
2. Walks `scripts/render-worker/bgm/<vibe>/*.mp3` (skips `_archive/`).
3. Uploads each mp3 to `bgm/<vibe>/<filename>.mp3`.
4. Rewrites `scripts/render-worker/bgm/manifest.json` with the live
   track list (schema_version=2, includes `storage_bucket`).

## Bucket layout on Supabase

```
bgm/
  warm-acoustic/*.mp3
  modern-corporate/*.mp3
  luxury-ambient/*.mp3
  chill-electronic/*.mp3
  cinematic/*.mp3
```

Public URLs follow the standard shape:
`{SUPABASE_URL}/storage/v1/object/public/bgm/<vibe>/<file>.mp3`
