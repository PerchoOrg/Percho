#!/usr/bin/env python3
"""Google Street View Static API downloader.

Usage: streetview.py "address or lat,lng" -o outdir [--headings 0,90,180,270] [--size 1200x800]

Checks metadata first (free) to skip locations without coverage.
"""
import argparse, json, os, pathlib, sys, urllib.parse, urllib.request

META = "https://maps.googleapis.com/maps/api/streetview/metadata"
IMG = "https://maps.googleapis.com/maps/api/streetview"


def load_key():
    k = os.environ.get("GOOGLE_PLACES_API_KEY")
    if k:
        return k
    env = pathlib.Path(__file__).resolve().parent.parent / ".env.local"
    prefix = "GOOGLE_PLACES_API_KEY" + "="
    for line in env.read_text().splitlines():
        if line.startswith(prefix):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("no key")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("location")
    ap.add_argument("-o", "--outdir", required=True)
    ap.add_argument("--headings", default="0,90,180,270")
    ap.add_argument("--size", default="1200x800")
    ap.add_argument("--fov", type=int, default=80)
    ap.add_argument("--pitch", type=int, default=0)
    args = ap.parse_args()

    key = load_key()
    out = pathlib.Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)

    # metadata check (free)
    q = urllib.parse.urlencode({"location": args.location, "key": key})
    meta = json.loads(urllib.request.urlopen(f"{META}?{q}", timeout=15).read())
    if meta.get("status") != "OK":
        print(f"NO COVERAGE for {args.location!r}: {meta.get('status')}")
        (out / "no-coverage.json").write_text(json.dumps(meta, indent=2))
        return 1
    print(f"pano: {meta['pano_id']} date: {meta.get('date','?')} @ {meta['location']}")

    manifest = {"location": args.location, "meta": meta, "images": []}
    for h in args.headings.split(","):
        h = h.strip()
        params = {
            "location": args.location, "key": key, "size": args.size,
            "fov": args.fov, "heading": h, "pitch": args.pitch, "return_error_code": "true",
        }
        url = f"{IMG}?{urllib.parse.urlencode(params)}"
        try:
            data = urllib.request.urlopen(url, timeout=20).read()
        except Exception as e:
            print(f"  heading {h}: ERR {e}")
            continue
        fn = f"heading-{h.zfill(3)}.jpg"
        (out / fn).write_bytes(data)
        print(f"  heading {h}: {len(data)//1024} KB -> {fn}")
        manifest["images"].append({"heading": int(h), "file": fn, "bytes": len(data)})

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"✓ {out}/manifest.json")


if __name__ == "__main__":
    sys.exit(main() or 0)
