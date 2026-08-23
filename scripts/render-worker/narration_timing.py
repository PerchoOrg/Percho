#!/usr/bin/env python3
"""Where each narration line is spoken, once the real clip lengths are known.

Its own module for the same reason `ken-burns/xfade.py` is: it is arithmetic
that decides whether the film is right, and it should be testable without a
Supabase URL, a Cloudflare token or a TTS call. Importing `worker` costs all
three.

Anchoring each line to its own clip is what keeps narration on the footage it
describes, but on its own it guarantees nothing about the line BEFORE it. While
the model under-wrote its sections there was slack and no line ever reached the
next one's anchor; raising the fill to 92% removed the slack and two lines
started talking over each other (owner 2026-08-21: "before the elementary, tts
overlaps").
"""
from __future__ import annotations

from typing import Any, Callable

# A line must finish before the next one starts, with room to breathe.
NARRATION_MIN_GAP_S = 0.35
# How much a line may be sped up to make it fit. Beyond this it starts to sound
# hurried; below it the change is inaudible.
NARRATION_MAX_TEMPO = 1.15
# Float slop only. A line whose last syllable lands this close to the end card
# is not being cut off.
NARRATION_END_TOLERANCE_S = 0.1


def plan_narration_starts(
    made: list[dict[str, Any]],
    total: float,
    speed_up: Callable[[Any, float, Any], bool],
) -> tuple[list[dict[str, Any]], int, int, int]:
    """Place every line so that none overlaps. Returns (kept, shifted, sped, dropped).

    `made` is a list of {"wav", "start", "dur"}, sorted by start, where `start`
    is the line's anchor — the moment its first clip takes the screen. Mutates
    `start`, `dur` and `wav` in place; `speed_up(src, tempo, dest) -> bool` is
    the atempo re-render, injected so the arithmetic can be tested on its own.

    A line that runs long is sped up, up to NARRATION_MAX_TEMPO, which is
    inaudible at these ratios; if that is not enough the next line starts later
    instead, because arriving half a second late on the right footage beats
    arriving on time underneath someone else.

    A SWEEP, not a scan of neighbours. The version this replaces compared each
    line with the one after it and gave up on `room <= 0` — the case where an
    earlier push has already carried this line past the next anchor, which is
    both the likeliest collision and the worst one. It then did nothing at all:
    no speed-up, and no push for the line it was about to talk over. Bellmoore
    Park's 31-clip cut ended with "Try beloved Breakfast Bar." and "Newtown Dog
    Park is well worth the drive." almost entirely on top of each other (owner
    2026-08-23: "there is overlap of the tts for last two sentences").

    `cursor` is the fix. A line cannot begin before the one before it has
    finished, so an overlap stops being a case to detect and becomes a state
    that cannot be reached.

    The old clamp had the same hole in a quieter form: `min(need, total - dur)`
    could place the next line EARLIER than the collision it was resolving, and
    counted it as shifted either way. A line that cannot finish before the film
    does is now dropped instead — this module already prefers silence to a
    broken line, and half a sentence cut off by the end card is a broken line.
    """
    kept: list[dict[str, Any]] = []
    shifted = sped = dropped = 0
    cursor = 0.0  # the first moment the next line may begin; the whole invariant
    for i, cur in enumerate(made):
        start = max(cur["start"], cursor)
        nxt = made[i + 1] if i + 1 < len(made) else None
        # Deadline: the next line's anchor, or the end of the film.
        deadline = nxt["start"] if nxt else total
        room = deadline - start - (NARRATION_MIN_GAP_S if nxt else 0.0)
        if cur["dur"] > room:
            # `room` can be zero or negative once an earlier line has pushed
            # this one past the anchor it was aiming at. The answer is the same
            # and more urgent: take everything atempo will give.
            wanted = cur["dur"] / room if room > 0 else NARRATION_MAX_TEMPO
            tempo = min(NARRATION_MAX_TEMPO, wanted)
            fast = cur["wav"].with_name(f"{cur['wav'].stem}-fast.wav")
            if tempo > 1.001 and speed_up(cur["wav"], tempo, fast):
                cur["wav"], cur["dur"] = fast, cur["dur"] / tempo
                sped += 1
        if start + cur["dur"] > total + NARRATION_END_TOLERANCE_S:
            # Nowhere left to say it. Silence over these clips, rather than a
            # sentence the end card cuts in half.
            dropped += 1
            continue
        if start > cur["start"] + 0.001:
            shifted += 1
        cur["start"] = start
        kept.append(cur)
        cursor = start + cur["dur"] + NARRATION_MIN_GAP_S
    return kept, shifted, sped, dropped
