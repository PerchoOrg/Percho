#!/usr/bin/env bash
# pull-bgm.sh — sync the render worker's local bgm/ mp3s from Supabase Storage.
#
# The admin UI writes to the `bgm` bucket. The render worker still reads from
# local disk (fast, no per-render round-trip). This script closes the loop:
# after an admin add/reject, run this on the render host.
#
# Only `warm-acoustic` is production-approved (see docs/bgm/vibe-map.md).
# Other vibe folders (modern-corporate, luxury-ambient, chill-electronic,
# cinematic) are purged locally on every run.
#
# Rejected tracks (listed in bgm/_state/state.json) are skipped when
# downloading AND removed from local disk. Approving one restores it on
# the next run.
#
# Usage (from the repo root on the render host):
#   ./scripts/render-worker/pull-bgm.sh
#
# Requires: .env.local at repo root with NEXT_PUBLIC_SUPABASE_URL and
# SUPABASE_SERVICE_ROLE_KEY. `jq` on PATH.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BGM_DIR="$REPO_ROOT/scripts/render-worker/bgm"
VIBES=(warm-acoustic)
RETIRED_VIBES=(modern-corporate luxury-ambient chill-electronic cinematic)

# shellcheck disable=SC1091
source "$REPO_ROOT/.env.local"
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL missing}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY missing}"

BASE="${NEXT_PUBLIC_SUPABASE_URL%/}"
AUTH_HDR="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
APIKEY_HDR="apikey: $SUPABASE_SERVICE_ROLE_KEY"

# --- purge retired vibes locally -------------------------------------------
for retired in "${RETIRED_VIBES[@]}"; do
    if [ -d "$BGM_DIR/$retired" ]; then
        echo "  purge  $retired/ (retired vibe)"
        rm -rf "${BGM_DIR:?}/$retired"
    fi
done

# --- fetch rejected list ---------------------------------------------------
state_json=$(curl -s -H "$AUTH_HDR" -H "$APIKEY_HDR" \
    "$BASE/storage/v1/object/bgm/_state/state.json" || echo '{}')
if ! echo "$state_json" | jq empty 2>/dev/null; then
    state_json='{"rejected":[]}'
fi
rejected_list=$(echo "$state_json" | jq -r '.rejected[]? // empty')
echo "Rejected tracks in state.json: $(echo "$rejected_list" | grep -c . || true)"

is_rejected() {
    local candidate="$1"
    echo "$rejected_list" | grep -qxF "$candidate"
}

total=0
for vibe in "${VIBES[@]}"; do
    mkdir -p "$BGM_DIR/$vibe"

    # List remote objects for this vibe (Storage list API is a POST).
    remote_json=$(curl -s -X POST \
        -H "$AUTH_HDR" -H "$APIKEY_HDR" -H "Content-Type: application/json" \
        -d "{\"prefix\":\"$vibe/\",\"limit\":1000,\"sortBy\":{\"column\":\"name\",\"order\":\"asc\"}}" \
        "$BASE/storage/v1/object/list/bgm")
    remote_files=$(echo "$remote_json" | jq -r '.[].name' | grep -E '\.mp3$' || true)

    # Delete local files that are no longer in Storage OR are now rejected.
    for local_file in "$BGM_DIR/$vibe"/*.mp3; do
        [ -e "$local_file" ] || continue
        base=$(basename "$local_file")
        if ! echo "$remote_files" | grep -qx "$base"; then
            echo "  del    $vibe/$base (removed from Storage)"
            rm -f "$local_file"
        elif is_rejected "$vibe/$base"; then
            echo "  del    $vibe/$base (rejected)"
            rm -f "$local_file"
        fi
    done

    # Download any remote file that's missing or size-mismatched, skipping rejects.
    count=0
    while IFS= read -r name; do
        [ -n "$name" ] || continue
        if is_rejected "$vibe/$name"; then
            echo "  skip   $vibe/$name (rejected)"
            continue
        fi
        count=$((count + 1))
        local_path="$BGM_DIR/$vibe/$name"
        url="$BASE/storage/v1/object/public/bgm/$vibe/$name"

        remote_size=$(curl -sI "$url" | awk -F': ' 'tolower($1)=="content-length"{gsub(/\r/,"",$2); print $2; exit}')
        if [ -f "$local_path" ]; then
            local_size=$(stat -c '%s' "$local_path" 2>/dev/null || stat -f '%z' "$local_path")
            if [ "$local_size" = "$remote_size" ]; then
                continue
            fi
        fi
        echo "  get    $vibe/$name (${remote_size} bytes)"
        curl -s -o "$local_path" "$url"
    done <<< "$remote_files"

    echo "$vibe: $count active track(s)"
    total=$((total + count))
done

echo
echo "Total: $total active tracks. Regenerating manifest.json…"
python3 "$REPO_ROOT/scripts/upload-bgm/upload.py" --manifest-only

echo "Done. Restart percho-render-worker if it caches file listings at boot."
