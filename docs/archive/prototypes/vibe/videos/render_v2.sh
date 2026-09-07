#!/bin/bash
# Add BGM + intro text overlay to already-rendered ken-burns videos.
# Reads title/subtitle/hook from a JSON-esque metadata table below,
# rotates a BGM pool, produces v2 mp4s alongside originals.
set -e
WORK=/home/ubuntu/percho-prototypes/vibe/videos
BGM_DIR="$WORK/bgm"
OUT="$WORK/out"
V2="$WORK/out_v2"
mkdir -p "$V2"

# id|title|subtitle|hook|bgm-file
# Hook is a single line, short. Title = big, subtitle = medium, hook = quote.
declare -a META=(
  "waterside|Waterside|Chapel Hill, NC · 142 homes|Quiet cul-de-sacs. Top schools. 4 min to trails.|01-carefree.mp3"
  "southern-village|Southern Village|Chapel Hill, NC · 98 homes|Walk to coffee, dinner, movies.|02-cheery-monday.mp3"
  "downtown-durham|Downtown Durham|Durham, NC · 210 lofts|Restaurants, music, no car needed.|03-wallpaper.mp3"
  "l1|5122 Lower Creek St|Waterside · \$749K · 4bd 3.5ba|Renovated kitchen. Half-acre lot.|04-life-of-riley.mp3"
  "l2|108 Market St|Southern Village · \$695K · 3bd 2.5ba|Walk to town center. Cafe next door.|05-bright-wish.mp3"
  "l3|318 W Main St #4B|Downtown Durham · \$525K · 2bd|14ft ceilings. Exposed brick. Loft life.|01-carefree.mp3"
)

# Fonts on Ubuntu: DejaVu Sans is default
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

for row in "${META[@]}"; do
  IFS='|' read -r id title subtitle hook bgm <<< "$row"
  src="$OUT/${id}.mp4"
  out="$V2/${id}.mp4"
  bgm_path="$BGM_DIR/${bgm}"
  [ -f "$src" ] || { echo "MISSING $src"; continue; }
  [ -f "$bgm_path" ] || { echo "MISSING BGM $bgm_path"; continue; }

  # Escape colons for drawtext
  title_esc=$(printf '%s' "$title" | sed 's/:/\\:/g; s/'"'"'/\\'"'"'/g')
  sub_esc=$(printf '%s' "$subtitle" | sed 's/:/\\:/g; s/\$/\\$/g')
  hook_esc=$(printf '%s' "$hook" | sed 's/:/\\:/g')

  echo "===== $id ====="

  # Text intro fades in at 0.4s, holds until 4s, fades out by 5s.
  # Bottom-left, above existing UI overlays which live at ~200-500 y from bottom.
  # For 720x1280 canvas, place text block at y=880..1050 (visible above dark scrim).
  # Use two lines of text with a subtle 60% black scrim band.

  ffmpeg -y \
    -i "$src" \
    -stream_loop -1 -i "$bgm_path" \
    -filter_complex "
      [0:v]drawbox=x=0:y=850:w=720:h=200:color=black@0.55:t=fill:enable='between(t,0.4,5.5)',
        drawtext=fontfile=${FONT}:text='${title_esc}':fontcolor=white:fontsize=54:x=32:y=890:alpha='if(lt(t,0.4),0,if(lt(t,0.8),(t-0.4)/0.4,if(lt(t,4.8),1,if(lt(t,5.5),(5.5-t)/0.7,0))))',
        drawtext=fontfile=${FONT_REG}:text='${sub_esc}':fontcolor=white@0.85:fontsize=26:x=32:y=955:alpha='if(lt(t,0.5),0,if(lt(t,0.9),(t-0.5)/0.4,if(lt(t,4.8),1,if(lt(t,5.5),(5.5-t)/0.7,0))))',
        drawtext=fontfile=${FONT_REG}:text='${hook_esc}':fontcolor=white@0.75:fontsize=22:x=32:y=995:alpha='if(lt(t,0.6),0,if(lt(t,1.0),(t-0.6)/0.4,if(lt(t,4.8),1,if(lt(t,5.5),(5.5-t)/0.7,0))))'
      [v];
      [1:a]atrim=0:8.2,afade=t=in:st=0:d=0.5,afade=t=out:st=7.5:d=0.7,volume=0.55[a]
    " \
    -map "[v]" -map "[a]" \
    -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 28 \
    -c:a aac -b:a 96k -shortest -movflags +faststart \
    "$out" -loglevel error
  echo "  → $(stat -c%s $out) bytes"
done

ls -la "$V2/"
