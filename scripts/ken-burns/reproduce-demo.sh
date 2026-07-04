#!/usr/bin/env bash
# Reproduce the Vicinity Ken Burns demo end-to-end.
#
# - Downloads 8 permissively-licensed real-estate photos from Pexels if
#   they aren't already cached under docs/ken-burns/demo/photos/.
# - Attempts to fetch a CC0 short ambient BGM track from Pixabay.
# - Runs generate.py to produce vicinity-slideshow-demo.mp4.
#
# Idempotent: safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO_DIR="$REPO_ROOT/docs/ken-burns/demo"
PHOTOS_DIR="$DEMO_DIR/photos"
BGM_PATH="$DEMO_DIR/bgm.mp3"
CARD_PATH="$DEMO_DIR/ending-card.json"
OUT_PATH="$DEMO_DIR/vicinity-slideshow-demo.mp4"

mkdir -p "$PHOTOS_DIR"

# Direct Pexels image URLs (permissive Pexels license: free to use, no
# attribution required; hotlinking allowed). We pin specific photo IDs so
# reruns are reproducible.
declare -a PHOTOS=(
  "01-exterior.jpg|https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=1920"
  "02-living-room.jpg|https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1920"
  "03-kitchen.jpg|https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=1920"
  "04-dining.jpg|https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=1920"
  "05-bedroom.jpg|https://images.pexels.com/photos/1454806/pexels-photo-1454806.jpeg?auto=compress&cs=tinysrgb&w=1920"
  "06-bathroom.jpg|https://images.pexels.com/photos/1454804/pexels-photo-1454804.jpeg?auto=compress&cs=tinysrgb&w=1920"
  "07-office.jpg|https://images.pexels.com/photos/1571453/pexels-photo-1571453.jpeg?auto=compress&cs=tinysrgb&w=1920"
  "08-backyard.jpg|https://images.pexels.com/photos/2724748/pexels-photo-2724748.jpeg?auto=compress&cs=tinysrgb&w=1920"
)

echo "[demo] downloading photos (if missing) → $PHOTOS_DIR"
for entry in "${PHOTOS[@]}"; do
  name="${entry%%|*}"
  url="${entry##*|}"
  dst="$PHOTOS_DIR/$name"
  if [[ ! -s "$dst" ]]; then
    echo "  fetching $name"
    curl -fsSL --retry 3 --max-time 30 -o "$dst" "$url" || {
      echo "  WARN: failed to fetch $name from $url"
      rm -f "$dst"
    }
  else
    echo "  cached $name"
  fi
done

# Optional BGM. Best-effort — if it fails, the demo goes silent.
if [[ ! -s "$BGM_PATH" ]]; then
  echo "[demo] fetching BGM (best effort)"
  # Pixabay hosts CC0 audio at cdn.pixabay.com/audio/. These IDs are
  # short ambient/chill loops. If Pixabay rate-limits or the URL 404s,
  # we skip BGM and note it.
  BGM_URLS=(
    "https://cdn.pixabay.com/audio/2022/10/25/audio_bfe57cd2c9.mp3"
    "https://cdn.pixabay.com/audio/2023/06/22/audio_1808fbc7ba.mp3"
    "https://cdn.pixabay.com/audio/2022/08/23/audio_d16737dc28.mp3"
  )
  for url in "${BGM_URLS[@]}"; do
    if curl -fsSL --retry 2 --max-time 30 -o "$BGM_PATH" "$url"; then
      echo "  got BGM from $url"
      break
    else
      echo "  BGM fetch failed: $url"
      rm -f "$BGM_PATH"
    fi
  done
fi

cat > "$CARD_PATH" <<'JSON'
{
  "price": "$685,000",
  "beds": 4,
  "baths": 3,
  "sqft": "2,800",
  "address": "123 Peachtree Ln, Atlanta GA",
  "agent_name": "Sample Agent",
  "demo": true
}
JSON

BGM_ARGS=()
if [[ -s "$BGM_PATH" ]]; then
  BGM_ARGS=(--bgm "$BGM_PATH")
else
  echo "[demo] no BGM available — rendering silent"
fi

echo "[demo] rendering slideshow"
python3 "$REPO_ROOT/scripts/ken-burns/generate.py" \
  --photos "$PHOTOS_DIR" \
  --output "$OUT_PATH" \
  --duration-per-photo 3 \
  --resolution 1080x1920 \
  --ending-card "$CARD_PATH" \
  "${BGM_ARGS[@]}"

# Verify with ffprobe.
echo "[demo] verifying output"
STREAMS=$(ffprobe -v error -show_entries stream=codec_type -of default=nw=1:nk=1 "$OUT_PATH" | tr '\n' ' ')
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT_PATH")
SIZE=$(du -h "$OUT_PATH" | cut -f1)
echo "[demo] streams: $STREAMS"
echo "[demo] duration: ${DUR}s"
echo "[demo] size: $SIZE"
echo "[demo] output: $OUT_PATH"
