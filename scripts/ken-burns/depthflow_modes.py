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
# Owner 2026-08-09, on the first depthflow tour: "感觉效果很多你只用了很少".
# It was right — the mapping used to be one-to-one, so every push_in in a tour
# became the same dolly_in, and zoom_in / parallax_bloom were implemented but
# unreachable. Each Ken Burns mode now offers a SHORT LIST of parallax moves
# that read as the same camera intent, and `resolve` rotates through it.
#
# The candidates within a list are interchangeable in intent, not in look:
#   push_in    → dolly_in moves the camera, zoom_in scales, parallax_bloom
#                pushes depth itself — three different ways to close distance.
#   pull_back  → zoom_out retreats; parallax_bloom in reverse opens the room up.
#   pan_lr/rl  → orbit is a lateral camera move, tilt_parallax a vertical one;
#                both reveal occluded geometry, which is the point of parallax.
#
# pan_to_subject loses its subject aim: the parallax move that tracked a bbox
# (orbit_to_subject) was rejected, so it degrades to a plain orbit.
FROM_KENBURNS: dict[str, tuple[str, ...]] = {
    "push_in":       ("dolly_in", "zoom_in", "parallax_bloom"),
    "push_in_slow":  ("dolly_in", "zoom_in"),
    "pull_back":     ("zoom_out", "parallax_bloom"),
    "pan_lr":        ("orbit_right", "tilt_parallax"),
    "pan_rl":        ("orbit_left", "tilt_parallax"),
    "push_pan_lr":   ("orbit_right", "dolly_in"),
    "push_pan_rl":   ("orbit_left", "dolly_in"),
    "tilt_td":       ("tilt_parallax",),
    "pan_to_subject": ("orbit_right", "orbit_left"),
    "static":        ("static",),
    # v1 names, for the no-shot-plan fallback path.
    "zoom-in":       ("zoom_in", "dolly_in"),
    "zoom-out":      ("zoom_out",),
    "pan-lr":        ("orbit_right",),
    "pan-tb":        ("tilt_parallax",),
}

# Which candidate a clip gets is a function of where the clip sits in the tour
# and what room it is, so it is stable for a given listing (same plan in, same
# video out) without a seed to thread through, and two clips that share a mode
# only collide when they also share a room type and an index parity.
def _rotation(room_type: str | None, index: int) -> int:
    return index + sum(ord(c) for c in (room_type or ""))


def resolve(mode: str, room_type: str | None = None, index: int = 0) -> str | None:
    """
    Parallax move for a shot-plan mode, or None if there is no counterpart.

    `room_type` and `index` pick among the candidates for that mode. Callers
    that only want to know whether a mode is renderable can omit both.
    """
    if mode in MOVES:
        return mode
    candidates = FROM_KENBURNS.get(mode)
    if not candidates:
        return None
    return candidates[_rotation(room_type, index) % len(candidates)]


def plan_moves(shots: list[tuple[str, str | None]]) -> list[str | None]:
    """
    Resolve a whole tour at once, given [(mode, room_type), …] in play order.

    Doing it here rather than per clip is what makes the last rule possible:
    when a move would repeat the one before it, take the mode's next candidate
    instead. Two identical moves in a row are the one collision a viewer
    actually notices, and a single clip can't see its neighbour.

    A mode with only one candidate (tilt_td) has nothing to swap to and is left
    alone — a real repeat is still better than a move that contradicts the shot.
    """
    out: list[str | None] = []
    for i, (mode, room_type) in enumerate(shots):
        move = resolve(mode, room_type, i)
        if move is not None and out and move == out[-1]:
            candidates = FROM_KENBURNS.get(mode, ())
            for step in range(1, len(candidates)):
                alt = candidates[(_rotation(room_type, i) + step) % len(candidates)]
                if alt != out[-1]:
                    move = alt
                    break
        out.append(move)
    return out
