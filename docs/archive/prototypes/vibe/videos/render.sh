#!/bin/bash
# Smaller/faster: 720x1280, CRF 28, ultrafast preset, 3s×3 clips = 9s each
set -e
WORK=/home/ubuntu/percho-prototypes/vibe/videos
mkdir -p "$WORK/src" "$WORK/out"

declare -a JOBS=(
  "waterside|https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1080&q=80|https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1080&q=80|https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1080&q=80"
  "southern-village|https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1080&q=80|https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1080&q=80|https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1080&q=80"
  "downtown-durham|https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1080&q=80|https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1080&q=80|https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=1080&q=80"
  "l1|https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1080&q=80|https://images.unsplash.com/photo-1600566753086-00f18fe6ba71?w=1080&q=80|https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1080&q=80"
  "l2|https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1080&q=80|https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1080&q=80|https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1080&q=80"
  "l3|https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1080&q=80|https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1080&q=80|https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1080&q=80"
)

W=720; H=1280; FPS=25; DUR=3; FRAMES=$((DUR*FPS))

render_clip() {
  local photo="$1" out="$2" mode="$3"
  local zp
  case "$mode" in
    zoom_in)  zp="z='min(zoom+0.0018,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" ;;
    zoom_out) zp="z='if(lte(zoom,1.0),1.10,max(1.001,zoom-0.0018))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" ;;
    pan_lr)   zp="z='1.08':x='(iw-iw/zoom)*on/${FRAMES}':y='ih/2-(ih/zoom/2)'" ;;
  esac
  ffmpeg -y -loop 1 -t $DUR -i "$photo" -filter_complex "
    [0:v]fps=25,scale=iw:ih,setsar=1[in];
    [in]split=2[bg][fg];
    [bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=luma_radius=30:luma_power=2,eq=brightness=-0.18[bgv];
    [fg]scale='min(${W},iw)':'min(${H},ih)':force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1[fgv];
    [bgv][fgv]overlay=0:0,zoompan=${zp}:d=1:s=${W}x${H}:fps=${FPS}
  " -t $DUR -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 30 -movflags +faststart -an "$out" -loglevel error
}

for job in "${JOBS[@]}"; do
  IFS='|' read -r id u1 u2 u3 <<< "$job"
  echo "===== $id ====="
  ok=true
  for i in 1 2 3; do
    var="u$i"; url="${!var}"
    file="$WORK/src/${id}-${i}.jpg"
    if [ ! -f "$file" ] || [ "$(file -b --mime-type $file)" != "image/jpeg" ]; then
      rm -f "$file"
      curl -sL -o "$file" "$url"
    fi
    if [ "$(file -b --mime-type $file)" != "image/jpeg" ]; then
      echo "  SKIP $id: photo $i failed"; ok=false; break
    fi
  done
  $ok || continue
  render_clip "$WORK/src/${id}-1.jpg" "$WORK/src/${id}-c1.mp4" zoom_in
  render_clip "$WORK/src/${id}-2.jpg" "$WORK/src/${id}-c2.mp4" pan_lr
  render_clip "$WORK/src/${id}-3.jpg" "$WORK/src/${id}-c3.mp4" zoom_out
  ffmpeg -y \
    -i "$WORK/src/${id}-c1.mp4" \
    -i "$WORK/src/${id}-c2.mp4" \
    -i "$WORK/src/${id}-c3.mp4" \
    -filter_complex "
      [0:v][1:v]xfade=transition=fade:duration=0.4:offset=2.6[v01];
      [v01][2:v]xfade=transition=fade:duration=0.4:offset=5.2,format=yuv420p
    " -c:v libx264 -preset ultrafast -crf 30 -movflags +faststart -an \
    "$WORK/out/${id}.mp4" -loglevel error
  rm -f "$WORK/src/${id}-c1.mp4" "$WORK/src/${id}-c2.mp4" "$WORK/src/${id}-c3.mp4"
  echo "  → $(ls -la $WORK/out/${id}.mp4 | awk '{print $5}') bytes"
done
echo "ALL DONE."
ls -la "$WORK/out/"
