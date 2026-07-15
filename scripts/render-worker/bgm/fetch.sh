#!/usr/bin/env bash
# Fetch the render-worker background-music library, organized into 6 vibe
# buckets (see docs/bgm/vibe-map.md).
#
# Sources:
#   - Kevin MacLeod (incompetech.com) — CC-BY 4.0
#     Attribution required: "Music by Kevin MacLeod (incompetech.com),
#     licensed under CC-BY 4.0" (https://creativecommons.org/licenses/by/4.0/).
#   - Bensound (bensound.com) — Free license, attribution required.
#     Attribution: "Music by www.bensound.com".
#
# Any project shipping videos rendered with these tracks must credit the
# artists in a viewer-reachable location (about page, video description,
# credits reel, etc.).
#
# Files land in the appropriate bucket subdir and are gitignored
# (see repo .gitignore: **/*.mp3). Idempotent: re-running skips existing.

set -euo pipefail
cd "$(dirname "$0")"

# path-relative-to-this-script  =  incompetech remote filename (no .mp3 base)
declare -A KML_TRACKS=(
  # Bucket A — warm acoustic (target 10)
  ["a-warm-acoustic/01-carefree.mp3"]="Carefree"
  ["a-warm-acoustic/02-cheery-monday.mp3"]="Cheery Monday"
  ["a-warm-acoustic/03-wallpaper.mp3"]="Wallpaper"
  ["a-warm-acoustic/07-amazing-plan.mp3"]="Amazing Plan"
  ["a-warm-acoustic/08-wholesome.mp3"]="Wholesome"
  ["a-warm-acoustic/09-daily-beetle.mp3"]="Daily Beetle"
  ["a-warm-acoustic/11-happy-alley.mp3"]="Happy Alley"
  ["a-warm-acoustic/12-balloon-game.mp3"]="Balloon Game"
  ["a-warm-acoustic/13-take-a-chance.mp3"]="Take a Chance"
  ["a-warm-acoustic/14-pookatori-and-friends.mp3"]="Pookatori and Friends"

  # Bucket C — lofi / jazzy chill (existing seed only for now)
  ["c-lofi/05-cool-vibes.mp3"]="Cool Vibes"

  # Bucket D — uplift (existing seed only for now)
  ["d-uplift/04-life-of-riley.mp3"]="Life of Riley"
  ["d-uplift/06-bright-wish.mp3"]="Bright Wish"

  # Bucket F — ambient (existing seed only for now)
  ["f-ambient/10-perspectives.mp3"]="Perspectives"
)

KML_BASE="https://incompetech.com/music/royalty-free/mp3-royaltyfree"

url_encode() {
  python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1"
}

fetch_one() {
  local dest="$1" remote="$2" base="$3"
  if [ -f "$dest" ] && [ "$(stat -c%s "$dest")" -gt 100000 ]; then
    echo "SKIP  $dest"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  local enc
  enc=$(url_encode "$remote.mp3")
  echo "GET   $dest"
  curl -fsSL --retry 3 -o "$dest" -H "User-Agent: Mozilla/5.0" "$base/$enc"
}

for dest in "${!KML_TRACKS[@]}"; do
  fetch_one "$dest" "${KML_TRACKS[$dest]}" "$KML_BASE"
done

echo
echo "Done. Library contents:"
find . -name '*.mp3' -printf '%p  %s bytes\n' | sort
