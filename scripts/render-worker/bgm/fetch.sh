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
# credits reel, etc.). Videos generated for the KW Atlanta agent meetup will
# carry this line in the site footer at vicinities.cc/legal.
#
# Files land in ./ next to this script and are gitignored (see .gitignore).
# Idempotent: re-running skips existing files.

set -euo pipefail
cd "$(dirname "$0")"

declare -A tracks=(
  ["01-cambodian-odyssey.mp3"]="Cambodian%20Odyssey.mp3"
  ["02-ether-vox.mp3"]="Ether%20Vox.mp3"
  ["03-long-note-two.mp3"]="Long%20Note%20Two.mp3"
  ["04-tranquility-base.mp3"]="Tranquility%20Base.mp3"
  ["05-peaceful-desolation.mp3"]="Peaceful%20Desolation.mp3"
  ["06-meditation-impromptu-01.mp3"]="Meditation%20Impromptu%2001.mp3"
  ["07-meditation-impromptu-02.mp3"]="Meditation%20Impromptu%2002.mp3"
  ["08-nowhere-land.mp3"]="Nowhere%20Land.mp3"
  ["09-long-note-three.mp3"]="Long%20Note%20Three.mp3"
  ["10-long-note-four.mp3"]="Long%20Note%20Four.mp3"
)

BASE="https://incompetech.com/music/royalty-free/mp3-royaltyfree"

for local in "${!tracks[@]}"; do
  if [ -f "$local" ] && [ "$(stat -c%s "$local")" -gt 100000 ]; then
    echo "SKIP  $local (already present)"
    continue
  fi
  remote="${tracks[$local]}"
  echo "GET   $local"
  curl -fsSL --retry 3 -o "$local" -H "User-Agent: Mozilla/5.0" "$BASE/$remote"
done

echo
echo "Done. Files:"
ls -lh *.mp3
