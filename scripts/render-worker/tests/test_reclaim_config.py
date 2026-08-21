"""The reclaim rule must never put a PAID job back on the queue.

`reclaim_stale_jobs` exists because a worker killed mid-render leaves its row
in 'processing' forever — nothing claims that status, so the job is stranded.
Resetting it to 'pending' is free and correct for Ken Burns and DepthFlow,
which render locally.

It would NOT be free for Seedance. Those rows belong to the seedance worker,
they bill OpenRouter per generation, and they have their own staleness rule
over there. A reclaim from this side could re-submit a paid job that is still
running — the failure would look like a duplicate clip and read as a billing
mystery.

This pins the filter as configuration rather than trusting a comment.
"""

import re
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1] / "worker.py"


def stale_queue_entries():
    """The STALE_QUEUES tuple, read as text.

    Parsed rather than imported: `worker` pulls numpy, requests and a live
    Supabase config at import time, and this needs neither.
    """
    src = WORKER.read_text()
    start = src.index("STALE_QUEUES:")
    end = src.index("\n)\n", start)
    return src[start:end]


def test_clip_tables_are_restricted_to_local_engines():
    block = stale_queue_entries()
    for table in ("listing_photo_clips", "photo_clips"):
        entry = block[block.index(f'"{table}"'):]
        entry = entry[: entry.index("),")]
        assert "engine.eq.depthflow" in entry, f"{table} must filter to local engines"
        assert "engine.eq.kenburns" in entry, f"{table} must filter to local engines"


def test_seedance_is_never_reclaimed():
    assert "engine.eq.seedance" not in stale_queue_entries()


def test_both_clip_tables_are_covered():
    # The home tour's table was the one that stranded a clip; the community's
    # has the identical mechanics and the identical gap.
    block = stale_queue_entries()
    assert '"listing_photo_clips"' in block
    assert '"photo_clips"' in block


def test_both_assembly_tables_are_covered():
    block = stale_queue_entries()
    assert '"listing_tour_assemblies"' in block
    assert '"tour_assemblies"' in block


def test_generated_videos_is_excluded():
    # It has no updated_at — creation is its only clock — so "stuck for 30
    # minutes" cannot be asked of it without a schema change.
    assert '"generated_videos"' not in stale_queue_entries()


def test_the_window_is_generous_enough_for_a_real_render():
    src = WORKER.read_text()
    m = re.search(r"STALE_PROCESSING_SEC = (\d+) \* (\d+)", src)
    assert m, "STALE_PROCESSING_SEC not found"
    seconds = int(m.group(1)) * int(m.group(2))
    # A DepthFlow clip takes minutes, not tens of minutes. Anything under ~10
    # would start reclaiming jobs that are simply still working.
    assert seconds >= 10 * 60
