#!/usr/bin/env python3
"""K-12 school ingest: enriched.json → k12_schools (upsert by gs_school_id).

Idempotent via REST on_conflict=gs_school_id. Extracts gs_school_id from
sourceUrl `/georgia/<city>/<gsid>-<slug>/`. Maps grade_range → level.
"""
import json, os, re, sys, urllib.request

ENV_FILE = "/home/ubuntu/Percho-ws4/.env.local"
for line in open(ENV_FILE):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); os.environ.setdefault(k, v.strip('"').strip("'"))
URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]; KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def infer_level(grade_range: str, name: str) -> str | None:
    g = (grade_range or "").upper()
    n = (name or "").lower()
    if "elementary" in n or re.search(r"\bK[-,]?\s*5\b", g) or "PK, K-5" in g: return "elementary"
    if "middle" in n or re.search(r"\b6[-,]?\s*8\b", g): return "middle"
    if "high" in n or re.search(r"\b9[-,]?\s*12\b", g): return "high"
    if re.search(r"\bK[-,]?\s*8\b", g): return "k8"
    return "other"


def parse_gs_id(url: str) -> str | None:
    m = re.search(r"/(\d+)-[^/]+/?$", url or "")
    return m.group(1) if m else None


def to_row(r: dict) -> dict:
    gsid = parse_gs_id(r["sourceUrl"])
    return {
        "gs_school_id": gsid,
        "name": r["schoolName"],
        "address": r.get("address"),
        "city": r.get("city"), "state": r.get("state", "GA"), "zip": r.get("zip"),
        "district": r.get("district"),
        "lat": r.get("lat"), "lng": r.get("lng"),
        "school_type": r.get("schoolType"),
        "grade_range": r.get("gradeRange"),
        "level": infer_level(r.get("gradeRange", ""), r.get("schoolName", "")),
        "phone": r.get("phone"), "website": r.get("website"),
        "enrollment": r.get("enrollment"),
        "student_teacher_ratio": r.get("studentTeacherRatio"),
        "gs_rating": r.get("gsRating"),
        "parent_rating": r.get("parentRating"),
        "review_count": r.get("reviews"),
        "test_scores": r.get("testScores") or {},
        "source": "greatschools", "source_url": r.get("sourceUrl"),
        "raw": r,
    }


def upsert(rows: list[dict]) -> list[dict]:
    req = urllib.request.Request(
        f"{URL}/rest/v1/k12_schools?on_conflict=gs_school_id",
        data=json.dumps(rows).encode(), method="POST",
        headers={**H, "Prefer": "resolution=merge-duplicates,return=representation"},
    )
    try:
        with urllib.request.urlopen(req) as resp: return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"HTTP {e.code}: {e.read().decode()[:500]}\n"); raise


def main(path: str):
    data = json.load(open(path))
    rows = [to_row(r) for r in data if parse_gs_id(r.get("sourceUrl", ""))]
    print(f"upserting {len(rows)} schools...")
    inserted = upsert(rows)
    for r in inserted:
        print(f"  {r['gs_school_id']:>5}  {r['level']:>10}  gs={r['gs_rating']}  {r['name']}")
    return inserted


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/percho-schools/enriched.json")
