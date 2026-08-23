# iOS Release Runbook

Owner-approved plan (2026-08-23): company Apple account → EAS build →
TestFlight → App Store. This file is the working checklist; tick items off in
PRs as they land. The long pole is Apple's own process, not code — start
Stage 0 immediately, everything else parallelizes.

## Stage 0 — Apple Developer enrollment (OWNER, ~1–2 weeks for a company)

1. A **D-U-N-S number** for the company (free, dnb.com; 1–2 weeks if the
   company doesn't have one — check first at
   https://developer.apple.com/enroll/duns-lookup/).
2. Enroll the company in the Apple Developer Program ($99/yr) at
   https://developer.apple.com/programs/enroll/ using an Apple ID controlled
   by the company. Enrollment as an Organization requires the D-U-N-S, legal
   entity name, and a person with legal authority.
3. Once approved: invite the build operator (this repo's agents run EAS; the
   owner holds the account) — App Store Connect → Users and Access, role
   **App Manager** is enough for uploads.

## Stage 1 — build readiness (DONE in phase118, verify on next session)

- [x] App icon `apps/mobile/assets/icon.png` — 1024², forest green
      (#0E6B57) + DM Serif "P". **Placeholder-quality by design**: owner may
      replace the art; keep 1024×1024 PNG, no transparency, no rounded
      corners (iOS masks its own).
- [x] Splash via `expo-splash-screen` plugin — green P on warm paper
      (#F7F5F0), `assets/splash-icon.png`.
- [x] `app.json`: `version: 1.0.0`, `ios.buildNumber: "1"`,
      `ITSAppUsesNonExemptEncryption: false` (HTTPS-only ⇒ exempt; skips the
      export-compliance question per upload).
- [x] `eas.json`: `development` / `preview` (internal) / `production`
      (autoIncrement) profiles.
- [x] Bundle identifier `co.percho.app` (already set).
- [x] `expo export --platform ios` bundles clean (checked 2026-08-23).

## Stage 2 — first build + TestFlight (agent + owner's Mac, needs Stage 0)

```bash
cd apps/mobile
npx eas-cli login                 # owner's Apple-linked Expo account
npx eas-cli build --platform ios --profile production
# First run walks through credentials: let EAS manage certs + profiles.
npx eas-cli submit --platform ios --latest
```

- App Store Connect: create the app record (name **Percho**, bundle
  `co.percho.app`, primary language en-US) — EAS submit can create it or do
  it by hand first.
- Internal TestFlight: add owner + Vivian as internal testers → installable
  minutes after processing, no review.
- External testers require one Beta App Review (~1 day).
- Device pass: the three tabs (Saved / You / Search focus), video feed,
  community tour scrub — the things only a phone shows.

## Stage 3 — App Store submission

Metadata checklist (App Store Connect):

| Item | Value / note |
|---|---|
| Privacy policy URL | https://www.percho.co/privacy (live, verified 200) |
| App Privacy labels | **Data Not Collected** — no accounts, no analytics SDK, no ads, no tracking; the app talks only to percho.co for listings. Owner confirms before submitting: this claim must stay true. |
| Category | Lifestyle (secondary: none) |
| Age rating | 4+ (questionnaire: all "No") |
| Screenshots | 6.9" (1320×2868) required; 6.5" optional. Feed card, community tour, listing explore, Search map, Saved. Take on device/simulator. |
| Description / keywords | Draft at submission time; pitch = swipe-first home discovery, video tours. |
| Review notes | "No account or login — the app is fully usable anonymously on launch." |
| ATT prompt | None (no tracking) — do not add one. |

Known review risks (first submission commonly bounces once; budget 1–2 wks):
- Guideline 2.1 (performance): make sure production API has inventory when
  review runs — an empty feed looks broken.
- 4.2 (minimum functionality): unlikely — the app is feature-complete.
- 5.1.1 (data collection): clean while there are no accounts; revisit labels
  the day accounts land.

## Later — explicitly out of scope for v1

- Push notifications (05 §5.4) — adds capability + review surface; ship
  after v1 is live.
- Universal links (percho.co/l/…) — needs AASA file on the web app.
- Accounts / sync — changes the privacy labels and adds the
  account-deletion requirement (Guideline 5.1.1(v)); plan before building.
