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

### TestFlight (live 2026-08-30)

Set up over the App Store Connect API, because `eas submit
--auto-testflight-setup` silently skips ("No complete App Store Connect
credentials") — it reads the `EXPO_ASC_*` env vars, which were not exported
in that shell.

| Thing | Value |
|---|---|
| Internal group | `Internal` — `747516ea-e7ef-4879-8e28-60edb11bc76c` |
| Build attached | 1.0.0 (2) — `a40309ad-224b-4c1f-959d-f7b213f4f7f3`, `processingState VALID` |
| Tester | royxue812@gmail.com (Qiaoxuan Xue), state `INVITED` |

Export compliance resolved itself: the build reports
`usesNonExemptEncryption: false`, so `ITSAppUsesNonExemptEncryption` in
`app.json` did its job and there is no per-upload question.

- Internal testers install minutes after Apple finishes processing, **no
  review**. Processing took ~90 s for this build, not the 5–10 min Apple
  quotes.
- `hasAccessToAllBuilds` cannot be PATCHed onto an existing group (409 —
  create-time only), so a new build does not appear automatically. Pass
  `--groups Internal` on `eas submit` instead of recreating the group.
- External testers require one Beta App Review (~1 day).
- Device pass on the build: the three tabs (Saved / You / Search focus), video
  feed, community tour scrub — the things only a phone shows.

## Stage 3 — App Store submission (partially filled 2026-08-30)

Owner 2026-08-30: "app 还没有做完，今天不着急上线，现在能稳定测试就行" — so the
fields that do not depend on the finished product are filled, and the ones
that describe the shipped product are deliberately left empty.

App Store Connect version record: `da554336-…`, state `PREPARE_FOR_SUBMISSION`.

### Done (set over the App Store Connect API)

| Item | Value |
|---|---|
| Version string | `1.0.0` — was auto-created as `1.0`, which would not match the build's `CFBundleShortVersionString` |
| Support URL | https://www.percho.co/contact (`/support` is a 404 — do not use it) |
| Privacy policy URL | https://www.percho.co/privacy |
| Primary category | `LIFESTYLE` |
| Age rating | all-none questionnaire → 4+ |

### Store sprint (2026-09-04, phase172) — what the launch build changes

The feature set froze with the store-launch phases A–F: Sign in with Apple +
email code, saves on the account, tour requests, resident reviews with a
human approval gate, FMLS rows hard-deleted except the video-backed ones,
and event telemetry keyed by a random install id (`lib/install-id.ts`).
That flips three of the "still empty" rows below from *wait* to *fill*.

**Build**: 1.0.0 (3) — EAS build `adeba44c` from `phase172/store-sprint`.
`app.json` `ios.buildNumber` was bumped to `3` by `autoIncrement` and is
committed. This is the build to attach to the 1.0.0 version record.

**Legal pages** are real now: `/privacy` and `/terms` describe the shipped
app (accounts, saves, tour requests, reviews, telemetry, moderation and the
report path). Both still carry a header comment saying *not reviewed by
counsel* — the entity name ("Percho", not a registered "Percho, Inc.") and
the governing-law clause in `/terms` §10 are the owner's to confirm.

### App Privacy labels — set these (legal attestation, owner submits)

Apple asks per data type: collected? linked to identity? used for tracking?
Percho does no tracking (no ad SDK, no IDFA, nothing shared with data
brokers), so the tracking answer is **No** everywhere.

| Data type | Collected | Linked to you | Purpose | Where in the app |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | App functionality | Sign-in (Apple relay or the address the code went to); tour request form |
| Contact Info → Name | Yes | Yes | App functionality | Tour request form only (Apple's name from Sign in with Apple is not stored) |
| Contact Info → Phone Number | Yes (optional) | Yes | App functionality | Tour request form |
| Identifiers → User ID | Yes | Yes | App functionality | Supabase auth user id |
| Identifiers → Device ID | Yes | Yes when signed in | Analytics | Random install id generated on the phone (`lib/install-id.ts`); not the IDFA/IDFV |
| User Content → Other User Content | Yes | Yes | App functionality | Resident reviews (rating + text); tour request message |
| Usage Data → Product Interaction | Yes | Yes when signed in | Analytics, App functionality | Feed events (view, dwell, save, skip, search, filters) via `/api/mobile/events` |
| Location | **No** | — | — | The app never calls `requestForegroundPermissions`; ZIP/city search is typed |
| Contacts, Photos, Health, Financial, Browsing/Search history (outside the app), Diagnostics | **No** | — | — | Nothing collected. Crash reporting stays off until the owner adds a Sentry DSN (then add *Diagnostics → Crash Data, not linked*) |

Account deletion (5.1.1(v)) exists: You tab → Delete account, served by
`/api/mobile/account`. The privacy policy says so in §4.

### Age rating — one answer changes

Reviews are user-generated content that other users see, so
`userGeneratedContent` must be **`true`** (it was `false` on 2026-08-30).
Apple's 1.2 checklist for UGC apps and where Percho meets it:

- filter objectionable material → every review is `pending` until a human
  approves it in `/admin/pipeline/reviews`; nothing is auto-published;
- report mechanism → each review carries a **Report** link (mails
  hello@percho.co with the review id); terms §4 promise a response within
  24 hours;
- block abusive users → moderation is pre-publication, so an abusive user
  never reaches other users; the admin queue rejects them;
- contact information → hello@percho.co in the terms and legal@percho.co in
  the privacy policy.

Setting `userGeneratedContent: true` alone does not raise the rating above
4+; the other seven booleans stay `false`, `gunsOrOtherWeapons` stays `NONE`.

### Store copy — draft (owner edits, then pastes into App Store Connect)

- **Name** (30): `Percho`
- **Subtitle** (30): `Feel the neighbourhood first`
- **Promotional text** (170, editable without a new build): `Short films of
  real Atlanta neighbourhoods and the homes for sale in them. Browse
  without an account; sign in to keep your saves.`
- **Keywords** (100, comma-separated, no spaces after commas):
  `homes,houses,real estate,neighborhood,atlanta,house hunting,home buying,community,tour,relocate`
- **Description** (4000):

  ```
  Percho is house hunting in the order you actually decide: neighbourhood
  first, house second.

  Swipe through short films of real communities — the streets, the parks,
  the coffee place, the school-run traffic — and the homes for sale inside
  them. Every clip is made from real photos of that place, not stock
  footage.

  WHAT YOU CAN DO
  • Watch a 60-second film of a neighbourhood before you ever drive there
  • See the homes for sale in it, with photos, price, beds and baths
  • Explore what's nearby: groceries, parks, schools, commute anchors
  • Read what residents say about living there — every review is read by
    a person before it appears
  • Save homes and neighbourhoods; sign in and they follow you to any device
  • Ask for a tour in one tap — your request goes straight to the agent

  NO ACCOUNT NEEDED
  Browse everything without signing in. Sign in with Apple or an emailed
  code only when you want saves to sync or want to leave a review.

  WHERE
  Metro Atlanta today, more cities as we film them.

  Percho does not show ads, does not sell your information and does not
  track you across other apps.
  ```

- **What's New** (first release): `First release.`
- **Support URL**: https://www.percho.co/contact · **Marketing URL**: https://www.percho.co
- Fair-housing note for the reviewer field ("Notes"): reviews are limited to
  four neighbourhood dimensions (quiet, walkable, neighbourly, value) and are
  moderated; the app does not rate schools or safety. Link
  https://www.percho.co/fair-housing.

### Still owner-only — nothing here can be done from this Mac

| Item | Why |
|---|---|
| Screenshots | 6.9" iPhone **1320×2868**, up to 10, must be the real UI. No Xcode on this Mac ⇒ no simulator; capture on the owner's device from build 3. Set: feed card with a film, community tour, community page with reviews, listing explore, Search map, Saved, tour request sheet. |
| App Privacy labels | Table above — an attestation the account holder signs. |
| Age rating `userGeneratedContent: true` | Same questionnaire; re-answer and save. |
| Seller name | ⚠ Individual account ⇒ shows **Qiaoxuan Xue**, not "Percho". Needs a legal-entity-name-change request with a DBA certificate, which has a waiting period — start it *before* submission, not at it. |
| Legal review of `/privacy` and `/terms` | Entity name, governing law (§10), CCPA/GDPR wording. |
| Sentry DSN | Crash reporting is wired to nothing; if you want it for launch, create the project, add the DSN to EAS secrets, and add the Diagnostics label. |
| MLS channel | `docs/mls-integration/go-live.md` — licence + Bridge dataset credentials. The store build does not wait on it (photo cards fill the feed). |
| Submit for review | Attach build 3 to version 1.0.0, fill the above, press Submit. **Not done by the agent** — first-submission timing and the review notes are the owner's call. |

Known review risks (first submission commonly bounces once; budget 1–2 wks):
- Guideline 2.1 (performance): make sure production API has inventory when
  review runs — an empty feed looks broken. Give the reviewer a signed-in
  path too: the sign-in code lands in email, so either provide a demo
  account or note that Sign in with Apple works with any Apple ID.
- 1.2 (UGC): covered above; make sure the admin queue is actually watched
  during review week — a pending review that never appears is fine, a
  rejected one is fine, an offensive one that appears is not.
- 5.1.1 (data collection): labels must match the table above; the reviewer
  compares them with what the app visibly asks for.
- 5.1.1(v) (account deletion): You tab → Delete account; it is in the app,
  keep it reachable within two taps.

## Later — explicitly out of scope for v1

- Push notifications (05 §5.4) — adds capability + review surface; ship
  after v1 is live.
- Universal links (percho.co/l/…) — needs AASA file on the web app.
