#!/usr/bin/env bash
# Source or exec with the repo Anthropic key loaded (never echoes the key).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' "$REPO/.env.local" | cut -d= -f2-)"
export ANTHROPIC_API_KEY
exec "$@"
