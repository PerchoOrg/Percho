# Seedance AI-video worker (local)

Web (Vercel/localhost) enqueues into `ai_tour_videos`; this worker owns
`OPENROUTER_API_KEY` and does the generation.

## Run once (foreground)

```bash
pnpm --filter @percho/web seedance-worker
```

## Install as launchd agent (always-on, like render-worker)

```bash
cp scripts/seedance-worker/com.percho.seedance-worker.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.percho.seedance-worker.plist
# restart:
launchctl kickstart -k gui/$(id -u)/com.percho.seedance-worker
# logs:
tail -f /tmp/seedance-worker.log
```

Requires `OPENROUTER_API_KEY` in repo-root `.env.local` (worker loads it via
dotenv). Idles (no OpenRouter calls) when the key is absent.
