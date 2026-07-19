"""Unit tests for worker.pick_bgm — pure function, no DB/network."""
from __future__ import annotations

import random
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "render-worker"))

import worker  # noqa: E402


def _make_bgm(tmp_path: Path, tracks: dict[str, list[str]]) -> Path:
    """Create a fake BGM dir with subdirs → filenames."""
    root = tmp_path / "bgm"
    root.mkdir()
    for bucket, names in tracks.items():
        d = root / bucket
        d.mkdir(parents=True)
        for n in names:
            (d / n).write_bytes(b"fake")
    return root


def test_pick_bgm_picks_from_warm_acoustic(tmp_path, monkeypatch):
    root = _make_bgm(tmp_path, {
        "warm-acoustic": ["a.mp3", "b.mp3"],
    })
    monkeypatch.setattr(worker, "BGM_DIR", root)
    random.seed(0)
    picked = {worker.pick_bgm().name for _ in range(50)}
    assert picked == {"a.mp3", "b.mp3"}


def test_pick_bgm_ignores_retired_buckets(tmp_path, monkeypatch):
    """Retired buckets exist on disk but must never be picked."""
    root = _make_bgm(tmp_path, {
        "warm-acoustic": ["ok.mp3"],
        "modern-corporate": ["nope.mp3"],
        "luxury-ambient": ["nope2.mp3"],
        "chill-electronic": ["nope3.mp3"],
        "cinematic": ["nope4.mp3"],
        "_archive/tropical": ["bad.mp3"],
    })
    monkeypatch.setattr(worker, "BGM_DIR", root)
    for _ in range(50):
        assert worker.pick_bgm().name == "ok.mp3"


def test_pick_bgm_returns_none_when_bucket_missing(tmp_path, monkeypatch):
    root = tmp_path / "bgm"
    root.mkdir()
    monkeypatch.setattr(worker, "BGM_DIR", root)
    assert worker.pick_bgm() is None


def test_pick_bgm_returns_none_when_bucket_empty(tmp_path, monkeypatch):
    root = _make_bgm(tmp_path, {"warm-acoustic": []})
    monkeypatch.setattr(worker, "BGM_DIR", root)
    assert worker.pick_bgm() is None


def test_pick_bgm_returns_none_when_bgm_dir_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "BGM_DIR", tmp_path / "does-not-exist")
    assert worker.pick_bgm() is None
