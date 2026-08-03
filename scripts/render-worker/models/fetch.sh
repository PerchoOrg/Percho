#!/usr/bin/env bash
# Real-ESRGAN x2 ONNX (66 MB) — too big for git, fetch it on each render host.
# BSD-3, exported from the upstream RealESRGAN_x2plus weights by wide-video.
set -euo pipefail
cd "$(dirname "$0")"
[ -f real_esrgan_x2.onnx ] || curl -fsSL \
  "https://huggingface.co/wide-video/real-esrgan-v1.0.0/resolve/main/real_esrgan_x2.onnx" \
  -o real_esrgan_x2.onnx
ls -la real_esrgan_x2.onnx
