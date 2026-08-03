#!/usr/bin/env python3
"""End-to-end smoke test of the enhance queue: queue ONE photo, claim it, run
the worker's job function, print the resulting row. Read-mostly — it only
touches the single photo it queues.

    /usr/bin/python3 scripts/render-worker/enhance_smoke.py
"""
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("w", HERE / "worker.py")
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

rows = w.sb_get("listing_photos", {"select": "id,storage_path", "limit": "1"})
pid = rows[0]["id"]
w.sb_patch("listing_photos", {"id": f"eq.{pid}"},
           {"enhanced_status": "queued", "enhanced_preset": "default"})
print("queued", pid, flush=True)

job = w.claim_enhance_job()
print("claimed", job[0] if job else None, flush=True)
assert job, "claim_enhance_job returned nothing after queueing"
w.process_enhance_job(*job)

after = w.sb_get("listing_photos", {
    "select": "id,enhanced_status,enhanced_path,enhanced_meta,enhanced_error",
    "id": f"eq.{pid}",
})
print(after)
assert after[0]["enhanced_status"] == "ready", after
assert after[0]["enhanced_path"], after
print("SMOKE OK")
