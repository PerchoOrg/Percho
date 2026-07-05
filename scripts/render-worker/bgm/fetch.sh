#!/usr/bin/env bash
# Fetch the 10-track background-music library used by the render worker.
#
# Source: incompetech.com by Kevin MacLeod (kevinmacleod.com).
# License: Creative Commons Attribution 4.0 International (CC-BY 4.0).
# https://creativecommons.org/licenses/by/4.0/
#
# Attribution requirement: Any project that ships videos rendered with these
# tracks must credit "Music by Kevin MacLeod (incompetech.com), licensed under
# CC-BY 4.0" somewhere the viewer can reach (about page, video description,
# credits reel, etc.).
#
# Files land in ./ next to this script and are gitignored (see .gitignore).
# Idempotent: re-running skips existing files.

set -euo pipefail
cd "$(dirname "$0")"

# Track picks are curated for real-estate walkthroughs — light, upbeat,
# HGTV / lifestyle-vlog vibe. Not moody / cinematic ambient (the previous
# set felt too serious for a home tour).
declare -A tracks=(
  ["01-carefree.mp3"]="Carefree.mp3"
  ["02-cheery-monday.mp3"]="Cheery Monday.mp3"
  ["03-wallpaper.mp3"]="Wallpaper.mp3"
  ["04-life-of-riley.mp3"]="Life of Riley.mp3"
  ["05-cool-vibes.mp3"]="Cool Vibes.mp3"
  ["06-bright-wish.mp3"]="Bright Wish.mp3"
  ["07-amazing-plan.mp3"]="Amazing Plan.mp3"
  ["08-wholesome.mp3"]="Wholesome.mp3"
  ["09-daily-beetle.mp3"]="Daily Beetle.mp3"
  ["10-perspectives.mp3"]="Perspectives.mp3"
)

BASE="https://incompetech.com/music/royalty-free/mp3-royaltyfree"

url_encode() {
  python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1"
}

for local in "${!tracks[@]}"; do
  if [ -f "$local" ] && [ "$(stat -c%s "$local")" -gt 100000 ]; then
    echo "SKIP  $local (already present)"
    continue
  fi
  remote="${tracks[$local]}"
  enc=$(url_encode "$remote")
  echo "GET   $local"
  curl -fsSL --retry 3 -o "$local" -H "User-Agent: Mozilla/5.0" "$BASE/$enc"
done

echo
echo "Done. Files:"
ls -lh *.mp3
