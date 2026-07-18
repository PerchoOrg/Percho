#!/usr/bin/env python3
"""Upload local photos to Storage bucket k12-school-photos + insert k12_school_photos rows.

Idempotent via UNIQUE(school_id, content_hash). storage_path is bucket-relative
per §9.1: '<gs_school_id>/<sha256[:16]>.jpg'.
"""
import hashlib, json, os, sys, urllib.request, urllib.parse

for line in open("/home/ubuntu/Percho-ws4/.env.local"):
    if "=" in line and not line.startswith("#"):
        k,v = line.strip().split("=",1); os.environ.setdefault(k,v.strip('"').strip("'"))
URL=os.environ["NEXT_PUBLIC_SUPABASE_URL"]; KEY=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H={"apikey":KEY,"Authorization":f"Bearer {KEY}"}
BUCKET="k12-school-photos"


def school_by_gs_id(gsid: str) -> dict | None:
    req = urllib.request.Request(f"{URL}/rest/v1/k12_schools?gs_school_id=eq.{gsid}&select=id,name", headers=H)
    with urllib.request.urlopen(req) as r:
        rows = json.loads(r.read()); return rows[0] if rows else None


def upload_bytes(key: str, body: bytes, content_type: str = "image/jpeg") -> int:
    req = urllib.request.Request(f"{URL}/storage/v1/object/{BUCKET}/{key}", data=body, method="POST",
        headers={**H, "Content-Type": content_type, "x-upsert": "true"})
    with urllib.request.urlopen(req) as r: return r.status


def upsert_photo_row(row: dict) -> dict:
    req = urllib.request.Request(f"{URL}/rest/v1/k12_school_photos?on_conflict=school_id,content_hash",
        data=json.dumps([row]).encode(), method="POST",
        headers={**H, "Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=representation"})
    with urllib.request.urlopen(req) as r: return json.loads(r.read())[0]


def ingest(gs_school_id: str, local_dir: str, source: str, attribution: str,
           status: str = "approved", buckets: list[str] | None = None):
    school = school_by_gs_id(gs_school_id)
    if not school:
        print(f"  ✗ school gs_id={gs_school_id} not in DB"); return
    sid = school["id"]
    n = 0
    for fname in sorted(os.listdir(local_dir)):
        if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")): continue
        body = open(f"{local_dir}/{fname}", "rb").read()
        content_hash = hashlib.sha256(body).hexdigest()
        ext = fname.rsplit(".",1)[-1].lower()
        key = f"{gs_school_id}/{content_hash[:16]}.{ext}"
        try:
            upload_bytes(key, body, f"image/{'jpeg' if ext=='jpg' else ext}")
        except urllib.error.HTTPError as e:
            body_txt = e.read().decode()[:200]
            if "already exists" not in body_txt and "Duplicate" not in body_txt:
                print(f"    upload err {fname}: {e.code} {body_txt}"); continue
        try:
            row = upsert_photo_row({
                "school_id": sid, "source": source,
                "storage_path": key, "content_hash": content_hash,
                "status": status, "attribution": attribution,
                "applicable_buckets": buckets or [],
            })
            print(f"  ✓ {fname} → {key}")
            n += 1
        except urllib.error.HTTPError as e:
            print(f"    row err {fname}: {e.code} {e.read().decode()[:200]}")
    print(f"  {n} photos uploaded for {school['name']}")


if __name__ == "__main__":
    # 5122 三校 curated sets
    ingest("1106", "/tmp/percho-schools/photos/simpson_bing",
           source="bing:patch", attribution="patch.com / Gwinnett County",
           buckets=["academics","community","facility"])
    ingest("1162", "/tmp/percho-schools/photos/pinck_gcps",
           source="gcps", attribution="pinckneyvillems.gcpsk12.org",
           buckets=["facility","academics"])
    ingest("1162", "/tmp/percho-schools/photos/pinck_gdp_soccer",
           source="wayback:gwinnettdailypost", attribution="Gwinnett Daily Post",
           buckets=["sports","community"])
    ingest("1132", "/tmp/percho-schools/photos/norcross_bing",
           source="bing:maxpreps", attribution="maxpreps.com / Norcross Athletics",
           buckets=["sports","community"])
