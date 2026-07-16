#!/usr/bin/env python3
"""Pass 1: scrape Atlanta metro city pages → dump neighborhood slug list per city."""
import json, re, time, sys, pathlib, os
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request, gzip

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
HERE = pathlib.Path(__file__).parent
OUT_DIR = pathlib.Path(os.environ.get("SEED_OUT_DIR", str(HERE / "_out")))
CITY_DIR = OUT_DIR / "city_pages"
CITY_DIR.mkdir(parents=True, exist_ok=True)

cities = json.load(open(HERE / "atl_metro_cities.json"))

def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Encoding": "gzip",
                "Accept": "text/html",
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                return data.decode("utf-8", errors="replace"), r.status
        except Exception as e:
            if i == retries - 1:
                return None, str(e)
            time.sleep(2 ** i)
    return None, "unknown"

def parse_city(html, city_name):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    nd = json.loads(m.group(1))
    apollo = nd["props"]["pageProps"]["apolloState"]
    seo_key = next((k for k in apollo["ROOT_QUERY"] if "seoCity" in k), None)
    if not seo_key:
        return None
    ref = apollo["ROOT_QUERY"][seo_key]["__ref"]
    seo = apollo[ref]
    hoods = seo.get("cityNeighborhoodsV2", []) or []
    return {
        "city_name": seo.get("name"),
        "state": seo.get("state"),
        "id": seo.get("id"),
        "centroid": seo.get("centroid"),
        "hero": seo.get("heroImageUrl"),
        "neighborhood_count": len(hoods),
        "neighborhoods": [
            {"title": h["title"], "link": h["link"]}
            for h in hoods
            if h.get("pageType") == "neighborhood"
        ],
    }

def work(city):
    slug_ga = city["url"].split("/city/")[1].rstrip("/")  # e.g. atlanta--ga
    cache = CITY_DIR / f"{slug_ga}.json"
    if cache.exists():
        return slug_ga, json.load(cache.open()), "cached"
    html, status = fetch(city["url"])
    if not html:
        return slug_ga, None, f"http_fail:{status}"
    parsed = parse_city(html, city["name"])
    if not parsed:
        return slug_ga, None, "parse_fail"
    parsed["city_slug"] = slug_ga
    parsed["source_url"] = city["url"]
    cache.write_text(json.dumps(parsed, indent=2))
    time.sleep(0.5)  # gentle
    return slug_ga, parsed, f"ok:{parsed['neighborhood_count']}"

t0 = time.time()
results = {}
with ThreadPoolExecutor(max_workers=6) as ex:
    futures = {ex.submit(work, c): c for c in cities}
    for i, fut in enumerate(as_completed(futures), 1):
        slug, data, status = fut.result()
        results[slug] = data
        print(f"[{i}/{len(cities)}] {slug} → {status}", flush=True)

# Aggregate neighborhood slugs (dedupe)
seen = {}  # slug → {city, title}
for city_slug, data in results.items():
    if not data:
        continue
    for h in data["neighborhoods"]:
        # link: /neighborhood/greentreega--atlanta--ga/
        m = re.match(r"^/neighborhood/(.+?)/?$", h["link"])
        if not m:
            continue
        n_slug = m.group(1)
        if n_slug not in seen:
            seen[n_slug] = {
                "slug": n_slug,
                "title": h["title"],
                "found_via_city": city_slug,
                "url": f"https://nextdoor.com/neighborhood/{n_slug}/",
            }

manifest = {
    "cities_attempted": len(cities),
    "cities_ok": sum(1 for v in results.values() if v),
    "unique_neighborhoods": len(seen),
    "elapsed_sec": round(time.time() - t0, 1),
    "neighborhoods": sorted(seen.values(), key=lambda x: x["slug"]),
}
(OUT_DIR / "neighborhoods_to_scrape.json").write_text(json.dumps(manifest, indent=2))
print(f"\n=== DONE ===")
print(f"cities ok: {manifest['cities_ok']}/{manifest['cities_attempted']}")
print(f"unique neighborhoods: {manifest['unique_neighborhoods']}")
print(f"elapsed: {manifest['elapsed_sec']}s")
