"""
06_upload_covers.py — download Nextdoor hero images and upload to
Supabase Storage bucket `community-covers/nextdoor/{slug}.jpg`, then
set `communities.cover_storage_path = 'nextdoor/{slug}.jpg'`.

Loop forever (like the live importer): every 60s, pull rows with
hero_image_url and no cover_storage_path, process a small concurrent
batch, bust the community-cards cache tag, sleep.
"""
from __future__ import annotations
import json, os, pathlib, re, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

import os
HERE = pathlib.Path(__file__).parent
ROOT = pathlib.Path(os.environ.get("SEED_OUT_DIR", str(HERE / "_out")))
REPO_ROOT = HERE.resolve().parents[1]  # scripts/nextdoor-seed → scripts → Percho
LOG_FILE = ROOT / "covers.log"

# --- env ---
env = {}
for line in pathlib.Path(os.environ.get("PERCHO_ENV", str(REPO_ROOT / ".env.local"))).read_text().splitlines():
    m = re.match(r"^\s*([A-Z_]+)\s*=\s*['\"]?([^'\"]*)['\"]?\s*$", line)
    if m: env[m.group(1)] = m.group(2)
SB = env["NEXT_PUBLIC_SUPABASE_URL"]
SK = env["SUPABASE_SERVICE_ROLE_KEY"]

BUCKET = "community-covers"
KEY_PREFIX = "nextdoor"
BATCH = 40
WORKERS = 4
POLL_SLEEP = 60
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")

def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG_FILE.open("a") as f: f.write(line + "\n")

def http(url, method="GET", data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    return urllib.request.urlopen(req, timeout=timeout)

def fetch_pending(limit: int):
    url = (f"{SB}/rest/v1/communities?select=id,slug,hero_image_url"
           f"&hero_image_url=not.is.null"
           f"&cover_storage_path=is.null"
           f"&source=eq.nextdoor"
           f"&limit={limit}")
    r = http(url, headers={"apikey": SK, "Authorization": f"Bearer {SK}"})
    return json.loads(r.read())

def download(hero_url: str) -> bytes | None:
    try:
        r = http(hero_url, headers={"User-Agent": UA, "Accept": "image/*"}, timeout=45)
        b = r.read()
        return b if len(b) > 200 else None
    except Exception as e:
        log(f"  download fail {hero_url[-40:]}: {e}")
        return None

def upload(key: str, body: bytes) -> bool:
    url = f"{SB}/storage/v1/object/{BUCKET}/{key}"
    try:
        http(url, method="POST", data=body, headers={
            "apikey": SK,
            "Authorization": f"Bearer {SK}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        }, timeout=90)
        return True
    except urllib.error.HTTPError as e:
        # 409 = already exists (shouldn't happen w/ x-upsert but tolerate)
        if e.code in (200, 201, 409):
            return True
        log(f"  upload HTTP {e.code}: {e.read()[:150]!r}")
        return False
    except Exception as e:
        log(f"  upload fail: {e}")
        return False

def patch_row(row_id: str, key: str) -> bool:
    url = f"{SB}/rest/v1/communities?id=eq.{row_id}"
    body = json.dumps({"cover_storage_path": key}).encode()
    try:
        http(url, method="PATCH", data=body, headers={
            "apikey": SK, "Authorization": f"Bearer {SK}",
            "Content-Type": "application/json", "Prefer": "return=minimal",
        })
        return True
    except Exception as e:
        log(f"  patch fail {row_id}: {e}")
        return False

def process_one(row: dict) -> tuple[str, bool]:
    slug = row["slug"]
    key = f"{KEY_PREFIX}/{slug}.jpg"
    body = download(row["hero_image_url"])
    if not body: return (slug, False)
    if not upload(key, body): return (slug, False)
    if not patch_row(row["id"], key): return (slug, False)
    return (slug, True)

def revalidate():
    try:
        http("https://www.percho.co/api/admin/revalidate?tag=community-cards",
             method="POST", data=b"", headers={"x-admin-token": SK}, timeout=10)
    except Exception as e:
        log(f"  revalidate fail: {e}")

def main():
    log(f"cover uploader starting (bucket={BUCKET}, batch={BATCH}, workers={WORKERS})")
    total = 0
    while True:
        rows = fetch_pending(BATCH)
        if not rows:
            log(f"no pending covers; total uploaded={total}. sleeping {POLL_SLEEP}s")
            time.sleep(POLL_SLEEP)
            continue
        log(f"processing {len(rows)} covers …")
        ok = fail = 0
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = [ex.submit(process_one, r) for r in rows]
            for f in as_completed(futs):
                _, success = f.result()
                if success: ok += 1
                else: fail += 1
        total += ok
        log(f"  ✓ batch: ok={ok} fail={fail} (total uploaded so far={total})")
        if ok > 0:
            revalidate()
        # brief pause to be gentle
        time.sleep(2)

if __name__ == "__main__":
    main()
