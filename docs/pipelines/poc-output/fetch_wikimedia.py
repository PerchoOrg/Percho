#!/usr/bin/env python3
"""Wikimedia Commons fetcher for Peachtree Corners POC."""
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

OUT = Path("/home/ubuntu/Percho/docs/pipelines/poc-output/assets")
OUT.mkdir(parents=True, exist_ok=True)
UA = "PerchoPipelinePOC/0.1 (https://percho.com; contact@percho.com)"
API = "https://commons.wikimedia.org/w/api.php"
S = requests.Session()
S.headers["User-Agent"] = UA

QUERIES = [
    "Peachtree Corners Georgia",
    "Gwinnett County Georgia",
    "Norcross Georgia",
    "Chattahoochee River Georgia",
    "Jones Bridge Park",
]

TARGET = 22

def search_files(q, limit=15):
    r = S.get(API, params={
        "action": "query", "format": "json",
        "generator": "search", "gsrsearch": f"filetype:bitmap {q}",
        "gsrnamespace": 6, "gsrlimit": limit,
        "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime",
        "iiurlwidth": 1600,
    }, timeout=30)
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", {})
    return list(pages.values())

def clean_html(s):
    if not s: return ""
    return re.sub(r"<[^>]+>", "", s).strip()

seen = set()
manifest = []

for q in QUERIES:
    if len(manifest) >= TARGET:
        break
    try:
        pages = search_files(q, limit=12)
    except Exception as e:
        print(f"! query {q}: {e}", file=sys.stderr)
        continue
    for p in pages:
        if len(manifest) >= TARGET: break
        title = p.get("title", "")
        ii = (p.get("imageinfo") or [None])[0]
        if not ii: continue
        mime = ii.get("mime", "")
        if mime not in ("image/jpeg", "image/png"): continue
        url = ii.get("thumburl") or ii.get("url")
        if not url or url in seen: continue
        w, h = ii.get("thumbwidth") or ii.get("width"), ii.get("thumbheight") or ii.get("height")
        if not w or w < 800: continue
        meta = ii.get("extmetadata", {}) or {}
        lic = clean_html((meta.get("LicenseShortName") or {}).get("value", "unknown"))
        author = clean_html((meta.get("Artist") or {}).get("value", "unknown"))
        caption = clean_html((meta.get("ImageDescription") or {}).get("value", title))
        # skip unfree
        if "fair use" in lic.lower() or "non-free" in lic.lower():
            continue
        # download
        ext = ".jpg" if mime == "image/jpeg" else ".png"
        safe = re.sub(r"[^A-Za-z0-9]+", "_", title.replace("File:", ""))[:80] + ext
        dest = OUT / safe
        if not dest.exists():
            try:
                b = S.get(url, timeout=60).content
                dest.write_bytes(b)
                time.sleep(0.3)
            except Exception as e:
                print(f"! dl {url}: {e}", file=sys.stderr)
                continue
        seen.add(url)
        manifest.append({
            "filename": safe,
            "source_url": ii.get("descriptionurl") or url,
            "media_url": url,
            "license": lic,
            "attribution": author,
            "caption": caption[:280],
            "query": q,
            "width": w,
            "height": h,
            "tentative_tag": None,  # tagger will fill
        })
        print(f"+ [{len(manifest):02d}] {safe}  ({lic})")

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
print(f"\nDone: {len(manifest)} assets → {OUT}")
