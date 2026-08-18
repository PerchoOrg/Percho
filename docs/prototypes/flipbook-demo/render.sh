#!/bin/bash
set -e
cd ~/percho-prototypes/flipbook-demo
BGM=~/Percho/scripts/render-worker/bgm/modern-corporate/40-deliberate-thought.mp3

echo "===== BASELINE render ====="
/usr/bin/python3 generate_baseline.py \
  --photos photos \
  --output out/baseline.mp4 \
  --orientation portrait \
  --shot-plan plan_baseline.json \
  --xfade-duration 0.5 \
  --bgm "$BGM" \
  --archetype LIFESTYLE 2>&1 | tail -20

echo ""
echo "===== FLIPBOOK render ====="
/usr/bin/python3 generate_flipbook.py \
  --photos photos \
  --output out/flipbook.mp4 \
  --orientation portrait \
  --shot-plan plan_flipbook.json \
  --xfade-duration 0.35 \
  --transition slideleft \
  --bgm "$BGM" \
  --archetype LIFESTYLE 2>&1 | tail -20

echo ""
echo "===== DONE ====="
ls -lh out/
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 out/baseline.mp4
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 out/flipbook.mp4
