#!/usr/bin/env bash
<<<<<<< Updated upstream
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
=======
# Fetch the render-worker background-music library, organized into 5 vibe
# buckets (see docs/bgm/vibe-map.md). Archive/ holds tracks previously
# fetched that don't match the SOP — not re-fetched here.
#
# Sources:
#   Kevin MacLeod (incompetech.com) — CC-BY 4.0
#   Attribution required: "Music by Kevin MacLeod (incompetech.com),
#   licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)".
#   All active tracks are KML. See manifest.json for track-level attribution.
>>>>>>> Stashed changes
#
# Files land in ./ next to this script and are gitignored (see .gitignore).
# Idempotent: re-running skips existing files.

set -euo pipefail
cd "$(dirname "$0")"

<<<<<<< Updated upstream
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
=======
# path-relative-to-this-script  =  incompetech remote filename (no .mp3 base)
declare -A KML_TRACKS=(
  # warm-acoustic — target 10, current 10 (KML)
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

  # modern-corporate — target 15, current 8 (need +7, next phase)
  ["modern-corporate/04-life-of-riley.mp3"]="Life of Riley"
  ["modern-corporate/06-bright-wish.mp3"]="Bright Wish"
  ["modern-corporate/22-inspired.mp3"]="Inspired"
  ["modern-corporate/23-fluffing-a-duck.mp3"]="Fluffing a Duck"
  ["modern-corporate/24-feelin-good.mp3"]="Feelin Good"
  ["modern-corporate/25-ready-aim-fire.mp3"]="Ready Aim Fire"
  ["modern-corporate/26-new-direction.mp3"]="New Direction"
  ["modern-corporate/27-enter-the-party.mp3"]="Enter the Party"

  # luxury-ambient — target 8, current 8 (KML)
  ["luxury-ambient/10-perspectives.mp3"]="Perspectives"
  ["luxury-ambient/28-ossuary-1-a-beginning.mp3"]="Ossuary 1 - A Beginning"
  ["luxury-ambient/29-ossuary-5-rest.mp3"]="Ossuary 5 - Rest"
  ["luxury-ambient/30-ossuary-6-air.mp3"]="Ossuary 6 - Air"
  ["luxury-ambient/31-deep-haze.mp3"]="Deep Haze"
  ["luxury-ambient/32-dream-culture.mp3"]="Dream Culture"
  ["luxury-ambient/33-path-of-the-goblin-king.mp3"]="Path of the Goblin King"
  ["luxury-ambient/34-autumn-day.mp3"]="Autumn Day"

  # chill-electronic — target 8, current 0 (TBD: Pixabay CC0 organic-electronic)
  # cinematic       — target 8, current 0 (TBD: KML curation next phase)
)

echo "→ fetching ${#KML_TRACKS[@]} Kevin MacLeod tracks..."
mkdir -p warm-acoustic modern-corporate luxury-ambient chill-electronic cinematic
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
echo "→ inventory:"
for b in warm-acoustic modern-corporate luxury-ambient chill-electronic cinematic; do
  n=$(find "$b" -maxdepth 1 -name '*.mp3' 2>/dev/null | wc -l)
  printf "    %-20s %s\n" "$b" "$n"
done
>>>>>>> Stashed changes
