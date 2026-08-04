#!/usr/bin/env python3
"""
Phase 94 import — seed 250 FMLS listings into public.listings + public.listing_photos.

Reads:  ~/fmls-scrape/fmls_import.json
Writes: PostgREST upsert into `listings` (on_conflict=source,source_id)
        + fresh insert into `listing_photos`.

Idempotent by design:
  * listings: upsert on (source, source_id) — re-runs update in place.
  * listing_photos: we DELETE existing photos for each listing before re-inserting,
    so re-runs converge on the current fmls_import.json shape.

Uses service_role key — bypasses RLS.  Bucket is separate concept (per
supabase-storage-paths §9): storage_path stays as `fmls-import/{remineId}/{nn}.jpg`.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# Load .env.local
env_path = Path.home() / "Percho" / ".env.local"
env = {}
for line in env_path.read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

H = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def req(method: str, path: str, body=None, extra_headers=None) -> tuple[int, bytes]:
    url = f"{SUPABASE_URL}{path}"
    headers = {**H, **(extra_headers or {})}
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s[:60] or "listing"


def build_listing_row(r: dict) -> dict:
    street = (r.get("address_street") or "").strip()
    city = (r.get("address_city") or "").strip()
    state = (r.get("address_state") or "GA").strip()
    zip_ = (r.get("address_zip") or "").strip() or None
    address = street  # street only; city/state/zip are separate columns

    # description[] — remarks as a single paragraph. Keep short & real.
    remarks = (r.get("remarks") or "").strip()
    description = [remarks] if remarks else []

    slug = f"{slugify(street)}-{r['source_id']}"

    # cover_url — first photo's public URL if we have one.
    photos = r.get("photos") or []
    cover_url = photos[0]["public_url"] if photos else None

    row = {
        "agent_id": None,
        "community_id": None,
        "slug": slug,
        "address": address,
        "city": city,
        "state": state,
        "zip": zip_,
        "price": r.get("list_price"),
        "beds": r.get("beds"),
        "baths": r.get("baths_full"),
        "sqft": r.get("total_sqft"),
        "year_built": r.get("year_built"),
        "description": description,
        "status": "active",
        "cover_url": cover_url,
        # external attribution
        "external_agent_name": r.get("list_agent"),
        "external_agent_phone": r.get("list_agent_phone"),
        "external_office": r.get("list_office"),
        "source": r["source"],
        "source_id": r["source_id"],
        "published_at": "now()",
    }
    # published_at must be timestamp — we'll drop it; DB default is null anyway
    row.pop("published_at")
    return row


def main():
    data = json.load(open(Path.home() / "fmls-scrape" / "fmls_import.json"))
    print(f"Loading {len(data)} listings…")

    # Filter to only rows with agent info (external XOR check requires external_agent_name).
    rows = [r for r in data if r.get("list_agent")]
    print(f"After agent-name filter: {len(rows)}")

    listing_rows = [build_listing_row(r) for r in rows]

    # Batch upsert 50 at a time.
    ids_by_source_id: dict[str, str] = {}
    B = 50
    for i in range(0, len(listing_rows), B):
        batch = listing_rows[i : i + B]
        code, body = req(
            "POST",
            "/rest/v1/listings?on_conflict=source,source_id",
            body=batch,
            extra_headers={
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
        )
        if code >= 300:
            print(f"UPSERT FAILED batch {i}: {code} {body[:500].decode(errors='replace')}")
            sys.exit(1)
        returned = json.loads(body)
        for row in returned:
            ids_by_source_id[row["source_id"]] = row["id"]
        print(f"  upserted {i + len(batch)}/{len(listing_rows)}")

    print(f"listings: {len(ids_by_source_id)} rows in DB")

    # Photos.  Wipe + re-insert per listing so re-runs converge.
    total_photos = 0
    for i, r in enumerate(rows):
        listing_id = ids_by_source_id.get(r["source_id"])
        if not listing_id:
            continue
        photos = r.get("photos") or []
        if not photos:
            continue

        # Delete any existing photo rows for this listing.
        req(
            "DELETE",
            f"/rest/v1/listing_photos?listing_id=eq.{listing_id}",
        )

        photo_rows = [
            {
                "listing_id": listing_id,
                "storage_path": p["storage_path"],
                "status": "ready",
                "sort_order": p["position"],
            }
            for p in photos
        ]
        code, body = req(
            "POST",
            "/rest/v1/listing_photos",
            body=photo_rows,
            extra_headers={"Prefer": "return=minimal"},
        )
        if code >= 300:
            print(f"  PHOTOS FAIL {r['source_id']}: {code} {body[:300].decode(errors='replace')}")
            continue
        total_photos += len(photo_rows)
        if (i + 1) % 25 == 0:
            print(f"  photos {i + 1}/{len(rows)} (running total {total_photos})")

    print(f"DONE — {len(ids_by_source_id)} listings, {total_photos} photos.")


if __name__ == "__main__":
    main()
