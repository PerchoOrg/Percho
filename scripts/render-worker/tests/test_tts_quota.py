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


from narration_timing import retry_after_s, usable_tts_models  # noqa: E402

MODELS = ("gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts")


def test_the_quota_says_how_long_until_it_reopens():
    assert retry_after_s('"details": [{"@type": "RetryInfo", "retryDelay": "3319s"}]') == 3319
    assert retry_after_s("no delay named") == 3600


def test_a_spent_model_is_skipped_and_the_next_is_tried():
    assert usable_tts_models(MODELS, {}, now=100.0) == list(MODELS)
    spent = {MODELS[0]: 500.0}
    assert usable_tts_models(MODELS, spent, now=100.0) == list(MODELS[1:])


def test_a_spent_model_comes_back_when_its_quota_reopens():
    assert usable_tts_models(MODELS, {MODELS[0]: 500.0}, now=501.0) == list(MODELS)


def test_nothing_is_usable_when_every_model_is_spent():
    assert usable_tts_models(MODELS, dict.fromkeys(MODELS, 500.0), now=100.0) == []
