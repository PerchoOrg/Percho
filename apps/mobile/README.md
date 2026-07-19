# Percho iOS (Expo)

Expo + React Native app for the Percho iOS surface. Consumes
`@percho/shared` for persona/scope/trait logic shared with `@percho/web`.

## Dev

```bash
# From monorepo root
pnpm install
pnpm --filter @percho/mobile start
```

Scan the QR code with the Expo Go app on your iPhone. For features that
require a dev client (expo-video, custom native modules), use:

```bash
pnpm --filter @percho/mobile ios      # requires Xcode
```

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
