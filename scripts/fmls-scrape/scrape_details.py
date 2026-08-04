#!/usr/bin/env python3
"""Scrape FMLS detail pages via Playwright AND download photos inline.

Photos have session-bound `ust=` tokens, so we MUST fetch them from within
the same Playwright browser context that scraped the page (page.context.request
uses browser cookies + no CORS enforcement).

Reads ~/fmls-scrape/ids.json.
Writes:
  ~/fmls-scrape/details/{id}.json  — extracted fields incl. photo_urls
  ~/fmls-scrape/photos/{id}/{n:02d}.jpg
Resumable.
"""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = Path.home() / "fmls-scrape"
OUT_DETAIL = BASE / "details"
OUT_PHOTOS = BASE / "photos"
OUT_DETAIL.mkdir(parents=True, exist_ok=True)
OUT_PHOTOS.mkdir(parents=True, exist_ok=True)
IDS = json.load(open(BASE / "ids.json"))

EXTRACT_JS = r"""
async () => {
  for (let i=0; i<60; i++) {
    if (document.body.innerText.includes('LISTING AGENT INFO')) break;
    await new Promise(r=>setTimeout(r,300));
  }
  const ensureOpen = async (tab, sentinel) => {
    if (document.body.innerText.includes(sentinel)) return;
    const b = [...document.querySelectorAll('button')].filter(x=>x.innerText?.trim()===tab).find(x=>x.offsetParent);
    if (b) { b.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,400)); b.click(); await new Promise(r=>setTimeout(r,1800)); }
  };
  await ensureOpen('Listing Details','Key Stats');
  await ensureOpen('Public Record','Year Built');
  await new Promise(r=>setTimeout(r,500));

  const text = document.body.innerText;
  const grab = (label) => {
    const re = new RegExp('(^|\\n)' + label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\n([^\\n]+)');
    const m = text.match(re);
    return m ? m[2].trim() : null;
  };
  const photos = [...new Set([...document.querySelectorAll('img')].map(i=>i.src).filter(s=>s.includes('rets.fmlsd')))];
  const rIdx = text.indexOf('\nRemarks\n');
  let remarks = null;
  if (rIdx >= 0) {
    const after = text.slice(rIdx + 9);
    const endMarkers = ['\nValuation\n','\nMap View\n','\nCommute Time\n','\nWhat You','\nListing Details\n'];
    let cut = after.length;
    for (const m of endMarkers){ const i = after.indexOf(m); if(i>0 && i<cut) cut = i; }
    remarks = after.slice(0, cut).trim();
  }
  return {
    mls_number: grab('MLS#'),
    list_price: grab('List Price'),
    days_on_market: grab('Days On Market'),
    year_built: grab('Year Built'),
    lot_acres: grab('Acres'),
    lot_sqft: grab('Lot SqFt'),
    home_type: grab('Land Use'),
    parcel_number: grab('Parcel Number'),
    total_sqft: grab('Total Finished') || grab('Total SqFt'),
    levels: grab('Levels'),
    foundation: grab('Foundation Materials'),
    roof: grab('Roof'),
    basement: grab('Basement'),
    construction_materials: grab('Construction Materials'),
    garage_spaces: grab('Garage Spaces'),
    heat: grab('Heat'),
    cooling: grab('Cooling'),
    sewer: grab('Sewer'),
    water_source: grab('Water Source'),
    view: grab('View'),
    pool_features: grab('Pool Features'),
    hoa_fee: grab('HOA Fee') || grab('Fee'),
    hoa_frequency: grab('HOA Fee Frequency') || grab('Fee Frequency'),
    list_agent: grab('List Agent'),
    list_office: grab('List Office'),
    list_agent_phone: grab('Attribution Contact'),
    remarks,
    photo_urls: photos,
    photo_count: photos.length,
  };
}
"""

def main():
    todo = []
    for i in IDS:
        det = OUT_DETAIL / f"{i}.json"
        pdir = OUT_PHOTOS / i
        # Re-process if either detail or photos missing/incomplete
        if not det.exists():
            todo.append(i)
            continue
        d = json.loads(det.read_text())
        if d.get("error"):
            todo.append(i); continue
        need = len(d.get("photo_urls") or [])
        have = len(list(pdir.glob("*.jpg"))) if pdir.exists() else 0
        if have < need:
            todo.append(i)
    print(f"[start] total={len(IDS)} todo={len(todo)}", flush=True)
    if not todo:
        print("[done]"); return

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(user_agent=(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ), viewport={"width":1400,"height":900})
        page = ctx.new_page()

        print("[warmup]", flush=True)
        page.goto("https://gofmls.remine.com/search", wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(3000)

        t0 = time.time()
        for i, rid in enumerate(todo):
            try:
                page.goto(f"https://gofmls.remine.com/search/listings/fmls/{rid}",
                          wait_until="domcontentloaded", timeout=30000)
                data = page.evaluate(EXTRACT_JS)
                data["remineId"] = rid
                (OUT_DETAIL / f"{rid}.json").write_text(json.dumps(data, ensure_ascii=False))

                # Download photos via same context
                pdir = OUT_PHOTOS / rid
                pdir.mkdir(exist_ok=True)
                good, bad = 0, 0
                for n, url in enumerate(data.get("photo_urls") or []):
                    fp = pdir / f"{n:02d}.jpg"
                    if fp.exists() and fp.stat().st_size > 500:
                        good += 1
                        continue
                    try:
                        r = ctx.request.get(url, timeout=20000,
                                             headers={"Referer": "https://gofmls.remine.com/"})
                        body = r.body()
                        if r.status == 200 and len(body) > 500:
                            fp.write_bytes(body)
                            good += 1
                        else:
                            bad += 1
                    except Exception:
                        bad += 1

                elapsed = time.time() - t0
                rate = (i+1) / elapsed
                eta = (len(todo) - i - 1) / rate if rate > 0 else 0
                print(f"[{i+1}/{len(todo)}] {rid} yb={data.get('year_built')} agent={data.get('list_agent')} ph={data.get('list_agent_phone')} photos={good}/{good+bad} eta={eta/60:.1f}m",
                      flush=True)
            except Exception as e:
                print(f"[{i+1}/{len(todo)}] {rid} ERROR: {e}", flush=True)
                (OUT_DETAIL / f"{rid}.json").write_text(json.dumps({"remineId": rid, "error": str(e)}))
        browser.close()
    print("[done]", flush=True)

if __name__ == "__main__":
    main()
