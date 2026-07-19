#!/usr/bin/env bash
# Fetch the render-worker background-music library.
#
# Only the `warm-acoustic` bucket is production-approved
# (see docs/bgm/vibe-map.md). Other buckets were trialed and rejected.
#
# Source: Kevin MacLeod (incompetech.com) — CC-BY 4.0.
# Attribution required: "Music by Kevin MacLeod (incompetech.com),
# licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)".
# See manifest.json for track-level attribution.
#
# Files land in ./warm-acoustic/ next to this script and are gitignored (*.mp3).
# Idempotent: re-running skips existing files.
#
# NOTE: since Phase 107, the admin UI's **Import** button pulls candidates
# from `lib/bgm/candidates.ts` and uploads them directly to Supabase Storage
# — the render worker then picks them up via `pull-bgm.sh`. This script
# remains as a backfill / bootstrap tool for a fresh render host.

set -euo pipefail
cd "$(dirname "$0")"

# path-relative-to-this-script  =  incompetech remote track title
declare -A KML_TRACKS=(
  ["warm-acoustic/01-carefree.mp3"]="Carefree"
  ["warm-acoustic/02-cheery-monday.mp3"]="Cheery Monday"
  ["warm-acoustic/03-wallpaper.mp3"]="Wallpaper"
  ["warm-acoustic/07-amazing-plan.mp3"]="Amazing Plan"
  ["warm-acoustic/08-wholesome.mp3"]="Wholesome"
  ["warm-acoustic/09-daily-beetle.mp3"]="Daily Beetle"
  ["warm-acoustic/11-happy-alley.mp3"]="Happy Alley"
  ["warm-acoustic/12-balloon-game.mp3"]="Balloon Game"
  ["warm-acoustic/13-take-a-chance.mp3"]="Take a Chance"
  ["warm-acoustic/14-pookatori-and-friends.mp3"]="Pookatori and Friends"
)

echo "→ fetching ${#KML_TRACKS[@]} Kevin MacLeod tracks..."
mkdir -p warm-acoustic
downloaded=0
skipped=0
failed=0
for path in "${!KML_TRACKS[@]}"; do
  if [[ -s "$path" ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  title="${KML_TRACKS[$path]}"
  # Incompetech CDN URL pattern: filename with spaces → +
  fname="${title// /+}.mp3"
  url="https://incompetech.com/music/royalty-free/mp3-royaltyfree/${fname}"
  mkdir -p "$(dirname "$path")"
  if curl -fsSL -o "$path.tmp" "$url"; then
    mv "$path.tmp" "$path"
    downloaded=$((downloaded + 1))
  else
    rm -f "$path.tmp"
    echo "  ! failed: $title  ($url)"
    failed=$((failed + 1))
  fi
done

echo "→ done. downloaded=$downloaded skipped=$skipped failed=$failed"
n=$(find warm-acoustic -maxdepth 1 -name '*.mp3' 2>/dev/null | wc -l)
printf "→ inventory: warm-acoustic %s\n" "$n"
