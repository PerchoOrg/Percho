"""A spent daily TTS quota is told apart from a per-minute rate limit."""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "scripts" / "render-worker"))

from narration_timing import is_daily_quota  # noqa: E402

# The body Google returned on 2026-11-15, abridged.
DAILY = (
    '{"error": {"code": 429, "message": "You exceeded your current quota ... '
    "Quota exceeded for metric: generativelanguage.googleapis.com/"
    'generate_requests_per_model_per_day, limit: 100, model: gemini-3.1-flash-tts", '
    '"details": [{"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}]}]}}'
)
PER_MINUTE = (
    '{"error": {"code": 429, "message": "Quota exceeded for metric: generativelanguage.'
    'googleapis.com/generate_requests_per_model, limit: 10", '
    '"details": [{"violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel"}]}]}}'
)


def test_the_daily_quota_is_recognised():
    assert is_daily_quota(429, DAILY)


def test_a_per_minute_limit_is_not_and_stays_worth_retrying():
    assert not is_daily_quota(429, PER_MINUTE)


def test_only_a_429_can_be_a_quota():
    assert not is_daily_quota(200, DAILY)
    assert not is_daily_quota(500, DAILY)
