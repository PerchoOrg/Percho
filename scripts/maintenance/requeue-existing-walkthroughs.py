#!/usr/bin/env /usr/bin/python3
"""Re-render the walkthrough video for every listing that ALREADY has one.

The "把已经有视频的 listing 重新生成" subset regen — NOT a full batch over the
whole listings table. Use after a renderer / pacing / caption change so every
existing card is consistent with the sample the owner already approved.

    cd ~/Percho
    /usr/bin/python3 scripts/maintenance/requeue-existing-walkthroughs.py                 # dry run
    /usr/bin/python3 scripts/maintenance/requeue-existing-walkthroughs.py --apply
    #   --skip <listing_id>   exclude a listing (e.g. the approved sample)

ORDER MATTERS (see skill percho-video-pipeline § batch regen):
  1. DELETE the Cloudflare Stream videos FIRST — once the DB row is gone the
     uid is unrecoverable and the video keeps billing against the quota.
  2. DELETE the listing_videos rows.
  3. Clear in-flight render_jobs on those listings, else the worker processes a
     job pointing at a deleted video_row_id and marks it failed.
  4. Insert placeholder listing_videos rows (external_url sentinel is required
     by listing_videos_source_present_check; the worker nulls it on completion).
  5. Insert render_jobs rows pairing listing_id + the new video_row_id.

Guard: <3 photos crashes the renderer ("shot plan matched zero photos") — those
are skipped, never queued.

The new row goes in at sort_order=0 because apps/web/lib/feed/vertical-videos.ts
orders sort_order ASC and keeps only the first row per listing. A row parked at
99 is invisible to the app.

Confirm a worker is alive first, or jobs sit queued forever:
    systemctl is-active percho-render-worker
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / ".env.local"
MIN_PHOTOS = 3
UID_COLUMNS = ("cf_video_id", "cf_video_id_landscape", "cf_video_id_square")


def load_env() -> dict[str, str]:
    env = {}
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip("'").strip('"')
    return env


def main() -> None:
    apply = "--apply" in sys.argv
    skip = {sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--skip"}

    env = load_env()
    sb = env["NEXT_PUBLIC_SUPABASE_URL"]
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    cf_account = env["CLOUDFLARE_ACCOUNT_ID"]
    cf_token = env["CLOUDFLARE_STREAM_API_TOKEN"]

    hdr = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    def call(method: str, path: str, body: dict | None = None, prefer: str | None = None):
        h = dict(hdr)
        if prefer:
            h["Prefer"] = prefer
        req = urllib.request.Request(
            f"{sb}/rest/v1/{path}",
            data=json.dumps(body).encode() if body is not None else None,
            headers=h,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()[:300]

    _, rows = call(
        "GET",
        "listing_videos?kind=eq.walkthrough"
        "&select=id,listing_id,sort_order,status,title," + ",".join(UID_COLUMNS)
        + "&order=listing_id,sort_order",
    )

    by_listing: dict[str, list] = {}
    for r in rows:
        by_listing.setdefault(r["listing_id"], []).append(r)

    print(f"{len(rows)} walkthrough rows across {len(by_listing)} listings")

    plan = []
    for lid, group in sorted(by_listing.items()):
        if lid in skip:
            print(f"  SKIP {lid[:8]} — --skip")
            continue
        _, photos = call("GET", f"listing_photos?listing_id=eq.{lid}&select=id")
        if len(photos) < MIN_PHOTOS:
            print(f"  SKIP {lid[:8]} — only {len(photos)} photos")
            continue
        plan.append((lid, group, len(photos)))

    print(f"eligible: {len(plan)}/{len(by_listing)} listings")
    if not apply:
        for lid, group, n in plan:
            uids = [u for r in group for c in UID_COLUMNS if (u := r.get(c))]
            print(f"  would regen {lid[:8]} ({n} photos, drops {len(group)} row(s), "
                  f"cf={[u[:10] for u in uids]})")
        print("\ndry run — pass --apply to execute")
        return

    # 1. CF deletes BEFORE the DB rows go away.
    for lid, group, _ in plan:
        for r in group:
            for col in UID_COLUMNS:
                uid = r.get(col)
                if not uid:
                    continue
                req = urllib.request.Request(
                    f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/stream/{uid}",
                    headers={"Authorization": f"Bearer {cf_token}"},
                    method="DELETE",
                )
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        code = resp.status
                except urllib.error.HTTPError as e:
                    code = e.code  # 404 = already gone
                print(f"CF delete {uid[:12]} ({col}) → {code}")

    # 2. old video rows
    for lid, group, _ in plan:
        for r in group:
            code, _b = call("DELETE", f"listing_videos?id=eq.{r['id']}")
            print(f"DB delete video row {r['id'][:8]} → {code}")

    # 3. in-flight jobs on those listings
    ids = ",".join(lid for lid, _, _ in plan)
    code, _b = call(
        "DELETE", f"render_jobs?listing_id=in.({ids})&status=in.(queued,running)"
    )
    print(f"cleared in-flight render_jobs → {code}")

    # 4 + 5. sequential on purpose: claim_job() orders by created_at, so
    # parallel inserts randomize queue order.
    queued = 0
    for lid, _group, n in plan:
        code, ins = call(
            "POST",
            "listing_videos",
            {
                "listing_id": lid,
                "kind": "walkthrough",
                "status": "processing",
                "external_url": "pending://render",
                "sort_order": 0,
                "title": "Home tour (auto-generated)",
            },
            prefer="return=representation",
        )
        if code >= 300:
            print(f"FAILED placeholder {lid[:8]}: {code} {ins}")
            continue
        video_row_id = ins[0]["id"]
        code, job = call(
            "POST",
            "render_jobs",
            {"listing_id": lid, "video_row_id": video_row_id, "status": "queued"},
            prefer="return=representation",
        )
        if code >= 300:
            print(f"FAILED job {lid[:8]}: {code} {job}")
            continue
        queued += 1
        print(f"queued {lid[:8]} ({n} photos)")

    print(f"\n{queued} jobs queued — worker renders sequentially, ~2-3 min each")
    print("poll: render_jobs?select=id,listing_id,status,error&order=created_at.desc")


if __name__ == "__main__":
    main()
