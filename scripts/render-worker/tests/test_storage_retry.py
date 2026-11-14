"""A Storage burst (429 too_many_connections) is ridden out, not fatal."""

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from storage_retry import RETRY_DELAYS_S, with_retry  # noqa: E402


class Resp:
    def __init__(self, status):
        self.status_code = status
        self.closed = False

    def close(self):
        self.closed = True


def run(responses, transient=()):
    calls, slept = [], []

    def attempt():
        calls.append(1)
        nxt = responses.pop(0)
        if isinstance(nxt, BaseException):
            raise nxt
        return nxt

    out = with_retry("test", attempt, transient=transient, sleep=slept.append)
    return out, len(calls), slept


def test_429_then_success_returns_the_success():
    first = Resp(429)
    out, calls, slept = run([first, Resp(429), Resp(200)])
    assert out.status_code == 200
    assert calls == 3
    assert slept == [1, 2]
    assert first.closed


def test_a_client_error_is_not_retried():
    out, calls, slept = run([Resp(404)])
    assert out.status_code == 404
    assert calls == 1
    assert slept == []


def test_gives_back_the_last_429_after_every_delay():
    responses = [Resp(429) for _ in range(len(RETRY_DELAYS_S) + 1)]
    out, calls, slept = run(responses)
    assert out.status_code == 429
    assert calls == len(RETRY_DELAYS_S) + 1
    assert tuple(slept) == RETRY_DELAYS_S


def test_transient_exception_retries_then_reraises():
    out, calls, _ = run([ConnectionError("reset"), Resp(200)], transient=(ConnectionError,))
    assert out.status_code == 200 and calls == 2
    with pytest.raises(ConnectionError):
        run([ConnectionError("x") for _ in range(len(RETRY_DELAYS_S) + 1)], transient=(ConnectionError,))
