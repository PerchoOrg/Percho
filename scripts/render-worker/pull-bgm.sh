#!/usr/bin/env bash
# pull-bgm.sh — sync the render worker's local bgm/ mp3s from Supabase Storage.
#
# The admin UI writes to the `bgm` bucket. The render worker still reads from
# local disk (fast, no per-render round-trip). This script closes the loop:
# after an admin add/reject, run this on the render host.
#
# Palettes are acoustic / piano / electronic. The old use-case folders
# (warm-acoustic, modern-corporate, luxury-ambient, chill-electronic, cinematic)
# are purged locally on every run.
#
# Rejected AND pending tracks (bgm/_state/state.json) are skipped when
# downloading AND removed from local disk — an unreviewed track must not reach
# a film. Approving one restores it on the next run, and the worker runs this
# itself at startup and every 15 minutes.
#
# Usage (from the repo root on the render host):
#   ./scripts/render-worker/pull-bgm.sh
#
# Requires: .env.local at repo root with NEXT_PUBLIC_SUPABASE_URL and
# SUPABASE_SERVICE_ROLE_KEY. `jq` on PATH.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BGM_DIR="$REPO_ROOT/scripts/render-worker/bgm"
# The folder is the PALETTE, not a use case (2026-08-20).
#
# Was warm-acoustic / modern-corporate / luxury-ambient / chill-electronic,
# which baked a use case into the folder name and made the mapping unchangeable
# without moving files. The last two were the same instruments at different
# energies, so they merged; energy is a track tag now. Only tracks that pass
# review are downloaded, so an empty palette stays empty and costs nothing.
VIBES=(acoustic piano electronic)
RETIRED_VIBES=(warm-acoustic modern-corporate luxury-ambient chill-electronic cinematic)

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
# Rejected AND pending. A generated track sits in `pending` until someone has
# listened to it, and an unreviewed track must not be able to reach a
# customer's film — so as far as this script is concerned the two states are
# the same thing: do not download it.
rejected_list=$(echo "$state_json" | jq -r '(.rejected[]?, .pending[]?) // empty')
echo "Excluded tracks (rejected + pending): $(echo "$rejected_list" | grep -c . || true)"

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
# The render venv, not bare python3 — upload.py imports `requests`, which the
# system interpreter does not have. Every run since the venv appeared synced the
# mp3s correctly and then died here, which is why manifest.json still listed
# three buckets Storage had already been emptied of.
BGM_PYTHON="$REPO_ROOT/.venv-render/bin/python3"
[ -x "$BGM_PYTHON" ] || BGM_PYTHON="$REPO_ROOT/.venv-depthflow/bin/python3"
[ -x "$BGM_PYTHON" ] || BGM_PYTHON="python3"
"$BGM_PYTHON" "$REPO_ROOT/scripts/upload-bgm/upload.py" --manifest-only

echo "Done. Restart percho-render-worker if it caches file listings at boot."
