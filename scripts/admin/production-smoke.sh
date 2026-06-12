#!/usr/bin/env bash
# Production smoke test — phase7.0a
#
# Runs a handful of unauthenticated HTTP checks against a deployed Vicinity
# instance to verify the public surface is alive after a phase merge or
# infra change (Vercel domain alias, env var rotation, etc).
#
# Usage:
#   BASE_URL=https://vicinities.cc scripts/admin/production-smoke.sh
#   scripts/admin/production-smoke.sh                 # defaults to vicinities.cc
#
# What it checks (all unauthenticated):
#   1. GET /              → 200, body contains "Vicinity"
#   2. GET /login         → 200, body contains "Agent login"
#   3. GET /dashboard     → 307 redirect to /login (middleware gate)
#   4. GET /auth/callback → 307 redirect (no code → /login?error=auth_failed)
#   5. GET /v/__nope__/__nope__ → 404 (public listing route shape)
#
# Exits 0 if all pass, 1 if any fail. Prints a one-line summary per check.
#
# Notes:
#   - Cookie-bound flows (real magic-link login, dashboard SSR with session,
#     video upload) are NOT covered here — those need a real browser session
#     and live in Phase 7.2-7.3 (owner + Vivian on Mac).
#   - This is the kind of test you run AFTER every phase merge to catch
#     production regressions before Vivian sees them.

set -u

BASE_URL="${BASE_URL:-https://www.vicinities.cc}"
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0

check() {
  local name="$1"
  local ok="$2"
  local detail="$3"
  if [[ "$ok" == "yes" ]]; then
    printf '  \033[32m✓\033[0m  %-40s %s\n' "$name" "$detail"
    PASS=$((PASS + 1))
  else
    printf '  \033[31m✗\033[0m  %-40s %s\n' "$name" "$detail"
    FAIL=$((FAIL + 1))
  fi
}

# Returns "<status>|<body_first_4k>" so we can do both code and grep checks.
fetch() {
  local path="$1"
  curl -sS -o /tmp/smoke-body.$$ -w '%{http_code}' \
    --max-time 15 \
    -H 'User-Agent: vicinity-smoke/1.0' \
    "$BASE_URL$path" 2>/dev/null || echo "000"
}

# Like fetch but does NOT follow redirects, and reports Location header.
fetch_no_follow() {
  local path="$1"
  curl -sS -o /dev/null -D /tmp/smoke-headers.$$ -w '%{http_code}' \
    --max-time 15 \
    -H 'User-Agent: vicinity-smoke/1.0' \
    "$BASE_URL$path" 2>/dev/null || echo "000"
}

echo "Smoke-testing $BASE_URL"
echo

# 1. Landing
status=$(fetch '/')
if [[ "$status" == "200" ]] && grep -q 'Vicinity' /tmp/smoke-body.$$; then
  check "GET /" yes "200 + body contains 'Vicinity'"
else
  check "GET /" no  "got status=$status, body grep miss"
fi

# 2. Login
status=$(fetch '/login')
if [[ "$status" == "200" ]] && grep -q 'Agent login' /tmp/smoke-body.$$; then
  check "GET /login" yes "200 + 'Agent login' rendered"
else
  check "GET /login" no  "got status=$status, body grep miss"
fi

# 3. Dashboard unauth → redirect to /login
status=$(fetch_no_follow '/dashboard')
loc=$(awk 'tolower($1)=="location:"{print $2}' /tmp/smoke-headers.$$ | tr -d '\r' | tail -1)
if [[ "$status" =~ ^30[0-9]$ ]] && [[ "$loc" == *"/login"* ]]; then
  check "GET /dashboard (unauth)" yes "$status → $loc"
else
  check "GET /dashboard (unauth)" no  "got status=$status loc=$loc (expected 30x → /login)"
fi

# 4. Auth callback no code → redirect (handler must not 500)
status=$(fetch_no_follow '/auth/callback')
loc=$(awk 'tolower($1)=="location:"{print $2}' /tmp/smoke-headers.$$ | tr -d '\r' | tail -1)
if [[ "$status" =~ ^30[0-9]$ ]] && [[ "$loc" == *"/login"* ]]; then
  check "GET /auth/callback (no code)" yes "$status → $loc"
else
  check "GET /auth/callback (no code)" no  "got status=$status loc=$loc (expected 30x → /login)"
fi

# 5. Bogus public listing → 404 (route exists, slug doesn't)
status=$(fetch '/v/__nope__/__nope__')
if [[ "$status" == "404" ]]; then
  check "GET /v/__nope__/__nope__" yes "404 (correct route shape)"
else
  check "GET /v/__nope__/__nope__" no  "got status=$status (expected 404)"
fi

# 6. Bogus public agent profile → 404 (phase8 stretch)
status=$(fetch '/a/__nope__')
if [[ "$status" == "404" ]]; then
  check "GET /a/__nope__" yes "404 (correct route shape)"
else
  check "GET /a/__nope__" no  "got status=$status (expected 404)"
fi

# 7. Browse listings → 200 (Landing CTA target — see hotfix 2026-06-10)
status=$(fetch '/browse')
if [[ "$status" == "200" ]]; then
  check "GET /browse" yes "200 (browse all listings)"
else
  check "GET /browse" no  "got status=$status (expected 200)"
fi

# 8. Nearby placeholder → 200 (phase13)
status=$(fetch '/nearby')
if [[ "$status" == "200" ]] && grep -q 'Nearby' /tmp/smoke-body.$$; then
  check "GET /nearby" yes "200 + body contains 'Nearby'"
else
  check "GET /nearby" no  "got status=$status, body grep miss"
fi

# 9. Profile (anon) → 200, shows Sign in CTA (phase14)
status=$(fetch '/profile')
if [[ "$status" == "200" ]] && grep -q 'Sign in' /tmp/smoke-body.$$; then
  check "GET /profile (anon)" yes "200 + Sign in CTA rendered"
else
  check "GET /profile (anon)" no  "got status=$status, body grep miss"
fi

rm -f /tmp/smoke-body.$$ /tmp/smoke-headers.$$

echo
echo "Pass: $PASS  Fail: $FAIL"
if (( FAIL > 0 )); then
  exit 1
fi
exit 0
