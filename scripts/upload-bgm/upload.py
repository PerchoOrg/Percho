#!/usr/bin/env python3
"""
Upload the render-worker BGM library to Supabase Storage so the /admin/bgm
console can stream tracks in the browser.

Source of truth: on-disk `scripts/render-worker/bgm/<bucket>/*.mp3` (mp3s
are gitignored — this dir on the render EC2 host is where they live).
Destination: Supabase Storage bucket `bgm`, path `<vibe-bucket>/<file>.mp3`.

The script:
  1. Ensures the `bgm` Storage bucket exists and is PUBLIC (read-only for
     anon; writes still go through service role).
  2. Walks each vibe bucket dir under `scripts/render-worker/bgm/` (skipping
     `_archive/`) and uploads any mp3 that isn't already present.
  3. Regenerates `scripts/render-worker/bgm/manifest.json` from disk truth
     so the admin page can list what's actually available.

Idempotent — re-runs skip existing objects (checked by HEAD on public URL).
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
from urllib.parse import quote

import requests

HERE = pathlib.Path(__file__).parent.resolve()
REPO_ROOT = HERE.parents[1]
BGM_ROOT = REPO_ROOT / "scripts" / "render-worker" / "bgm"

# Load env from repo .env.local (dotenv-free — parse manually to avoid dep).
ENV_PATH = pathlib.Path(os.environ.get("PERCHO_ENV", str(REPO_ROOT / ".env.local")))
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "bgm"

HEADERS = {
    "apikey": SERVICE_ROLE,
    "Authorization": f"Bearer {SERVICE_ROLE}",
}


def ensure_bucket() -> None:
    """Create the bucket as PUBLIC if it doesn't exist."""
    r = requests.get(f"{SUPABASE_URL}/storage/v1/bucket/{BUCKET}", headers=HEADERS, timeout=20)
    if r.status_code == 200:
        info = r.json()
        if not info.get("public"):
            print(f"WARN  bucket exists but is private; making public")
            requests.put(
                f"{SUPABASE_URL}/storage/v1/bucket/{BUCKET}",
                headers={**HEADERS, "Content-Type": "application/json"},
                json={"public": True},
                timeout=20,
            ).raise_for_status()
        return
    # Supabase returns HTTP 400 with body {"statusCode":"404","error":"Bucket not found"}
    # for missing buckets — check the body, not the outer HTTP code.
    body_says_missing = False
    try:
        j = r.json()
        body_says_missing = str(j.get("statusCode")) == "404" or "not found" in str(j.get("message", "")).lower()
    except Exception:
        pass
    if r.status_code == 404 or body_says_missing:
        print(f"CREATE bucket '{BUCKET}' (public)")
        requests.post(
            f"{SUPABASE_URL}/storage/v1/bucket",
            headers={**HEADERS, "Content-Type": "application/json"},
            json={"id": BUCKET, "name": BUCKET, "public": True},
            timeout=20,
        ).raise_for_status()
        return
    r.raise_for_status()


def object_exists(path: str) -> bool:
    """HEAD the public URL — 200 means already uploaded."""
    r = requests.head(
        f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{quote(path)}",
        timeout=15,
    )
    return r.status_code == 200


def upload(path: str, mp3: pathlib.Path) -> None:
    with mp3.open("rb") as fh:
        r = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{quote(path)}",
            headers={
                **HEADERS,
                "Content-Type": "audio/mpeg",
                "x-upsert": "true",
            },
            data=fh,
            timeout=120,
        )
    r.raise_for_status()


def main() -> int:
    if not BGM_ROOT.is_dir():
        print(f"ERR  {BGM_ROOT} not found", file=sys.stderr)
        return 1

    manifest_only = "--manifest-only" in sys.argv[1:]

    if not manifest_only:
        ensure_bucket()

    manifest: dict = {
        "schema_version": 2,
        "description": "Active BGM library streamed from Supabase Storage bucket 'bgm'.",
        "source": "Kevin MacLeod — https://incompetech.com/",
        "license": "CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Music: Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License",
        "storage_bucket": BUCKET,
        "buckets": {},
    }

    total = 0
    for vibe_dir in sorted(BGM_ROOT.iterdir()):
        if not vibe_dir.is_dir() or vibe_dir.name.startswith("_"):
            continue
        vibe = vibe_dir.name
        tracks = sorted(p.name for p in vibe_dir.glob("*.mp3"))
        manifest["buckets"][vibe] = {"count": len(tracks), "tracks": tracks}
        if manifest_only:
            continue
        for name in tracks:
            path = f"{vibe}/{name}"
            if object_exists(path):
                print(f"SKIP  {path}")
                continue
            print(f"UP    {path}")
            upload(path, vibe_dir / name)
            total += 1

    manifest["total_active_tracks"] = sum(b["count"] for b in manifest["buckets"].values())

    manifest_path = BGM_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\nUploaded {total} new tracks. Manifest written: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
