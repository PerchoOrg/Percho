#!/usr/bin/env python3
"""Batched scrape: 400 slug / batch, 1.5s sleep between reqs, 20min cooldown between batches.
Resumable — skips anything already cached in neighborhood_pages/.
Probes with 1 req before each batch; if blocked, cools 30min extra and retries."""
import json, re, time, pathlib, sys, random
import requests

UA_POOL = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]
UA = UA_POOL[0]  # legacy alias, will be overwritten each batch
import os
HERE = pathlib.Path(__file__).parent
D = pathlib.Path(os.environ.get("SEED_OUT_DIR", str(HERE / "_out")))
SEED_JSON = HERE / "seed_slugs.json"
NB = D / "neighborhood_pages"; NB.mkdir(parents=True, exist_ok=True)

BATCH_SIZE = 200
REQ_SLEEP = 1.2           # seconds between requests
COOLDOWN = 5 * 60         # normal cooldown between batches
BLOCKED_COOLDOWN = 30*60  # extra when probe says blocked
MAX_CONSEC_PROBE_FAIL = 2 # after this many probe fails, skip probe and run batch anyway

HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://www.google.com/",
}

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def fetch(session, url):
    for attempt in range(3):
        try:
            r = session.get(url, headers=HEADERS, timeout=30)
            return r.text, r.status_code
        except Exception as e:
            if attempt == 2:
                return None, str(e)
            time.sleep(2 ** attempt)
    return None, "?"

def extract(html):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m: return None
    try:
        nd = json.loads(m.group(1))
        apollo = nd["props"]["pageProps"]["apolloState"]
    except Exception:
        return None
    own_key = next((k for k, v in apollo.items()
                    if k.startswith("Neighborhood:") and v.get("geometry")), None)
    if not own_key: return None
    n = apollo[own_key]
    geom_field = n.get("geometry"); geom_str = None
    if isinstance(geom_field, dict):
        if "__ref" in geom_field:
            g = apollo.get(geom_field["__ref"])
            geom_str = g.get("geometry") if g else None
        else:
            geom_str = geom_field.get("geometry")
    geometry_geojson = None
    if geom_str:
        try: geometry_geojson = json.loads(geom_str)
        except: pass
    centroid = n.get("centroid") or {}
    seo_key = next((k for k in apollo["ROOT_QUERY"] if k.startswith("seoNeighborhood")), None)
    seo = None
    if seo_key:
        v = apollo["ROOT_QUERY"][seo_key]
        seo = apollo.get(v["__ref"]) if isinstance(v, dict) and "__ref" in v else v
    stats = (seo or {}).get("neighborhoodStats") or {}
    faq = (seo or {}).get("neighborhoodFAQ") or []
    map_bounds = (seo or {}).get("mapBounds")
    nearby = []
    for k, v in apollo.items():
        if k.startswith("Neighborhood:") and k != own_key:
            c = v.get("centroid") or {}
            nearby.append({"id": v.get("id"), "slug": v.get("slug"), "name": v.get("shortName"),
                           "city": v.get("city"), "state": v.get("state"),
                           "lat": c.get("latDegrees"), "lng": c.get("lonDegrees")})
    return {
        "id": n.get("id"), "slug": n.get("slug"), "name": n.get("shortName"),
        "display_location": n.get("displayLocation"), "city": n.get("city"),
        "state": n.get("state"), "country": n.get("country"),
        "full_state_name": n.get("fullStateName"),
        "centroid": {"lat": centroid.get("latDegrees"), "lng": centroid.get("lonDegrees")},
        "geometry": geometry_geojson, "map_bounds": map_bounds,
        "residents_count": stats.get("residentsCount"),
        "median_home_value": stats.get("medianHomeValue"),
        "avg_income": stats.get("averageIncome"), "avg_age": stats.get("averageAge"),
        "homeowners_pct": stats.get("percentageHomeowners"),
        "friendliness_score": stats.get("friendlinessScore"),
        "affordability_score": stats.get("affordabilityScore"),
        "family_score": stats.get("familyScore"), "transit_score": stats.get("transitScore"),
        "walk_score": stats.get("walkScore"),
        "description": stats.get("description"), "tagline": stats.get("tagline"),
        "ranking_year": stats.get("rankingYear"),
        "meta_title": (seo or {}).get("metaTitle"),
        "hero_image_url": (seo or {}).get("heroImageUrl"),
        "attributes": (seo or {}).get("attributes") or [],
        "interests": (seo or {}).get("interests") or [],
        "faq": [{"q": f.get("question"), "a": f.get("answer")} for f in faq],
        "nearby": nearby,
    }

def probe(session, slug):
    """Return True if unblocked."""
    html, sc = fetch(session, f"https://nextdoor.com/neighborhood/{slug}/")
    if not html: return False, f"http_err:{sc}"
    ok = "__NEXT_DATA__" in html
    return ok, ("ok" if ok else "captcha")

def main():
    seeds = json.loads((SEED_JSON if SEED_JSON.exists() else D/"seed_slugs.json").read_text())
    total = len(seeds)
    session = requests.Session()
    probe_fail_streak = 0

    while True:
        cached = {p.stem for p in NB.glob("*.json")}
        todo = [s for s in seeds if s["slug"] not in cached]
        done = total - len(todo)
        log(f"=== progress: {done}/{total} done, {len(todo)} remaining ===")
        if not todo:
            log("ALL DONE"); return

        # Rotate UA and refresh session each batch (drops any bad cookies)
        HEADERS["User-Agent"] = random.choice(UA_POOL)
        session = requests.Session()
        log(f"  UA: {HEADERS['User-Agent'][:60]}…")

        # Random probe slug (not always todo[0], which may itself be red-flagged)
        probe_seed = random.choice(todo[:min(50, len(todo))])
        probe_slug = probe_seed["slug"]

        force_run = probe_fail_streak >= MAX_CONSEC_PROBE_FAIL
        if force_run:
            log(f"probe skipped (streak={probe_fail_streak}); running batch anyway")
        else:
            ok, reason = probe(session, probe_slug)
            if not ok:
                probe_fail_streak += 1
                log(f"probe {probe_slug} → {reason} (streak={probe_fail_streak}). Cooling {BLOCKED_COOLDOWN}s")
                time.sleep(BLOCKED_COOLDOWN)
                continue
            log(f"probe {probe_slug} → ok, running batch")
            probe_fail_streak = 0

        # Run batch. Probe result was a real fetch — extract and cache if valid.
        batch = todo[:BATCH_SIZE]
        stats = {"ok":0, "no_geom":0, "no_next_data":0, "http_fail":0}
        t0 = time.time()
        consecutive_fails = 0

        for i, seed in enumerate(batch, 1):
            slug = seed["slug"]
            cache = NB / f"{slug}.json"
            if cache.exists():
                continue
            url = f"https://nextdoor.com/neighborhood/{slug}/"
            html, sc = fetch(session, url)
            if not html:
                stats["http_fail"] += 1; consecutive_fails += 1
            else:
                data = extract(html)
                if not data:
                    stats["no_next_data"] += 1; consecutive_fails += 1
                else:
                    data["source_url"] = url
                    data["scraped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    cache.write_text(json.dumps(data, separators=(",", ":")))
                    if data.get("geometry"): stats["ok"] += 1
                    else: stats["no_geom"] += 1
                    consecutive_fails = 0

            if i % 50 == 0 or i == len(batch):
                elapsed = time.time() - t0
                log(f"  batch [{i}/{len(batch)}] ok={stats['ok']} nogeom={stats['no_geom']} nnd={stats['no_next_data']} httpfail={stats['http_fail']} elapsed={elapsed:.0f}s")

            if consecutive_fails >= 20:
                log(f"  20 consecutive fails — aborting batch early")
                break

            time.sleep(REQ_SLEEP + random.uniform(-0.3, 0.5))

        log(f"batch done in {time.time()-t0:.0f}s. Cooling {COOLDOWN}s")
        time.sleep(COOLDOWN)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("interrupted")
