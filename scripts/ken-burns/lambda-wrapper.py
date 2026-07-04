"""
Lambda handler that generates a Ken Burns slideshow from S3-hosted photos
and uploads the result to S3 (or an S3-compatible target like Cloudflare R2).

Trigger: an S3 event or a direct invoke with a payload of the shape:

  {
    "listing_id": "abc123",
    "photos_bucket": "vicinity-listing-photos",
    "photos_prefix": "listings/abc123/photos/",
    "output_bucket": "vicinity-generated-videos",
    "output_key": "listings/abc123/slideshow.mp4",
    "ending_card": { "price": "$685,000", ... }
  }

Not deployed. Scaffold only. See the SAM snippet at the bottom.

Packaging: build as a container image using the Dockerfile suggested in
README.md, or ship ffmpeg via a Lambda layer at /opt/bin/ffmpeg.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import boto3  # provided by the Lambda runtime / container image

S3 = boto3.client("s3")

GENERATE_PY = os.environ.get(
    "GENERATE_PY", "/var/task/generate.py"
)
# For R2, set S3_ENDPOINT_URL=https://<accountid>.r2.cloudflarestorage.com
# and provide AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY as R2 tokens.
OUTPUT_S3 = boto3.client(
    "s3",
    endpoint_url=os.environ.get("OUTPUT_S3_ENDPOINT_URL") or None,
    aws_access_key_id=os.environ.get("OUTPUT_AWS_ACCESS_KEY_ID") or None,
    aws_secret_access_key=os.environ.get("OUTPUT_AWS_SECRET_ACCESS_KEY") or None,
)


def _parse_event(event: dict) -> dict:
    """Accept either a direct-invoke payload or a plain S3 event."""
    if "Records" in event and event["Records"]:
        rec = event["Records"][0]["s3"]
        bucket = rec["bucket"]["name"]
        key = rec["object"]["key"]
        # Convention: s3://<bucket>/listings/<listing_id>/photos/<file>
        parts = key.split("/")
        listing_id = parts[1] if len(parts) > 1 else "unknown"
        prefix = "/".join(parts[:-1]) + "/"
        return {
            "listing_id": listing_id,
            "photos_bucket": bucket,
            "photos_prefix": prefix,
            "output_bucket": os.environ["OUTPUT_BUCKET"],
            "output_key": f"listings/{listing_id}/slideshow.mp4",
            "ending_card": None,
        }
    return event


def _download_photos(bucket: str, prefix: str, dst_dir: Path) -> int:
    paginator = S3.get_paginator("list_objects_v2")
    n = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            ext = Path(key).suffix.lower()
            if ext not in {".jpg", ".jpeg", ".png"}:
                continue
            local = dst_dir / Path(key).name
            S3.download_file(bucket, key, str(local))
            n += 1
    return n


def handler(event: dict, _context) -> dict:
    payload = _parse_event(event)
    listing_id = payload["listing_id"]

    with tempfile.TemporaryDirectory(prefix=f"kb-{listing_id}-") as tmp:
        tmp_path = Path(tmp)
        photos_dir = tmp_path / "photos"
        photos_dir.mkdir()
        n = _download_photos(payload["photos_bucket"], payload["photos_prefix"], photos_dir)
        if n == 0:
            return {"ok": False, "error": "no photos found", "listing_id": listing_id}

        out_path = tmp_path / "out.mp4"
        cmd = [
            "python3", GENERATE_PY,
            "--photos", str(photos_dir),
            "--output", str(out_path),
            "--duration-per-photo", "3",
            "--resolution", "1080x1920",
        ]
        if payload.get("ending_card"):
            card_path = tmp_path / "card.json"
            card_path.write_text(json.dumps(payload["ending_card"]))
            cmd += ["--ending-card", str(card_path)]

        subprocess.run(cmd, check=True)

        OUTPUT_S3.upload_file(
            str(out_path),
            payload["output_bucket"],
            payload["output_key"],
            ExtraArgs={"ContentType": "video/mp4", "CacheControl": "public, max-age=31536000"},
        )

    # For R2, prefer a signed URL or a public bucket domain.
    base = os.environ.get("OUTPUT_PUBLIC_BASE_URL")
    if base:
        url = f"{base.rstrip('/')}/{payload['output_key']}"
    else:
        url = f"s3://{payload['output_bucket']}/{payload['output_key']}"

    return {"ok": True, "listing_id": listing_id, "url": url, "photo_count": n}


# ---------------------------------------------------------------------------
# SAM template snippet (do not deploy from this file — placed here for reference)
# ---------------------------------------------------------------------------
# AWSTemplateFormatVersion: '2010-09-09'
# Transform: AWS::Serverless-2016-10-31
# Resources:
#   KenBurnsFn:
#     Type: AWS::Serverless::Function
#     Properties:
#       PackageType: Image
#       ImageUri: <ecr-repo>:latest
#       Timeout: 300
#       MemorySize: 3008
#       Architectures: [x86_64]
#       Environment:
#         Variables:
#           OUTPUT_BUCKET: vicinity-generated-videos
#           OUTPUT_S3_ENDPOINT_URL: https://<accountid>.r2.cloudflarestorage.com
#           OUTPUT_AWS_ACCESS_KEY_ID: !Ref R2AccessKey
#           OUTPUT_AWS_SECRET_ACCESS_KEY: !Ref R2SecretKey
#           OUTPUT_PUBLIC_BASE_URL: https://cdn.vicinity.example
#       Policies:
#         - S3ReadPolicy: { BucketName: vicinity-listing-photos }
#         - S3WritePolicy: { BucketName: vicinity-generated-videos }
#       Events:
#         PhotosUploaded:
#           Type: S3
#           Properties:
#             Bucket: !Ref PhotosBucket
#             Events: s3:ObjectCreated:*
#             Filter:
#               S3Key:
#                 Rules:
#                   - Name: prefix
#                     Value: listings/
#                   - Name: suffix
#                     Value: .jpg
