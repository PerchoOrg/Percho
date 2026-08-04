#!/usr/bin/env python3
"""Merge sidebar + detail + photo manifest → Percho-import JSON.

Output: ~/fmls-scrape/fmls_import.json
Schema aligned to lib/poi + supabase migrations 0001 + 0011:
  listings row: address_street/city/state/zip, list_price, beds, baths_full,
                total_sqft, lot_sqft, year_built, home_type, hoa_fee,
                list_agent, list_agent_phone, list_office, remarks, mls_number,
                days_on_market, source='fmls', source_id=remineId
  listing_photos: [{ storage_path, public_url, position, bytes }]
"""
import json, re
from pathlib import Path

BASE = Path.home() / "fmls-scrape"
side = {str(r["remineId"]): r for r in json.load(open(BASE / "fmls_north_atl.json"))}
manifest = {}
if (BASE / "photos_manifest.json").exists():
    manifest = json.loads((BASE / "photos_manifest.json").read_text())

def num(x, default=None):
    if x is None: return default
    s = re.sub(r"[^\d.]", "", str(x))
    if not s: return default
    try: return int(float(s)) if "." not in s else float(s)
    except (TypeError, ValueError): return default

def parse_addr(a):
    if not a: return {}
    # "4561 Northside Drive, Sandy Springs, GA 30327"
    m = re.match(r"^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5})", a)
    if m:
        return {"address_street": m.group(1), "address_city": m.group(2),
                "address_state": m.group(3), "address_zip": m.group(4)}
    return {"address_street": a}

def parse_baths(b):
    if not b: return None, None
    # "3 Baths" or "3/1 Baths" — sidebar just says total
    m = re.match(r"(\d+)", str(b))
    return (int(m.group(1)) if m else None), None

out = []
for rid, det_path in [(p.stem, p) for p in (BASE/"details").glob("*.json")]:
    d = json.loads(det_path.read_text())
    if d.get("error"): continue
    s = side.get(rid, {})
    addr = parse_addr(s.get("address"))
    baths_full, _ = parse_baths(s.get("baths"))
    row = {
        "source": "fmls",
        "source_id": rid,
        "mls_number": d.get("mls_number"),
        **addr,
        "list_price": num(s.get("price_usd") or d.get("list_price")),
        "beds": num(s.get("beds_n") or s.get("beds")),
        "baths_full": baths_full,
        "total_sqft": num(s.get("sqft_n") or d.get("total_sqft")),
        "lot_sqft": num(d.get("lot_sqft")),
        "lot_acres": num(d.get("lot_acres")),
        "year_built": num(d.get("year_built")),
        "home_type": d.get("home_type"),
        "levels": d.get("levels"),
        "days_on_market": num(d.get("days_on_market")),
        "hoa_fee": num(d.get("hoa_fee")),
        "hoa_frequency": d.get("hoa_frequency"),
        "list_agent": d.get("list_agent"),
        "list_agent_phone": d.get("list_agent_phone"),
        "list_office": d.get("list_office"),
        "remarks": d.get("remarks"),
        "cooling": d.get("cooling"),
        "heat": d.get("heat"),
        "roof": d.get("roof"),
        "basement": d.get("basement"),
        "construction_materials": d.get("construction_materials"),
        "garage_spaces": num(d.get("garage_spaces")),
        "sewer": d.get("sewer"),
        "water_source": d.get("water_source"),
        "pool_features": d.get("pool_features"),
        "view": d.get("view"),
        "parcel_number": d.get("parcel_number"),
        "photos": [
            {"position": e["n"], "storage_path": e["storage_path"],
             "public_url": e["public_url"], "bytes": e["bytes"]}
            for e in sorted(manifest.get(rid, []), key=lambda x: x["n"])
        ],
        "status": s.get("status"),
        "searched_under": s.get("searchedUnder"),
        "source_url": s.get("url"),
    }
    out.append(row)

out.sort(key=lambda r: r.get("list_price") or 0, reverse=True)
(BASE / "fmls_import.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(f"[merge] wrote {len(out)} listings, {sum(len(r['photos']) for r in out)} photos → fmls_import.json")
