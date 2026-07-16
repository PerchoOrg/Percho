#!/usr/bin/env python3
"""Live incremental importer. Watches neighborhood_pages/ and upserts new
Nextdoor scrapes into Percho `communities`. Skips anything already in DB
(by nextdoor_id). Runs until the batched scraper finishes (all 8679 cached)
or you kill it.
"""
import json, os, re, pathlib, sys, time, urllib.request, urllib.error

import os
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
env_path = pathlib.Path(os.environ.get("PERCHO_ENV", str(REPO_ROOT / ".env.local")))
env = {}
for line in env_path.read_text().splitlines():
    m = re.match(r"^\s*([A-Z_]+)\s*=\s*['\"]?([^'\"]*)['\"]?\s*$", line)
    if m: env[m.group(1)] = m.group(2)

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_KEY  = env["SUPABASE_SERVICE_ROLE_KEY"]
SEED_DIR     = pathlib.Path(os.environ.get("SEED_OUT_DIR", str(pathlib.Path(__file__).parent / "_out"))) / "neighborhood_pages"
TOTAL_TARGET = 8679

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation",
}
GET_HEADERS = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

BATCH_TRIGGER = 200         # upsert once we have ≥ this many new rows queued
IDLE_POLL_SEC = 60          # check for new files every N sec
FLUSH_AFTER_SEC = 15 * 60   # even if we don't hit 200, flush after this long

def log(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def slugify(s): 
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:80] or "unnamed"

def clean_score(x):
    if x is None: return None
    m = re.search(r"-?\d+", str(x))
    return int(m.group()) if m else None

def build_row(d, existing_slugs):
    base = slugify(d.get("name") or d["slug"])
    slug = base; i = 2
    while slug in existing_slugs:
        slug = f"{base}-{i}"; i += 1
    existing_slugs.add(slug)
    c = d.get("centroid") or {}
    return {
        "slug": slug,
        "name": d.get("name") or d["slug"],
        "city": d.get("city") or "Atlanta",
        "state": d.get("state") or "GA",
        "description": d.get("description"),
        "status": "active",  # go live immediately for demo
        "source": "nextdoor",
        "nextdoor_id": d.get("id"),
        "nextdoor_slug": d.get("slug"),
        "nextdoor_url": d.get("source_url"),
        "seeded_at": d.get("scraped_at"),
        "lat": c.get("lat"), "lng": c.get("lng"),
        "boundary": d.get("geometry"),
        "boundary_source": "nextdoor" if d.get("geometry") else None,
        "residents_count": d.get("residents_count"),
        "median_home_value": d.get("median_home_value"),
        "avg_income": d.get("avg_income"),
        "avg_age": d.get("avg_age"),
        "homeowners_pct": d.get("homeowners_pct"),
        "attributes": d.get("attributes") or None,
        "interests": d.get("interests") or None,
        "hero_image_url": d.get("hero_image_url"),
        "nearby": d.get("nearby") or None,
    }

def fetch_existing():
    """Return set of existing nextdoor_ids and existing slugs in DB."""
    ids = set(); slugs = set()
    offset = 0
    while True:
        u = f"{SUPABASE_URL}/rest/v1/communities?select=nextdoor_id,slug&limit=1000&offset={offset}"
        req = urllib.request.Request(u, headers=GET_HEADERS)
        rows = json.loads(urllib.request.urlopen(req, timeout=60).read())
        if not rows: break
        for r in rows:
            if r.get("nextdoor_id") is not None: ids.add(str(r["nextdoor_id"]))
            if r.get("slug"): slugs.add(r["slug"])
        if len(rows) < 1000: break
        offset += 1000
    return ids, slugs

def upsert(rows, chunk=50):
    url = f"{SUPABASE_URL}/rest/v1/communities?on_conflict=nextdoor_id"
    total = 0
    for i in range(0, len(rows), chunk):
        body = json.dumps(rows[i:i+chunk]).encode()
        req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                total += len(json.loads(r.read()))
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:500]
            log(f"  upsert HTTP {e.code}: {err}")
    return total

def main():
    log("fetching existing nextdoor_ids + slugs from Percho …")
    existing_ids, existing_slugs = fetch_existing()
    log(f"existing: {len(existing_ids)} nextdoor_ids, {len(existing_slugs)} slugs")

    imported_files = set()  # file paths we've handled this run
    queue = []              # rows waiting to upsert
    last_flush = time.time()
    total_imported_run = 0

    while True:
        cached_files = sorted(SEED_DIR.glob("*.json"))
        cached_count = len(cached_files)
        new_this_pass = 0

        for p in cached_files:
            if p in imported_files: continue
            try:
                d = json.loads(p.read_text())
            except Exception:
                continue
            nid = d.get("id")
            if not nid:
                imported_files.add(p); continue
            if str(nid) in existing_ids:
                imported_files.add(p); continue
            row = build_row(d, existing_slugs)
            queue.append(row)
            existing_ids.add(str(nid))
            imported_files.add(p)
            new_this_pass += 1

        should_flush = (
            len(queue) >= BATCH_TRIGGER or
            (queue and (time.time() - last_flush) >= FLUSH_AFTER_SEC) or
            (queue and cached_count >= TOTAL_TARGET)  # scraper done
        )

        if should_flush:
            log(f"upserting {len(queue)} new rows (DB total after: {len(existing_ids)}, cached files: {cached_count}/{TOTAL_TARGET})")
            n = upsert(queue)
            total_imported_run += n
            log(f"  ✓ upserted {n} rows this batch, {total_imported_run} total this session")
            # Phase 89.1: bust /communities Next.js cache tag
            try:
                r = urllib.request.Request(
                    "https://www.percho.co/api/admin/revalidate?tag=community-cards",
                    data=b"", method="POST",
                    headers={"x-admin-token": SERVICE_KEY},
                )
                urllib.request.urlopen(r, timeout=10).read()
                log(f"  ✓ revalidated community-cards")
            except Exception as e:
                log(f"  ⚠ revalidate failed: {e}")
            queue = []
            last_flush = time.time()
        else:
            if new_this_pass:
                log(f"queued +{new_this_pass}  (queue={len(queue)}, cached={cached_count}/{TOTAL_TARGET})")

        # Exit condition: scraper done AND queue empty
        if cached_count >= TOTAL_TARGET and not queue:
            log(f"scraper finished ({cached_count} cached), queue empty. DONE.")
            log(f"session imported total: {total_imported_run}")
            return

        time.sleep(IDLE_POLL_SEC)

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: log("interrupted")
