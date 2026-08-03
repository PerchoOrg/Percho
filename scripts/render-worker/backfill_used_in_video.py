#!/usr/bin/env python3
"""Backfill `listing_photos.used_in_video_at` / `used_clip_index` for listings
that were rendered BEFORE the worker learned to stamp them (2026-08-03 07:24).

Without this, the admin photo table shows "not in video" for every photo of
every already-rendered listing, which reads as a bug even though the render was
fine — it's just that the shot plan was thrown away with the job's temp workdir.

Re-rendering to recover the plan would cost CF encode minutes for nothing.
`build_plan` is pure and seeded on `listing_id`, and every photo's tags are
cached in `listing_photos.ai_tags`, so the plan can be RECOMPUTED exactly.

    /usr/bin/python3 scripts/render-worker/backfill_used_in_video.py           # dry run
    /usr/bin/python3 scripts/render-worker/backfill_used_in_video.py --apply

# ponytail: recompute rather than store the plan historically. If the planner's
# ordering ever changes, old listings' stamps drift until their next render —
# acceptable, since the stamp is provenance for the CURRENT plan anyway.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

spec = importlib.util.spec_from_file_location("w", HERE / "worker.py")
w = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
spec.loader.exec_module(w)  # type: ignore[union-attr]

from photo_selector import build_plan  # noqa: E402


def listings_with_renders() -> list[str]:
    """Listings that have a ready walkthrough — i.e. a render happened."""
    rows = w.sb_get(
        "listing_videos",
        {"select": "listing_id", "kind": "eq.walkthrough", "status": "eq.ready"},
    )
    return sorted({r["listing_id"] for r in rows if r.get("listing_id")})


def plan_for(listing_id: str) -> list[dict] | None:
    listings = w.sb_get(
        "listings", {"select": "id,ai_style", "id": f"eq.{listing_id}"}
    )
    if not listings:
        return None
    style_blob = listings[0].get("ai_style")
    style = (style_blob or {}).get("style", "modern") if isinstance(style_blob, dict) else "modern"

    photos = w.sb_get(
        "listing_photos",
        {
            "select": "id,sort_order,ai_tags,tagged_at",
            "listing_id": f"eq.{listing_id}",
            "order": "sort_order.asc",
        },
    )
    # Same shape build_plan gets inside the worker: the ai_tags blob flattened
    # with id/sort_order injected under both the plain and underscore keys.
    tagged = []
    for p in photos:
        if not p.get("tagged_at") or not isinstance(p.get("ai_tags"), dict):
            continue
        row = dict(p["ai_tags"])
        row["id"] = row["_id"] = p["id"]
        row["sort_order"] = row["_sort_order"] = p["sort_order"]
        tagged.append(row)

    if len(tagged) < 3:
        return None
    return build_plan(tagged, style, listing_id)


def main() -> None:
    apply = "--apply" in sys.argv
    total_stamped = 0

    for lid in listings_with_renders():
        plan = plan_for(lid)
        if plan is None:
            print(f"{lid[:8]}  SKIP (no cached tags / <3 usable)", flush=True)
            continue

        ids = [s["id"] for s in plan if s.get("id")]
        print(f"{lid[:8]}  {len(ids)} clips", flush=True)

        if not apply:
            continue

        # Clear the listing first so a photo the planner no longer picks stops
        # claiming it is in the tour — same order the worker uses.
        w.sb_patch(
            "listing_photos",
            {"listing_id": f"eq.{lid}"},
            {"used_in_video_at": None, "used_clip_index": None},
        )
        stamped_at = w._now_iso()
        for clip_i, pid in enumerate(ids):
            w.sb_patch(
                "listing_photos",
                {"id": f"eq.{pid}"},
                {"used_in_video_at": stamped_at, "used_clip_index": clip_i},
            )
        total_stamped += len(ids)

    if apply:
        print(f"\nstamped {total_stamped} photos")
    else:
        print("\nDry run. Re-run with --apply.")


if __name__ == "__main__":
    main()
