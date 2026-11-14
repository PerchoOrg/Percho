# Percho iOS (Expo)

Expo + React Native app for the Percho iOS surface. Consumes
`@percho/shared` for persona/scope/trait logic shared with `@percho/web`.

## Dev

```bash
# From monorepo root
pnpm install
pnpm --filter @percho/mobile start
```

**Not Expo Go.** The App Store's Expo Go follows the newest Expo SDK and the
app uses native modules Expo Go does not carry (Google Sign-In), so it cannot
open this project (phase313–314). The phone runs our own **development
client** instead, installed from TestFlight:

- Dev client: the `development-testflight` EAS profile, currently 1.0.1 (10).
  Open it, enter the Metro URL, and it loads the latest JS like Expo Go did.
  Rebuild it only when native code or `app.json` plugins change.
- Store build: what App Store users run; JS is bundled in, no Metro.
- Both are bundle `co.percho.app`, so installing one replaces the other — pick
  the build in TestFlight (or the App Store for the live one).

Build and submit steps (and why the ASC key is added to `eas.json` only for
the duration of a submit) are in `docs/ios-release.md`.

## Structure

- `app/` — expo-router file-based routes
  - `index.tsx` — landing
  - `feed.tsx` — Tinder-style swipe feed (skeleton, 3 mock cards)
- `metro.config.js` — monorepo-aware Metro (watches `@percho/shared`)
- `app.json` — Expo config

## Phase 1 status

Skeleton only. Ships:
- 3 mock cards with horizontal swipe (Reanimated + gesture-handler)
- Live persona chip driven by `@percho/shared` trait tally
- Card stack (top + next visible-behind)

Not yet shipped (Phase 1 remainder):
- Real API pagination against `/api/browse/feed`
- Flip-to-data-face (opacity crossfade)
- Long-press deep peek modal
- Video autoplay via expo-video
- Scope strip ask-cards
- Auth (Supabase magic link + Sign in with Apple)

See `paginated-feed-and-swipe-ui` skill for the design invariants that
govern every feed mechanic.
