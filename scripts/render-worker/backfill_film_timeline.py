#!/usr/bin/env python3
"""Record what actually played in tour films assembled before phase366.11.

The worker now writes each played clip's real length back onto
`ordered_clips` (see `film_timeline.py`). Films already on the phone carry the
plan's lengths, so their place label drifts behind the picture — by 16s at the
end of Aberdeen's. This fills them in without re-rendering anything: it picks
each photo's clip the way the assembler does, probes its length, and writes
the timeline only when that timeline adds up to the Stream video's own
duration.

A film that does not add up had a clip re-rendered in place since it was cut,
so today's files are not the ones in it. With `--fit-plan` such a film gets the
plan's durations scaled to the video's real length instead: exact when the plan
was what played (Wild Timber, Towne Village, Windward — plan plus end card is
within 0.2s of the video), an even spread of the difference otherwise.

Usage (from the repo root, with the render venv):
    python3 scripts/render-worker/backfill_film_timeline.py <table> <assembly-id> [...]
    python3 scripts/render-worker/backfill_film_timeline.py <table> <assembly-id> --apply
    python3 scripts/render-worker/backfill_film_timeline.py <table> <assembly-id> --apply --fit-plan

<table> is tour_assemblies or city_tour_assemblies.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import worker  # noqa: E402  (loads .env.local)
from film_timeline import played_timeline  # noqa: E402
from xfade import crossfade_total  # noqa: E402

TOLERANCE_S = 0.25


def probe(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True, timeout=15,
    )
    return float(out.stdout.strip())


def stream_duration(uid: str) -> float:
    r = requests.get(
        f"https://api.cloudflare.com/client/v4/accounts/{worker.CF_ACCOUNT}/stream/{uid}",
        headers={"Authorization": f"Bearer {worker.CF_TOKEN}"},
        timeout=30,
    )
    r.raise_for_status()
    return float(r.json()["result"]["duration"])


def fit_plan(ordered: list[dict], film_s: float, end_card_s: float) -> dict[int, float]:
    """The plan's durations, scaled so the film they describe is `film_s` long."""
    xfades = 0.5 * (len(ordered) - 1)
    planned = sum(c.get("duration_s") or 0 for c in ordered)
    scale = (film_s - end_card_s + xfades) / planned
    return {i: (c.get("duration_s") or 0) * scale for i, c in enumerate(ordered)}


def backfill(table: str, assembly_id: str, apply: bool, fit: bool) -> None:
    [row] = worker.sb_get(table, {"select": "id,cf_stream_uid,ordered_clips,created_at", "id": f"eq.{assembly_id}"})
    ordered = row.get("ordered_clips") or []
    wanted = [c["photo_id"] for c in ordered if c.get("photo_id")]
    by_photo: dict[str, list[dict]] = {}
    for start in range(0, len(wanted), 50):
        chunk = wanted[start : start + 50]
        for r in worker.sb_get(
            "photo_clips",
            {
                "select": "photo_id,engine,storage_path,created_at",
                "status": "eq.ready",
                "photo_id": f"in.({','.join(chunk)})",
                "limit": str(len(chunk) * 4),
            },
        ):
            # A clip made after the film was ordered was not in it.
            if r["created_at"] <= row["created_at"]:
                by_photo.setdefault(r["photo_id"], []).append(r)

    played: dict[int, float] = {}
    with tempfile.TemporaryDirectory() as tmp:
        for i, c in enumerate(ordered):
            ready = worker.pick_clip(by_photo.get(c.get("photo_id"), []), c.get("engine") or "kenburns")
            if not ready or not ready.get("storage_path"):
                continue
            bucket = "ai-videos" if ready.get("engine") == "seedance" else "clip-renders"
            dest = Path(tmp) / f"{i:02d}.mp4"
            worker.storage_download(bucket, ready["storage_path"], dest)
            played[i] = probe(dest)

    durs = [played[i] for i in sorted(played)]
    expected = crossfade_total(durs, 0.5) + worker.END_CARD_S - worker.END_CARD_FADE
    actual = stream_duration(row["cf_stream_uid"])
    planned = sum(c.get("duration_s") or 0 for c in ordered) - 0.5 * (len(ordered) - 1)
    ok = abs(expected - actual) <= TOLERANCE_S
    print(
        f"{assembly_id[:8]} film {actual:.2f}s | probed {expected:.2f}s | plan {planned:.2f}s"
        f" | skipped {len(ordered) - len(played)} | {'OK' if ok else 'DOES NOT ADD UP'}"
    )
    end_card_s = worker.END_CARD_S - worker.END_CARD_FADE
    if not ok and fit:
        played = fit_plan(ordered, actual, end_card_s)
        print(f"{assembly_id[:8]} fitting the plan to {actual:.2f}s")
    if (ok or fit) and apply:
        timeline = played_timeline(ordered, played, end_card_s)
        worker.sb_patch(table, {"id": f"eq.{assembly_id}"}, {"ordered_clips": timeline})
        print(f"{assembly_id[:8]} written")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("table", choices=[t for t, _, _ in worker.ASSEMBLY_TABLES])
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--fit-plan", action="store_true")
    args = ap.parse_args()
    for assembly_id in args.ids:
        backfill(args.table, assembly_id, args.apply, args.fit_plan)


if __name__ == "__main__":
    main()
