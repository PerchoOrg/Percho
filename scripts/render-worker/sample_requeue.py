#!/usr/bin/env python3
"""Enqueue ONE walkthrough re-render as a sample (2026-08-01 caption removal).

Owner rule: 花钱/不可逆的批量作业先跑样本给他看。So this queues a single
listing, leaves the other 9 alone, and does NOT delete the existing CF video —
the old one stays watchable so the pair can be compared side by side.

Usage: /usr/bin/python3 sample_requeue.py <listing_id>
"""
import json
import sys
import urllib.request
from pathlib import Path

ENV = Path.home() / "Percho" / ".env.local"


def load_env() -> dict[str, str]:
    env = {}
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip("'").strip('"')
    return env


def main() -> None:
    listing_id = sys.argv[1]
    env = load_env()
    url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
    hdr = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    def post(path: str, body: dict) -> list:
        req = urllib.request.Request(
            f"{url}/rest/v1/{path}",
            data=json.dumps(body).encode(),
            headers=hdr,
            method="POST",
        )
        return json.load(urllib.request.urlopen(req))

    # `external_url` sentinel is required by listing_videos_source_present_check;
    # the worker nulls it on completion. sort_order 99 keeps the sample out of
    # the way of the real row until it is approved.
    row = post(
        "listing_videos",
        {
            "listing_id": listing_id,
            "kind": "walkthrough",
            "status": "processing",
            "external_url": "pending://render",
            "sort_order": 99,
            "title": "no-caption sample 2026-08-01",
        },
    )[0]
    job = post(
        "render_jobs",
        {"listing_id": listing_id, "video_row_id": row["id"], "status": "queued"},
    )[0]
    print(f"video_row={row['id']}\njob={job['id']}")


if __name__ == "__main__":
    main()
