"""A tagged listing photo must leave the tag step with a verdict, or a reason not to have one.

The home tour shipped without the community tour's initial filtering, so
`listing_photos.review_status` only ever moved when the owner clicked. Every
photo therefore stayed 'pending' and the table's third section — which means
"usable, not chosen" — read as "nothing has judged these" (owner 2026-08-22:
"after fetching and tagging, the photos should be only in approved or rejected
sections, why am i seeing many pending").

What this pins down is the narrowness of the gate. Rejection means "never use
this", so anything the pipeline can still fix — resolution above all — must NOT
reject, and a verdict the owner already gave must survive a re-run.
"""

import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

# `worker` reads its credentials at import time and raises KeyError without
# them. The function under test touches neither network nor DB, so placeholders
# are enough — and they keep this file runnable without a .env.local.
for _key in (
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_STREAM_API_TOKEN",
):
    os.environ.setdefault(_key, "test")

from worker import initial_listing_verdicts  # noqa: E402


def rec(pid, *, usable=True, tags=True, review="pending", w=1500, h=1000, path="a/b.jpg"):
    return {
        "id": pid,
        "review_status": review,
        "cached_ai_tags": {"usable": usable, "room_type": "kitchen"} if tags else None,
        "probe_w": w,
        "probe_h": h,
        "width": w,
        "height": h,
        "storage_path": path,
    }


def test_tagger_unusable_is_rejected():
    assert initial_listing_verdicts([rec("p1", usable=False)]) == [
        ("p1", "rejected", "tagger-unusable")
    ]


def test_usable_photo_is_approved():
    """Approved means eligible for planning, not in the film."""
    assert initial_listing_verdicts([rec("p1")]) == [("p1", "approved", None)]


def test_low_resolution_is_not_a_rejection():
    """Enhancement doubles the edges — a small photo is a rendering problem."""
    assert initial_listing_verdicts([rec("p1", w=480, h=320)]) == [("p1", "approved", None)]


def test_no_file_or_no_pixels_is_rejected():
    assert initial_listing_verdicts([rec("p1", path="")])[0][2].startswith("no stored file")
    assert initial_listing_verdicts([rec("p2", w=0, h=0)])[0][2].startswith("no stored file")


def test_untagged_photo_gets_no_verdict():
    """The tagger is the input. Nothing to judge until it has run."""
    assert initial_listing_verdicts([rec("p1", tags=False)]) == []


def test_owner_verdicts_are_never_overturned():
    decided = [rec("p1", usable=False, review="approved"), rec("p2", review="rejected")]
    assert initial_listing_verdicts(decided) == []


def test_fresh_tags_win_over_the_row():
    """The tag step judges what it just wrote, not the row it read first."""
    stale = rec("p1")
    stale["cached_ai_tags"] = None
    assert initial_listing_verdicts([stale], {"p1": {"usable": False}}) == [
        ("p1", "rejected", "tagger-unusable")
    ]


def test_nothing_is_left_pending():
    """The whole point: after tagging, every tagged photo has a verdict."""
    records = [rec("p1"), rec("p2", usable=False), rec("p3", w=200, h=150)]
    assert {pid for pid, _, _ in initial_listing_verdicts(records)} == {"p1", "p2", "p3"}
