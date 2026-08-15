#!/usr/bin/env python3
"""Percho community video spike: photos + community info -> Seedance 2.0 Mini video via OpenRouter.

Usage:
  ./spike.py <photos-dir> <info.json> <out.mp4> [--duration 8] [--aspect 9:16]

Env: OPENROUTER_API_KEY required.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://openrouter.ai/api/v1"
MODEL = "bytedance/seedance-2.0-mini"


def upload_image(path: str, key: str) -> dict:
    """Upload local image to OpenRouter /files (multipart), return image_url part."""
    # build multipart/form-data by hand; urllib has no helper for this
    boundary = "----hermes" + os.urandom(8).hex()
    with open(path, "rb") as f:
        payload = f.read()
    parts = [
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(path)}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n".encode() + payload + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    body = b"".join(parts)
    req = urllib.request.Request(
        f"{API}/files",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.load(r)
        url = data["data"]["url"]
        print(f"  uploaded {os.path.basename(path)} -> {url}")
        return {"type": "image_url", "image_url": {"url": url}, "frame_type": "first_frame"}
    except urllib.error.HTTPError as e:
        print(f"  upload failed {e.code}: {e.read().decode()[:500]}")
        raise


def submit(prompt: str, frames: list, info: dict, args) -> dict:
    body = {
        "model": MODEL,
        "prompt": prompt,
        "duration": args.duration,
        "aspect_ratio": args.aspect,
        "frame_images": frames,
        "generate_audio": False,
    }
    if args.seed is not None:
        body["seed"] = args.seed
    req = urllib.request.Request(
        f"{API}/videos",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {args.key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print(f"  submit failed {e.code}: {e.read().decode()[:1000]}")
        raise


def poll(url: str, key: str, timeout_s: int = 600) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            print(f"  poll failed {e.code}: {e.read().decode()[:500]}")
            if 400 <= e.code < 500 and e.code not in (408, 429):
                raise  # bad key / bad job id won't fix itself; don't burn the whole timeout
            time.sleep(15)
            continue
        status = data.get("status")
        print(f"  status={status}" + (f" err={data.get('error')}" if data.get("error") else ""))
        if status in ("completed", "failed"):
            return data
        time.sleep(15)
    raise TimeoutError("video generation timed out")


def download(url: str, key: str, out: str):
    # unsigned_urls may point at a storage/CDN host — never hand the API key to a third party
    host = urllib.parse.urlparse(url).hostname or ""
    headers = {}
    if host == "openrouter.ai" or host.endswith(".openrouter.ai"):
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=300) as r:
        with open(out, "wb") as f:
            f.write(r.read())
    print(f"  saved {out} ({os.path.getsize(out)} bytes)")


def build_prompt(info: dict, n_photos: int) -> str:
    return (
        f"A cinematic {info.get('video_style', 'warm lifestyle')} video showcasing the community of {info.get('name', 'this neighborhood')} in {info.get('city', '')}, {info.get('state', '')}. "
        f"{info.get('description', '')} "
        f"Key highlights: {', '.join(info.get('highlights', []))}. "
        f"Camera: slow push-in, gentle parallax. Grade: {info.get('color_grade', 'warm, golden hour, natural')}. "
        f"Atmosphere: {info.get('atmosphere', 'welcoming, family-friendly')}. "
        f"Photorealistic, {n_photos} community photos provided as reference frames."
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photos_dir")
    ap.add_argument("info")
    ap.add_argument("out")
    ap.add_argument("--duration", type=int, default=8)
    ap.add_argument("--aspect", default="9:16")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--no-upload", action="store_true", help="frames are already URLs (info.json contains them)")
    args = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        print("OPENROUTER_API_KEY not set"); sys.exit(1)
    args.key = key

    with open(args.info) as f:
        info = json.load(f)

    frames = []
    if args.no_upload:
        frames = info["frames"]
        for f in frames:
            if f.get("type") != "image_url" or not f.get("image_url", {}).get("url") or f.get("frame_type") != "first_frame":
                print(f"bad frame entry in info.json: {f}")
                sys.exit(1)
    else:
        import glob
        exts = (".jpg", ".jpeg", ".png", ".webp")
        photos = sorted(p for p in glob.glob(os.path.join(args.photos_dir, "*")) if p.lower().endswith(exts))
        if not photos:
            print(f"no photos in {args.photos_dir}"); sys.exit(1)
        # only "first_frame" is a documented frame_type, so exactly one reference frame goes up
        for p in photos[:1]:
            frames.append(upload_image(p, key))

    prompt = build_prompt(info, len(frames))
    print(f"submitting {len(frames)} frames, duration={args.duration}, aspect={args.aspect}")
    resp = submit(prompt, frames, info, args)
    print(f"job id={resp.get('id')} status={resp.get('status')}")
    if resp.get("error"):
        print(f"submit error: {resp['error']}"); sys.exit(1)

    polling_url = resp.get("polling_url")
    if not polling_url:
        print(f"no polling_url in submit response: {json.dumps(resp)[:500]}"); sys.exit(1)

    data = poll(polling_url, key)
    if data["status"] != "completed":
        print(f"job failed: {data.get('error')}"); sys.exit(1)
    urls = data.get("unsigned_urls") or []
    if not urls:
        print("completed but no content urls"); sys.exit(1)
    download(urls[0], key, args.out)
    print(f"done. usage={data.get('usage')}")


if __name__ == "__main__":
    main()
