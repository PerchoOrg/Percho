#!/usr/bin/env python3
"""Crossfade offsets for an ffmpeg xfade chain.

One implementation, imported by both concat paths. There used to be two: the
one in generate.py (correct) and a copy inlined in the render worker's
tour-assembly step, which appended the offset BEFORE accumulating and so
started the chain at 0. Every transition then fired a full clip early, and
because each xfade truncates the accumulated chain at its offset, the loss
compounds: a 14-clip / 45.5s tour came out **16.6s** — the owner counted six
clips in a film that had fourteen (2026-08-17).

The formula is one line. Owning it in one place is the point.
"""
from __future__ import annotations


def crossfade_offsets(durations: list[float], xfade: float) -> list[float]:
    """Offset for each transition, in play order.

    `offsets[i]` joins the chain of clips 0..i with clip i+1, so there is one
    fewer offset than there are clips. Each is measured from the start of the
    finished timeline:

        offsets[i] = sum(durations[0..i]) - (i + 1) * xfade

    The first is `durations[0] - xfade`, never 0 — at 0 the opening clip is
    replaced by its own transition and every clip after it slides one slot
    earlier.
    """
    offsets: list[float] = []
    acc = 0.0
    for d in durations[:-1]:
        acc += d - xfade
        offsets.append(acc)
    return offsets


def crossfade_total(durations: list[float], xfade: float) -> float:
    """Length of the concatenated result: every clip, minus each overlap."""
    if not durations:
        return 0.0
    return sum(durations) - xfade * (len(durations) - 1)
