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

## Stage 2 — first build + TestFlight (DONE 2026-08-30)

Membership confirmed active during the first build:
**Qiaoxuan Xue (Individual)**, Team ID `5C84L6M8HT`, provider `129382799`.

| Thing | Value |
|---|---|
| Expo account | `percho` |
| EAS project | `@percho/percho` — `7e6cc487-2c4c-4006-aadc-6e9816d96513` |
| Bundle ID (registered) | `co.percho.app` — portal id `6TNYULX4NA` |
| App Store Connect app | `6806748456` — name Percho, SKU `percho-ios-001`, en-US |
| First build | `de77e59e-c0f7-4f9f-ac13-d6a5f6e78f2d` — 1.0.0 (2) |
| Distribution cert | serial `DDC05B9FC269B0609087CB6F23D2590`, expires 2027-08-30 |
| Provisioning profile | `95776Q4K89`, expires 2027-08-30 |

`buildNumber` went 1 → 2 on that first build because the `production` profile
has `autoIncrement: true`. `app.json` was updated to match (phase138.4) — it
must always say what actually shipped, or the next increment collides.

### What needed a human, and what did not

**Needed a human, once**: creating the distribution certificate and
provisioning profile. An App Store Connect API key does *not* cover this —
those are Developer Portal objects and need an Apple ID session with 2FA.
`eas credentials` has no `--non-interactive` flag at all. With all three
`EXPO_ASC_*` vars set, `eas build --non-interactive` still stops at:

```
Distribution Certificate is not validated for non-interactive builds.
Credentials are not set up. Run this command again in interactive mode.
```

Now that they exist they are stored on Expo's servers against
`@percho/percho`, so **this will not be needed again** until they expire
(2027-08-30).

**Did not need a human**: everything else. Rebuilds are now just

```bash
cd apps/mobile
npx eas-cli build --platform ios --profile production --non-interactive
```

### Submitting

⚠ `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` are read
only by `eas testflight`, `eas submit:status` and `eas metadata` — **the
submit credential resolver ignores them** and fails with "App Store Connect
API Keys cannot be set up in --non-interactive mode". The key must come from
the submit profile in `eas.json`.

`ascAppId` is committed. The other three fields are not: `ascApiKeyPath` is
an absolute path on one machine, and the `.p8` must never sit near the repo
(it is a one-time download that authorises uploads for the whole account, and
`.gitignore` blocks `*.p8` since phase138.1). Add them locally, submit, then
revert:

```jsonc
// apps/mobile/eas.json → submit.production.ios, alongside ascAppId
"ascApiKeyPath": "/Users/<you>/.appstoreconnect/private_keys/AuthKey_P68W57U2G9.p8",
"ascApiKeyId": "P68W57U2G9",
"ascApiKeyIssuerId": "88793b4f-748d-40ef-b81e-c89b570f00d0"
```

```bash
npx eas-cli submit --platform ios --latest --non-interactive
git checkout -- eas.json   # do not commit the key path
```

The alternative, if this becomes a chore: run `eas credentials --platform
ios` once interactively and store the ASC key on Expo's servers — then the
eas.json edit is unnecessary. It needs a TTY but *not* Apple 2FA.

### TestFlight

- Internal testers install minutes after Apple finishes processing (5–10 min
  after upload), **no review**.
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
