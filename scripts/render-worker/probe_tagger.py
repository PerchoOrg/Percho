#!/usr/bin/env python3
"""One-shot probe: tag ONE real listing photo through Bedrock and print the tags.

Exists to prove `photo_tagger._call_vision` actually reaches Bedrock on the
instance role after the port off the personal Anthropic key (CLAUDE.md §2.1
rule 0). Writes nothing to the database.

    python3 scripts/render-worker/probe_tagger.py <public-photo-url>
"""
from __future__ import annotations

import json
import sys
import tempfile
import urllib.request
from pathlib import Path

from photo_tagger import MODEL, _call_vision, PER_PHOTO_SYSTEM


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    url = sys.argv[1]
    raw = urllib.request.urlopen(url, timeout=60).read()
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as fh:
        fh.write(raw)
        path = Path(fh.name)

    print(f"model={MODEL}")
    print(f"bytes={len(raw)}")
    tags = _call_vision(PER_PHOTO_SYSTEM, "Photo sort_order=0. Label it.", [raw])
    print(json.dumps(tags, indent=1))
    path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
