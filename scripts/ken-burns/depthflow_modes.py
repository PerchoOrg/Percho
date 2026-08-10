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


# Mixed rendering. Owner 2026-08-09: "ken burns 和 depthflow 两种可以混合渲染
# 各取所长". The two engines are good at opposite things and the SAME number
# decides which is which — how much of the photo the canvas cannot show at once:
#
#   Ken Burns   moves the frame across the photo with no artefacts and no depth
#               model. It is what reveals a photo the canvas has to crop.
#   DepthFlow   gives real parallax, but its motion has to stay small — push the
#               offset and occlusion edges stretch (DEVLOG 2026-08-09 21:40) —
#               and it costs a depth inference per photo.
#
# So: a photo with a lot to reveal goes to Ken Burns, and a photo with little to
# reveal spends its clip on depth instead of travel. That is also why the two
# never stack — a DepthFlow clip is chosen precisely because its window has
# nowhere to travel.
PARALLAX_MAX_OVERFLOW = 0.20   # frame-fractions; above this, travel wins
# Owner 2026-08-10: "80%信息量就可以了 要多做一些效果". Less of every clip is
# spent travelling now, so more of them are free to be the effect instead.
PARALLAX_MAX_SHARE = 0.50      # cap render time — depth inference is the cost
PARALLAX_MIN_CLIPS = 2         # every video keeps some parallax, even on square


def pick_engines(overflows: list[float]) -> list[str]:
    """Per-clip engine given each clip's overflow, in play order.

    `overflows` is the fraction of the frame each clip would have to travel to
    reveal its whole photo, on the canvas being rendered — so the same listing
    can mix differently for the iOS square card and the web landscape one.
    That is deliberate: deciding once for both would let the easier canvas
    dictate the harder one.
    """
    n = len(overflows)
    if n == 0:
        return []
    engines = ["kenburns"] * n
    by_overflow = sorted(range(n), key=lambda i: overflows[i])

    def take(candidates: list[int], limit: int) -> int:
        taken = 0
        for i in candidates:
            if taken >= limit:
                break
            # Never adjacent: back to back, the parallax stops reading as an
            # accent. This has to be checked while assigning rather than after
            # — when every photo overflows the same amount the two least-
            # overflowing clips are simply the first two, which are neighbours.
            if engines[i] == "depthflow":
                continue
            if (i > 0 and engines[i - 1] == "depthflow") or \
               (i + 1 < n and engines[i + 1] == "depthflow"):
                continue
            engines[i] = "depthflow"
            taken += 1
        return taken

    budget = max(PARALLAX_MIN_CLIPS, int(n * PARALLAX_MAX_SHARE))
    eligible = [i for i in by_overflow if overflows[i] <= PARALLAX_MAX_OVERFLOW]
    used = take(eligible, budget)

    # Every video keeps some parallax even when nothing qualifies — the square
    # card fed 3:2 photos is exactly that case, and an all-Ken-Burns tour would
    # make "mixed" mixed in name only. The floor deliberately overrides the
    # share cap, which only matters for tours of 3-4 clips.
    if used < PARALLAX_MIN_CLIPS:
        take([i for i in by_overflow if engines[i] != "depthflow"],
             PARALLAX_MIN_CLIPS - used)
    return engines


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
