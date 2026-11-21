"""What actually played in an assembled tour, written back onto its clips.

The phone's card names the place on screen from `ordered_clips`: each clip's
`duration_s`, joined with the 0.5s crossfade (`apps/web/lib/feed/tour-segments.ts`).
Those durations were the PLAN's, and the film is cut from whatever clip file is
ready for each photo — a Seedance clip wins over the planned engine, and a
Ken Burns clip rendered for an earlier plan keeps its own length. Aberdeen's
film ran 20s longer than its plan; the 3s end card added 2.4s more to every
film. The label fell behind the picture and stayed behind (owner 2026-11-21:
"照片和location有延迟").

So the worker records what it probed: every played clip's real length, the
clips it skipped, and the end card's share of the runtime on the last played
clip.
"""

from __future__ import annotations

from typing import Any


def played_timeline(
    ordered: list[dict[str, Any]],
    played: dict[int, float],
    end_card_s: float,
) -> list[dict[str, Any]]:
    """`ordered` with each clip's real duration. PURE.

    `played` maps an index into `ordered` to the probed seconds of the clip that
    went into the film; an index missing from it was skipped.
    """
    out: list[dict[str, Any]] = []
    last = None
    for i, clip in enumerate(ordered):
        c = {k: v for k, v in clip.items() if k not in ("skipped", "end_card_s")}
        if i in played:
            c["duration_s"] = round(played[i], 3)
            last = len(out)
        else:
            c["skipped"] = True
        out.append(c)
    if last is not None:
        out[last]["end_card_s"] = round(end_card_s, 3)
    return out
