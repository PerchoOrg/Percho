#!/usr/bin/env python3
"""E1 fetcher — download 15 Unsplash photos for 3 mock GA listings."""
import os, sys, urllib.request, urllib.error

BASE = os.path.expanduser("~/Percho/docs/pipelines/poc-output/mock-listings")
W = 1080  # portrait-ish for reels

# Curated Unsplash photo IDs (real-estate friendly, free-use).
# (listing_dir, filename, unsplash_photo_id)
PHOTOS = [
    # listing-001 Alpharetta — modern suburban
    ("listing-001-alpharetta", "01-exterior.jpg", "1568605114967-8130f3a36994"),
    ("listing-001-alpharetta", "02-kitchen.jpg",  "1556909114-f6e7ad7d3136"),
    ("listing-001-alpharetta", "03-living.jpg",   "1600585154340-be6161a56a0c"),
    ("listing-001-alpharetta", "04-bedroom.jpg",  "1505693416388-ac5ce068fe85"),
    ("listing-001-alpharetta", "05-backyard.jpg", "1600607687939-ce8a6c25118c"),
    # listing-002 Decatur — 1948 bungalow / Oakhurst walkable
    ("listing-002-decatur",    "01-exterior.jpg", "1518780664697-55e3ad937233"),
    ("listing-002-decatur",    "02-kitchen.jpg",  "1600585154526-990dced4db0d"),
    ("listing-002-decatur",    "03-living.jpg",   "1493809842364-78817add7ffb"),
    ("listing-002-decatur",    "04-bedroom.jpg",  "1522708323590-d24dbb6b0267"),
    ("listing-002-decatur",    "05-backyard.jpg", "1600585154363-67eb9e2e2099"),  # replaced (orig 404)
    # listing-003 Peachtree Corners — new build, larger
    ("listing-003-peachtree-corners", "01-exterior.jpg", "1580587771525-78b9dba3b914"),
    ("listing-003-peachtree-corners", "02-kitchen.jpg",  "1600566753190-17f0baa2a6c3"),
    ("listing-003-peachtree-corners", "03-living.jpg",   "1600210492486-724fe5c67fb0"),
    ("listing-003-peachtree-corners", "04-bedroom.jpg",  "1616486338812-3dadae4b4ace"),
    ("listing-003-peachtree-corners", "05-backyard.jpg", "1591474200742-8e512e6f98f8"),
]

UA = "Mozilla/5.0 (percho-mock-fetcher; docs/pipelines POC only)"
ok = 0
fail = []
for sub, name, pid in PHOTOS:
    out = os.path.join(BASE, sub, name)
    if os.path.exists(out) and os.path.getsize(out) > 5000:
        print(f"skip (exists) {sub}/{name}")
        ok += 1
        continue
    url = f"https://images.unsplash.com/photo-{pid}?w={W}&auto=format&fit=crop&q=80"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read()
        with open(out, "wb") as f:
            f.write(data)
        print(f"ok  {sub}/{name}  {len(data)/1024:.1f}KB")
        ok += 1
    except urllib.error.HTTPError as e:
        print(f"FAIL {sub}/{name}: HTTP {e.code}", file=sys.stderr)
        fail.append((sub, name, e.code))
    except Exception as e:
        print(f"FAIL {sub}/{name}: {e}", file=sys.stderr)
        fail.append((sub, name, str(e)))

print(f"\n{ok}/{len(PHOTOS)} ok, {len(fail)} failed")
sys.exit(0 if ok == len(PHOTOS) else 1)
