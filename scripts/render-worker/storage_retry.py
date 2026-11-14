"""Retry a Supabase Storage request through a connection burst.

Its own module for the same reason `xfade.py` is: it is policy, not I/O, and
`worker.py` cannot be imported by a test without a full environment.

Why it exists (phase313): a tour enqueues 30–40 clips at once, the three
workers download enhanced photos and upload clips together, and Storage
answers the burst with 429 `too_many_connections`. Every such clip used to
fail outright — Northbrooke lost 7 of 23 on 2026-09-21 and 4 of 44 the same
afternoon — and only a manual requeue saved them. A short backoff rides the
burst out instead.
"""

from __future__ import annotations

import time
from typing import Callable, Protocol

#: Statuses worth another try: the burst itself, and a gateway that blinked.
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})

#: Seconds to wait before each retry — about half a minute in all.
RETRY_DELAYS_S: tuple[float, ...] = (1, 2, 4, 8, 16)


class _Response(Protocol):
    status_code: int

    def close(self) -> None: ...


def with_retry(
    op: str,
    attempt: Callable[[], _Response],
    *,
    transient: tuple[type[BaseException], ...] = (),
    sleep: Callable[[float], None] = time.sleep,
    delays: tuple[float, ...] = RETRY_DELAYS_S,
) -> _Response:
    """Run `attempt` until it returns a non-retryable response.

    `attempt` must build its request from scratch each time (re-open the file
    it uploads). A retryable status on the last try is returned, not raised —
    the caller's own `raise_for_status` / error message still reports it. A
    `transient` exception on the last try is re-raised.
    """
    for delay in (*delays, None):
        try:
            r = attempt()
        except transient as exc:
            if delay is None:
                raise
            print(f"[storage] {op}: {type(exc).__name__}, retrying in {delay}s", flush=True)
        else:
            if r.status_code not in RETRY_STATUSES or delay is None:
                return r
            print(f"[storage] {op}: HTTP {r.status_code}, retrying in {delay}s", flush=True)
            r.close()
        sleep(delay)
    raise AssertionError("unreachable")  # the loop always returns or raises
