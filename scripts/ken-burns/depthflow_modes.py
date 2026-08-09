#!/usr/bin/env python3
"""
Parallax move names and the Ken Burns -> parallax mapping.

Split out of depthflow_clip.py so it can be imported (and tested) without
pulling in torch and a depth model.
"""
from __future__ import annotations

# Owner 2026-08-09: orbit_to_subject and rack_focus were rejected from the
# effects catalogue. Everything else in it is available.
MOVES = (
    "orbit_right", "orbit_left", "zoom_in", "zoom_out",
    "tilt_parallax", "dolly_in", "parallax_bloom", "static",
)

# photo_selector.py picks shot-plan modes per room type and knows nothing about
# engines, so the plan is translated here rather than forked.
#
# pan_to_subject loses its subject aim: the parallax move that tracked a bbox
# (orbit_to_subject) was rejected, so it degrades to a plain orbit.
FROM_KENBURNS = {
    "push_in": "dolly_in",
    "push_in_slow": "dolly_in",
    "pull_back": "zoom_out",
    "pan_lr": "orbit_right",
    "pan_rl": "orbit_left",
    "push_pan_lr": "orbit_right",
    "push_pan_rl": "orbit_left",
    "tilt_td": "tilt_parallax",
    "pan_to_subject": "orbit_right",
    "static": "static",
    # v1 names, for the no-shot-plan fallback path.
    "zoom-in": "zoom_in",
    "zoom-out": "zoom_out",
    "pan-lr": "orbit_right",
    "pan-tb": "tilt_parallax",
}


def resolve(mode: str) -> str | None:
    """Parallax move for a shot-plan mode, or None if there is no counterpart."""
    if mode in MOVES:
        return mode
    return FROM_KENBURNS.get(mode)
