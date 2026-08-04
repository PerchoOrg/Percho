#!/usr/bin/env python3
"""Upload local ~/fmls-scrape/photos/{remineId}/{nn}.jpg → Supabase Storage.

Bucket:   listing-photos
Path:     fmls-import/{remineId}/{nn}.jpg   (stage; move to {listing_uuid}/ at import time)

Writes ~/fmls-scrape/photos_manifest.json:
  { remineId: [{ n, storage_path, public_url, bytes }, ...] }
"""
import json, os, sys, mimetypes, urllib.request, urllib.error
from pathlib import Path

BASE = Path.home() / "fmls-scrape"
PHOTOS = BASE / "photos"
MANIFEST = BASE / "photos_manifest.json"

# Load creds from Percho .env.local
ENV = {}
for line in (Path.home() / "Percho" / ".env.local").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k, v = line.split("=", 1)
    ENV[k.strip()] = v.strip().strip('"').strip("'")

SB_URL = ENV["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SB_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "listing-photos"
PREFIX = "fmls-import"

def upload(local: Path, storage_path: str) -> tuple[bool, int]:
    url = f"{SB_URL}/storage/v1/object/{BUCKET}/{storage_path}"
    body = local.read_bytes()
    ct = mimetypes.guess_type(str(local))[0] or "image/jpeg"
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {SB_KEY}",
        "apikey": SB_KEY,
        "Content-Type": ct,
        "x-upsert": "true",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status in (200, 201), len(body)
    except urllib.error.HTTPError as e:
        # 409 = already exists (shouldn't happen w/ x-upsert but be defensive)
        return e.code in (200, 201, 409), len(body)
    except Exception:
        return False, len(body)

def public_url(storage_path: str) -> str:
    return f"{SB_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"

def main():
    manifest = {}
    if MANIFEST.exists():
        try: manifest = json.loads(MANIFEST.read_text())
        except: manifest = {}
    dirs = sorted([d for d in PHOTOS.iterdir() if d.is_dir()])
    total, uploaded, skipped, failed = 0, 0, 0, 0
    for i, d in enumerate(dirs):
        rid = d.name
        entries = manifest.get(rid, [])
        by_path = {e["storage_path"] for e in entries}
        for jpg in sorted(d.glob("*.jpg")):
            n = int(jpg.stem)
            sp = f"{PREFIX}/{rid}/{n:02d}.jpg"
            total += 1
            if sp in by_path:
                skipped += 1; continue
            ok, sz = upload(jpg, sp)
            if ok:
                entries.append({"n": n, "storage_path": sp, "public_url": public_url(sp), "bytes": sz})
                uploaded += 1
            else:
                failed += 1
        manifest[rid] = sorted(entries, key=lambda e: e["n"])
        if (i+1) % 10 == 0 or i == len(dirs)-1:
            MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
            print(f"[{i+1}/{len(dirs)}] {rid} total={total} up={uploaded} skip={skipped} fail={failed}", flush=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"[done] listings={len(dirs)} total_photos={total} uploaded={uploaded} skipped={skipped} failed={failed}")

if __name__ == "__main__":
    main()
