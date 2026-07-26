#!/usr/bin/env bash
# Run Claude Code against AWS Bedrock via the EC2 instance IAM role.
#
# Owner mandate (2026-07-26): billing goes to AWS, never to a personal
# sk-ant-* key, and the model is always opus-5. A personal key previously
# loaded from .env.local by scripts/claude-env.sh was drained in 18 minutes;
# that key and that wrapper are gone. See CLAUDE.md §2.1 rule 0.
#
#   scripts/claude-bedrock.sh -p "$(cat docs/design/spec-v3/prompts/task-1-feed.md)"
#   scripts/claude-bedrock.sh                 # interactive TUI
set -euo pipefail

# Strip inherited credentials so the key path cannot come back.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN

export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION="${AWS_REGION:-us-east-1}"
# Pin both, or the small/fast calls silently fall back off opus.
export ANTHROPIC_MODEL=global.anthropic.claude-opus-5
export ANTHROPIC_SMALL_FAST_MODEL=global.anthropic.claude-opus-5

exec "${CLAUDE_BIN:-$HOME/.hermes/node/bin/claude}" "$@"
