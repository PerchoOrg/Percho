# EC2 → Mac mini handoff

**Written:** 2026-08-04, on the EC2 host (`ubuntu@/home/ubuntu`), immediately
before it gets terminated. Everything recoverable via `git clone` is in
`origin/main` as of commit `2d9994c` and the commit that added this file.
Everything NOT in git is in a transfer bundle — see §3.

---

## 1. What state the repo is in

- `main` carries the **listing-explore** work (`02-listing.md` §2.4/§2.6):
  section-nav strip, explore telemetry stream, value slider, TourStop rework.
  `app/listing/[id].tsx` DOES consume `section-nav.ts`, `slider-scale.ts` and
  `explore-events.ts` — the screen is wired; what is missing is the
  `listing_photos.ai_tags` backfill, without which every listing produces zero
  hotspots, so the tour / pins / room sections render as absent rather than
  empty. Suites green on the last EC2 commit: mobile **587/587**, web
  **239/239**, mobile `tsc` + `biome check .` clean. `apps/web` `biome check .`
  reports ~138 pre-existing errors repo-wide (mostly a11y `useSemanticElements`
  on dashboard components); every file this work touched is clean.
  `apps/web` `tsc` still reports **19 pre-existing** `startTransition(async
  …)` / `TransitionFunction` errors — a React 18 `@types` mismatch that
  predates this work and does not block `next build`. Don't treat it as a
  regression; fix it by moving those 19 call sites to `startTransition(() => {
  void fn(); })` if it ever matters.
- `scripts/fmls-scrape/` — newly checked in. It had **only ever existed in
  `~/fmls-scrape/` on the EC2 box** and would have died with the instance.
- Six EC2-local stashes are preserved as tags `pre-migration/stash-0` …
  `stash-5` (pushed). They're old WIP from phases 73-105; recover with
  `git stash apply pre-migration/stash-N` or just read the diffs. Nothing in
  them is known to be needed — they're insurance, delete the tags once you're
  past caring.

## 2. Services running on EC2 that need a Mac equivalent

| EC2 (systemd) | What it does | Mac replacement |
|---|---|---|
| `hermes-gateway.service` | Hermes Slack/API gateway | launchd plist, `hermes gateway run` |
| `percho-render-worker.service` | Ken Burns video + photo enhance worker (`scripts/render-worker/worker.py`) | launchd plist, `WorkingDirectory=~/Percho` |
| `cloudflared.service` | named tunnel `759377a8-…` → `demo.percho.co` → `localhost:8797` | move `~/.cloudflared/` (in bundle), `cloudflared service install` |
| `next dev -p 3000` | app API that `demo.percho.co/api/*` proxies to | run manually |
| `expo start --tunnel` | device testing, `EXPO_PUBLIC_DEV_SAMPLER=1 EXPO_PUBLIC_API_BASE=https://demo.percho.co` | run manually |

**Cut over one at a time, and stop the EC2 gateway BEFORE starting the Mac
one** — two gateways on the same Slack bot token means messages land randomly
on either.

`~/percho-prototypes/serve.py` is what listens on 8797: static prototype files
plus a `/api/*` reverse proxy to `localhost:3000`. That proxy is the only
reason a physical iPhone can reach unpublished API routes, so keep it.

## 3. Non-git content in the transfer bundle

| Item | Why it can't be cloned |
|---|---|
| `.env.local` (repo root + `apps/web/`) | secrets: Supabase service role, CF Stream, Google Places, Resend |
| `~/.percho-secrets/` | Apify token, Nextdoor cookies, env backup |
| `~/.cloudflared/` | tunnel credentials + cert for `demo.percho.co` |
| `~/percho-prototypes/` | 27 demo dirs + `serve.py`; media-heavy, never in git |
| `~/fmls-scrape/` data | scraped photos/details (scripts are now in git; the data is not) |
| `~/percho-nextdoor-seed/` data | 8.7k scraped neighborhood pages (scripts already in `scripts/nextdoor-seed/`) |
| `~/bin/ws` + `Percho-workspaces.json` | worktree registry CLI |
| Hermes state | `hermes backup` zip → `hermes import` on the Mac |

Fetched at setup time rather than transferred:
- `scripts/render-worker/bgm/` (587 MB of CC-BY music) → `bash bgm/fetch.sh`
- `scripts/render-worker/models/real_esrgan_x2.onnx` (66 MB) → `bash models/fetch.sh`

## 4. Mac mini bring-up

```bash
brew install python@3.11 node pnpm ffmpeg git gh cloudflared
pipx install hermes-agent

git clone git@github.com:PerchoOrg/Percho.git ~/Percho && cd ~/Percho && pnpm install

# from the bundle:
#   .env.local files, ~/.percho-secrets (chmod 600), ~/.cloudflared,
#   ~/percho-prototypes, ~/bin/ws, scrape data
hermes import ~/Downloads/hermes-backup-*.zip

# render worker deps (EC2 ran these under /usr/bin/python3 3.12, NOT the 3.11 venv)
pip3 install opencv-contrib-python-headless numpy onnxruntime requests pillow
bash scripts/render-worker/models/fetch.sh
bash scripts/render-worker/bgm/fetch.sh
```

Then rewrite `/home/ubuntu` → `/Users/<mac-user>` in `~/.hermes` and the repo,
**skipping** `sessions/request_dump_*`, `logs/`, `node_modules/`, `.git/`.
macOS needs `sed -i ''` (empty arg), Linux `sed -i` fails.

Also on the Mac: `rm -f ~/.hermes/gateway.pid ~/.hermes/gateway.lock
~/.hermes/processes.json` — stale EC2 runtime state stops `hermes gateway`
from starting.

## 5. Known-broken, inherited

- `apps/web/lib/poi/*` and `scripts/render-worker/*` read
  `process.env.ANTHROPIC_API_KEY`, which is deliberately absent (see
  `CLAUDE.md` §2.1 rule 0 — a personal key burned $55 in 18 min on
  2026-07-26). Those call sites still need porting to Bedrock. On the Mac
  there's no instance IAM role, so they need explicit AWS credentials.
- 5 Hermes cron jobs are **paused** with `last_delivery_error:
  account_inactive` from an old Slack app. Fix the delivery target before
  resuming, or they'll fail silently again.
- Real-ESRGAN never ran on EC2 (CPU-only, too slow) — the enhance chain fell
  back to FSRCNN. The Mac mini M4 is the machine that was supposed to make
  ESRGAN viable; that's untested.

## 6. AWS cleanup after the Mac is verified

Snapshot an AMI first, then terminate. Sweep for tail billing: **Elastic IP**
(billed when detached), EBS snapshots, CloudWatch log groups, S3 buckets in
other regions.

## 7. Where to pick up on the Mac

In order. Everything above this line is migration mechanics; this is the actual
work queue.

1. **`listing_photos.ai_tags` backfill.** Blocks the whole of §2.3–2.5: tour,
   hotspot pins, per-room sections. `apps/web/lib/poi/vision-tagger.ts` is the
   tagger and it reads `ANTHROPIC_API_KEY` — port it to Bedrock first (§5).
   104 `fmls-import` listings have zero tags; 10 older ones have them, so the
   render path is already proven end to end.
2. **Port the remaining `ANTHROPIC_API_KEY` call sites to Bedrock** —
   `apps/web/lib/poi/*`, `scripts/render-worker/*`. On the Mac that means
   explicit AWS credentials, not an instance role.
3. **Verify Real-ESRGAN on M4.** `scripts/render-worker/enhance.py` prefers
   ESRGAN and silently falls back to FSRCNN; EC2 always fell back. Run
   `enhance_sample.py` and compare before trusting a full re-render.
4. **Resume the 5 paused cron jobs** once the Mac gateway is the only one
   running. Delivery targets were remapped away from the dead workspace, but
   they have never fired since.

Nothing in the current tree is half-finished mid-edit — the working tree was
clean, suites green, at the last EC2 commit.
