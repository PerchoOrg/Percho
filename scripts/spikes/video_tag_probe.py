#!/usr/bin/env python3
"""
video_tag_probe — can Gemini tag a listing WALKTHROUGH the way photo_tagger
tags a still?

Spike, 2026-09-02. Owner asked what it would cost to "tag videos just like
what we do for photos, so we know how to orchestrate the home tour". A photo
tag is one row about one moment; a 57-second one-take walk through a house is
a TIMELINE, and it carries speech the photos never had. So this asks for both
in one call and prints the result for a human to judge.

Disposable by design (see ARCHITECTURE.md on scripts/spikes). If it proves
out, the shape moves next to photo_tagger.py — which itself started life as
scripts/spikes/vision_tag_listing.py.

Usage:
    pnpm exec python3 scripts/spikes/video_tag_probe.py <file.mp4> [...]
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ENV = Path.home() / "Workspace/Percho/.env.local"
for line in ENV.read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))

# The repo's pinned vision model (.env.local), same as photo_tagger reads for
# stills. Overridable so the spike can price a bigger model against it.
MODEL = os.environ.get("VIDEO_TAG_MODEL", os.environ["GEMINI_VISION_MODEL"])
KEY = os.environ["GEMINI_API_KEY"]

SYSTEM = """You are labeling ONE video from a residential real estate listing, for a video pipeline that already knows how to label still photos.

The video is a phone recording made by the listing agent. It may be a walkthrough (camera moving through rooms), a piece to camera (agent talking, facing the lens), or both. The agent is usually speaking over it.

Return STRICT JSON only, no prose:
{
  "kind": "walkthrough|piece_to_camera|exterior_approach|mixed",
  "agent_on_camera": true/false,
  "summary": "one factual sentence about what this video shows",
  "speech": [
    {"start": 0.0, "end": 4.2, "text": "verbatim transcript of what is said in this window"}
  ],
  "segments": [
    {
      "start": 0.0,
      "end": 6.5,
      "room_type": "exterior|living|kitchen|dining|bedroom|bathroom|office|backyard|pool|balcony|garage|hallway|closet|laundry|basement|stairs|other",
      "caption": "short factual sentence, <=15 words",
      "camera": "walking|pan|static|handheld_unsteady",
      "quality": 0.0-1.0,
      "hero_score": 0.0-1.0,
      "usable": true/false,
      "notes": "short factual"
    }
  ]
}

Rules:
- speech: transcribe VERBATIM what the speaker says, in the language spoken. Split at natural sentence boundaries. Timestamps in seconds from the start of THIS video. Empty array if nobody speaks.
- segments: cut the video where the SUBJECT changes (a new room, stepping outside, turning to face the camera) — not on a fixed clock. A 57-second walk through four rooms is four segments, not one.
- quality: is this window sharp, well lit, steady enough to put in a film? Motion-blurred pans during a fast turn score low.
- hero_score: how well this window could OPEN or close a home tour (0.9+ = a clean exterior approach or a wide bright room; 0.3- = a blank hallway or a blurred whip pan).
- usable=false only for genuinely broken windows (motion smear, black frames, camera pointed at the floor).
- Do not invent speech. If the audio is only footsteps or wind, return "speech": []."""


def tag(path: Path) -> dict:
    data = base64.b64encode(path.read_bytes()).decode()
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{
            "role": "user",
            "parts": [
                {"inlineData": {"mimeType": "video/mp4", "data": data}},
                {"text": f"Label this {path.name} video. JSON only."},
            ],
        }],
        # CLAUDE.md §7: every call caps its output.
        "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 8192},
    }).encode()
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}"
           f":generateContent?key={KEY}")
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=600) as res:
        out = json.loads(res.read())
    elapsed = time.time() - t0
    usage = out.get("usageMetadata", {})
    cand = out["candidates"][0]
    text = "".join(p.get("text", "") for p in cand["content"]["parts"])
    return {"parsed": json.loads(text), "usage": usage, "elapsed": elapsed,
            "finish": cand.get("finishReason")}


def main() -> None:
    for arg in sys.argv[1:]:
        path = Path(arg)
        print(f"\n{'=' * 70}\n{path.name}  ({path.stat().st_size / 1e6:.1f} MB)\n{'=' * 70}")
        try:
            r = tag(path)
        except Exception as err:  # noqa: BLE001 — a spike reports and moves on
            print(f"  FAILED: {err}")
            continue
        u = r["usage"]
        print(f"model={MODEL}  {r['elapsed']:.1f}s  finish={r['finish']}  "
              f"in={u.get('promptTokenCount')} out={u.get('candidatesTokenCount')} "
              f"total={u.get('totalTokenCount')}")
        print(json.dumps(r["parsed"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
