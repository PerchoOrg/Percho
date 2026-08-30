# iOS Release Runbook

Plan: Apple Developer Program (**Individual**) → EAS cloud build → TestFlight →
App Store. This file is the working checklist; tick items off in PRs as they
land. The long pole is Apple's own process, not code.

**Revised 2026-08-30**: the original (2026-08-23) version of this file assumed
an *Organization* enrollment and a D-U-N-S number. The owner enrolled as an
**Individual** and the $99 has been paid, so Stage 0 is now a verification
step, not a two-week wait. Everything that changes with an individual account
is marked ⚠ below.

## Stage 0 — confirm the membership is live (OWNER)

Enrollment is paid but was last seen *pending activation*. Apple takes
24–48 h after payment; nothing below works until it flips to active.

1. Sign in to https://developer.apple.com/account with **the Gmail Apple ID**.
   ⚠ Not the old QQ address — that account is not part of this release and
   must not be touched or merged.
2. Membership is active when **Certificates, Identifiers & Profiles** and
   **App Store Connect** both appear in the sidebar. Pending shows a banner
   instead and the sidebar is bare.
3. Note the **Team ID** (Membership details, 10 chars). Stage 2 needs it.
4. If it is still pending >48 h after payment, contact Apple Developer
   Support — there is no way to force it from this side, and `eas build` will
   simply fail at the credentials step.

⚠ **Individual-account consequences** the owner should decide on before Stage 3:

- The **public seller name on the App Store is the owner's legal name**, not
  "Percho". Apple only shows a company name for Organization accounts, or for
  an individual who files a *legal entity name change* with a registered DBA /
  trade-name certificate. If "Percho" must be the visible seller, that request
  goes in before the app is released — it does not block TestFlight.
- Individual accounts can still invite App Store Connect users
  (Users and Access → role **App Manager** is enough to upload builds), so
  adding Vivian as a tester or a build operator is fine.
- No D-U-N-S number is needed. Ignore any instruction that mentions one.

## Stage 1 — build readiness (DONE; re-verified 2026-08-30)

Re-checked after the 27 mobile commits that landed between phase118 and
phase137:

- [x] `expo export --platform ios` bundles clean — 1535 modules, 4.22 MB hbc,
      27 assets, no warnings (2026-08-30).
- [x] `expo config --type prebuild` resolves: name `Percho`, version `1.0.0`,
      `ios.buildNumber "1"`, `supportsTablet false`,
      `ITSAppUsesNonExemptEncryption false`.
- [x] Bundle identifier **`co.percho.app`**. Owner-confirmed 2026-08-30 over
      `com.percho.app`: percho.co reverse-DNS is `co.percho.*`, and we do not
      own percho.com. ⚠ Permanent once the App Store Connect record exists.
- [x] App icon `apps/mobile/assets/icon.png` — 1024×1024, **no alpha channel**
      (verified with `sips`; an alpha channel is an automatic ITMS-90717
      rejection at upload). Forest green #0E6B57 + DM Serif "P".
      **Placeholder-quality by design** — owner may replace the art; keep
      1024², no transparency, no rounded corners (iOS masks its own).
- [x] Splash via `expo-splash-screen` plugin — green P on warm paper #F7F5F0,
      `assets/splash-icon.png` (alpha here is correct and expected).
- [x] `eas.json`: `development` / `preview` (internal) / `production`
      (autoIncrement) profiles.
- [x] **No iOS permission prompts to declare.** The app requests no location,
      camera, photo library, contacts, notifications or tracking; `MapView`
      never sets `showsUserLocation`. So no `NS*UsageDescription` strings are
      needed and a missing-purpose-string rejection is not a risk. If that
      ever changes, the purpose string must land in `app.json` `infoPlist` in
      the same PR as the API call.
- [ ] **Not linked to an EAS project yet** — `extra.eas.projectId` is absent.
      `eas init` in Stage 2 creates it and writes the id back into `app.json`;
      that edit must be committed.

⚠ **Xcode is not installed on this Mac** (Command Line Tools only). That is
fine and does not need fixing: EAS builds and submits in the cloud. Do not
attempt `expo run:ios` or a local archive.

## Stage 2 — first build + TestFlight (needs Stage 0 active)

Done already (2026-08-30): `eas login` (account `percho`), and `eas init` —
the project is `@percho/percho`, id `7e6cc487-2c4c-4006-aadc-6e9816d96513`,
committed to `app.json` in phase138.2.

⚠ **The first build must be run interactively, by a human, once.** An App
Store Connect API key is *not* sufficient to create the iOS build
credentials. With `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` /
`EXPO_ASC_ISSUER_ID` all set, `eas build --non-interactive` still stops at:

```
Distribution Certificate is not validated for non-interactive builds.
Credentials are not set up. Run this command again in interactive mode.
```

`eas credentials` has no `--non-interactive` flag at all. The ASC API key
covers *submission*; the distribution certificate and provisioning profile
are Developer Portal objects and need a real Apple ID session with 2FA. So
the owner runs this one command in his own terminal:

```bash
cd apps/mobile
npx eas-cli build --platform ios --profile production
# → "Log in to your Apple account?" yes → Gmail Apple ID → password → 2FA code
# → let EAS generate the Distribution Certificate + Provisioning Profile
```

The generated credentials are then stored on Expo's servers against
`@percho/percho`, and **every later build and submit can run
non-interactively**, including from an agent session:

```bash
npx eas-cli build --platform ios --profile production --non-interactive
npx eas-cli submit --platform ios --latest --non-interactive
```

⚠ The `production` profile sets `autoIncrement: true`, so the interactive
first build may ship as `buildNumber 2` rather than `1` and rewrite
`app.json`. That is cosmetic — the number only has to be unique and
increasing — but commit whatever `app.json` ends up saying.

App Store Connect app record — create it by hand first, or let `eas submit`
create it. Either way the values are:

| Field | Value |
|---|---|
| Name | `Percho` |
| Primary language | English (U.S.) |
| Bundle ID | `co.percho.app` |
| SKU | `percho-ios-001` (internal only, never shown to users) |
| Version | `1.0.0` / build `1` |

Then:

- Internal TestFlight: add the owner + Vivian as internal testers →
  installable minutes after processing, **no review**.
- External testers require one Beta App Review (~1 day).
- Device pass on the build: the three tabs (Saved / You / Search focus), video
  feed, community tour scrub — the things only a phone shows.

## Stage 3 — App Store submission

Metadata checklist (App Store Connect):

| Item | Value / note |
|---|---|
| Privacy policy URL | https://www.percho.co/privacy (verified 200, 2026-08-30) |
| **Support URL** (required) | https://www.percho.co/contact (verified 200, 2026-08-30). ⚠ `/support` is a 404 — do not enter it. |
| App Privacy labels | **Data Not Collected** — no accounts, no analytics SDK, no ads, no tracking; the app talks only to percho.co for listings. Owner confirms before submitting: this claim must stay true. |
| Category | Lifestyle (secondary: none) |
| Age rating | 4+ (questionnaire: all "No") |
| Screenshots | 6.9" (1320×2868) required; 6.5" optional. Feed card, community tour, listing explore, Search map, Saved. Take on device/simulator. |
| Description / keywords | Draft at submission time; pitch = swipe-first home discovery, video tours. |
| Review notes | "No account or login — the app is fully usable anonymously on launch." |
| ATT prompt | None (no tracking) — do not add one. |
| Seller name | ⚠ Owner's legal name unless the DBA request in Stage 0 is filed. |

Known review risks (first submission commonly bounces once; budget 1–2 wks):
- Guideline 2.1 (performance): make sure production API has inventory when
  review runs — an empty feed looks broken.
- 4.2 (minimum functionality): unlikely — the app is feature-complete.
- 5.1.1 (data collection): clean while there are no accounts; revisit labels
  the day accounts land.
- `app/dev-foundation.tsx` ships in the bundle but nothing links to it and it
  is not a tab, so a reviewer cannot reach it. Low risk; delete it if a
  reviewer ever cites 2.2 (beta content).

## Later — explicitly out of scope for v1

- Push notifications (05 §5.4) — adds capability + review surface; ship
  after v1 is live.
- Universal links (percho.co/l/…) — needs AASA file on the web app.
- Accounts / sync — changes the privacy labels and adds the
  account-deletion requirement (Guideline 5.1.1(v)); plan before building.
