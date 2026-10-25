# iOS Release Runbook

Plan: Apple Developer Program (**Individual**) → EAS cloud build → TestFlight →
App Store. This file is the working checklist; tick items off in PRs as they
land. The long pole is Apple's own process, not code.

**Revised 2026-08-30**: the original (2026-08-23) version of this file assumed
an *Organization* enrollment and a D-U-N-S number. The owner enrolled as an
**Individual** and the $99 has been paid, so Stage 0 is now a verification
step, not a two-week wait. Everything that changes with an individual account
is marked ⚠ below.

**Status 2026-09-29**: the long pole is no longer Apple — it is the listing
source. Since phase304 the only listings in production are six Bridge
*sandbox* rows, five of them labelled "FMLS test listing — not for sale", and
the app reads the same API as percho.co. Those cannot ship in a public app
(Guideline 2.2: demo/test content belongs in TestFlight), so the App Store
submission waits on a licensed feed while everything else proceeds. The
same day's provenance audit (`docs/references/content-provenance.md`) added
a second gate: the community layer is built on scraped Nextdoor data and on
Google Places / builder photos we have no clear right to store and film.
**Stage 4** below is the current plan; Stages 0–3 are history plus the
owner-only forms.

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
| Age rating | all-none questionnaire → 4+; `userGeneratedContent: true` set 2026-10-25 (still 4+) |
| **v1.0 record (2026-10-25, phase308)** | build **1.0.0 (7)** attached; description / keywords / promotional text / marketing URL from the store-copy draft below; subtitle `Feel the neighbourhood first`; copyright `2026 Percho Inc.`; **release type MANUAL**; price **Free** (base territory USA); App Review details: contact Qiaoxuan Xue, demo account `app-review@percho.co` (password sign-in, buyer role, created over the Supabase admin API — the password is only in App Store Connect), notes as in DEVLOG phase308 |

### Store sprint (2026-09-04, phase172) — what the launch build changes

The feature set froze with the store-launch phases A–F: Sign in with Apple +
email code, saves on the account, tour requests, resident reviews with a
human approval gate, FMLS rows hard-deleted except the video-backed ones,
and event telemetry keyed by a random install id (`lib/install-id.ts`).
That flips three of the "still empty" rows below from *wait* to *fill*.

**Build: 1.0.0 (5) — EAS `2b38d4c6-6c54-4a22-a096-fced58ac353c`, FINISHED
2026-09-05.** This is the build to attach to the 1.0.0 version record once
the owner's product review on TestFlight is done. Getting there took two
fixes worth remembering:

1. The App ID `co.percho.app` (`6TNYULX4NA`) had only `IN_APP_PURCHASE`;
   Phase A's `ios.usesAppleSignIn: true` needs **Sign In with Apple** on the
   App ID too, or Xcode fails with *provisioning profile doesn't include the
   Sign In with Apple capability*. Owner ticked it in the Developer Portal
   (Identifiers → co.percho.app) and an interactive `eas build` regenerated
   profile `95776Q4K89` with the capability. (ASC API equivalent, if ever
   needed again: `POST /v1/bundleIdCapabilities`, `capabilityType:
   "APPLE_ID_AUTH"`, settings `APPLE_ID_AUTH_APP_CONSENT` /
   `PRIMARY_APP_CONSENT`.)
2. `babel-preset-expo` was never a declared dependency; EAS's pnpm 11 does
   not hoist it out of expo's tree the way local pnpm 9 does, so Metro on
   the build host failed with *Cannot find module 'babel-preset-expo'*
   (shown by EAS as "reading 'transformFile'"). Declared in
   `apps/mobile/package.json` devDependencies (phase173).

`buildNumber` is `5` in `app.json` and committed. 3 and 4 were consumed by
failed/cancelled attempts and never reached Apple.

Everything else in this section was done from the frozen feature set and
does not depend on the build.

**Legal pages** are real now: `/privacy` and `/terms` describe the shipped
app (accounts, saves, tour requests, reviews, telemetry, moderation and the
report path). Both still carry a header comment saying *not reviewed by
counsel* — the entity name ("Percho", not a registered "Percho, Inc.") and
the governing-law clause in `/terms` §10 are the owner's to confirm.

### App Privacy labels — set these (legal attestation, owner submits)

**v1.0 (communities only) answers differently from the table below:** the
tour request form lives on the listing screen, which v1.0 does not have, so
**Name** and **Phone Number** are *not collected*; Email Address stays
(sign-in only). Everything else in the table holds.

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

Rewritten 2026-10-25 (phase308) for **v1.0 = communities only**: the build
shows no home listings (`apps/mobile/lib/listings-in-app.ts`), so nothing
below may promise homes for sale, prices or tour requests — App Review
compares the description with the app (2.3.1 accuracy). The old "every clip
is made from real photos" line is gone too: Seedance motion and outpainted
edges are AI-generated (provenance audit item 6).

- **Name** (30): `Percho`
- **Subtitle** (30): `Feel the neighbourhood first`
- **Promotional text** (170, editable without a new build): `Short films of
  real Atlanta neighbourhoods, with the schools and costs that come with
  them. Browse without an account; sign in to keep your saves.`
- **Keywords** (100, comma-separated, no spaces after commas):
  `neighborhood,atlanta,relocate,moving,home buying,suburbs,schools,cost of living,community,area guide`
- **Description** (4000):

  ```
  Percho is house hunting in the order you actually decide: neighbourhood
  first.

  Swipe through short films of real Atlanta communities — the streets, the
  parks, the coffee place — before you ever drive there. Films are cut
  from photos of each place; some of the motion is AI-assisted.

  WHAT YOU CAN DO
  • Watch a short film of a neighbourhood
  • See what's nearby: the groceries, parks and schools each film visits
  • Check what living there costs: each county's property tax rate and
    utility estimates
  • Compare neighbourhoods and areas side by side
  • Read what residents say about living there — every review is read by
    a person before it appears
  • Save neighbourhoods and areas; sign in and they follow you to any device

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
- Reviewer note, v1.0: "This version covers neighbourhoods only; home
  listings arrive in a later version." — so a reviewer does not go looking
  for a listings screen.
- Fair-housing note for the reviewer field ("Notes"): reviews are limited to
  four neighbourhood dimensions (quiet, walkable, neighbourly, value) and are
  moderated. Schools appear only as the state's published proficiency % for
  the nearest public school — no rating. Safety is **not scored**; Compare
  carries a Safety heading that says "not scored on purpose — no source we
  trust" and lists only cited research notes (`lib/listing/compare.ts`).
  (Corrected 2026-09-29 — the earlier draft said the app "does not rate
  schools or safety", which a reviewer opening Compare would see a Safety
  section contradict.) Link https://www.percho.co/fair-housing.

### Still owner-only — nothing here can be done from this Mac

| Item | Why |
|---|---|
| Screenshots | 6.9" iPhone **1320×2868**, up to 10, must be the real UI. No Xcode on this Mac ⇒ no simulator; capture on the owner's device from build 6 (if the phone is not a 6.9" model, the agent frames the captures onto 1320×2868 canvases with a caption line). Set: feed card with a film, community tour, community page with reviews, listing explore, Search map, Saved, tour request sheet. |
| App Privacy labels | Table above — an attestation the account holder signs. |
| Age rating `userGeneratedContent: true` | Same questionnaire; re-answer and save. |
| Seller name | ⚠ Individual account ⇒ shows **Qiaoxuan Xue**, not "Percho". Needs a legal-entity-name-change request with a DBA certificate, which has a waiting period — start it *before* submission, not at it. ⚠ 2026-09-29: unverified — Apple's organization-enrollment page says it does not accept DBAs or trade names. The path known to work is a registered legal entity + D-U-N-S, then asking Apple to convert the membership (weeks). Confirm with Apple Developer Support before relying on the DBA route. |
| Legal review of `/privacy` and `/terms` | Entity name, governing law (§10), CCPA/GDPR wording. |
| Sentry DSN | Crash reporting is wired to nothing; if you want it for launch, create the project, add the DSN to EAS secrets, and add the Diagnostics label. |
| MLS channel | `docs/mls-integration/go-live.md` — licence + Bridge dataset credentials. The store build does not wait on it (photo cards fill the feed). |
| Submit for review | Attach build 5 to version 1.0.0, fill the above, press Submit. **Not done by the agent** — first-submission timing and the review notes are the owner's call. |

Known review risks (first submission commonly bounces once; budget 1–2 wks):
- Guideline 2.1 (performance): make sure production API has inventory when
  review runs — an empty feed looks broken. Give the reviewer a signed-in
  path too: the sign-in code lands in email, so either provide a demo
  account or note that Sign in with Apple works with any Apple ID.
  (2026-09-29: password sign-in exists since phase197 — create a password
  account for the reviewer and put it in the review notes.)
- Guideline 2.2 (beta/demo content): no listing labelled "test" or "not for
  sale" may be in the feed on review day. See Stage 4.
- 1.2 (UGC): covered above; make sure the admin queue is actually watched
  during review week — a pending review that never appears is fine, a
  rejected one is fine, an offensive one that appears is not.
- 5.1.1 (data collection): labels must match the table above; the reviewer
  compares them with what the app visibly asks for.
- 5.1.1(v) (account deletion): You tab → Delete account; it is in the app,
  keep it reachable within two taps.

## Stage 4 — launch plan (2026-09-29, phase305)

**Gates** (both needed before submitting for App Store review):
1. the feed carries licensed, for-sale listings (4.4);
2. the community layer clears the provenance audit (4.3) — Nextdoor data
   and covers, Google Places photos and scraped builder imagery sit under
   the community card and film, and the FMLS licence fixes none of them.

Build, TestFlight and the ASC forms run ahead of both.

### 4.1 Build 6 from main (OWNER runs — the agent's `eas build` is blocked)

Build 5 (2026-09-05) predates ~100 `apps/mobile` commits (v1.4–v1.10). The
agent's `eas build` was refused by the harness permission classifier as a
production deploy, so this is the owner's command until that rule changes:

```bash
git -C ~/Workspace/Percho pull --ff-only
cd ~/Workspace/Percho && pnpm install          # phase305.1 moved 12 Expo packages
cd apps/mobile
npx eas-cli build --platform ios --profile production   # → 1.0.0 (6)
# add the three ascApiKey* fields to eas.json (Stage 2 → Submitting), then:
npx eas-cli submit --platform ios --latest --non-interactive --groups Internal
git checkout -- eas.json
```

`autoIncrement` leaves `app.json` saying `"buildNumber": "6"` in the
reference worktree — that edit must reach main (the next agent session lands
it; see Stage 2 on why `app.json` must match what shipped).

Pre-build gates were run on phase305.1: typecheck 0, mobile lint 0 errors,
mobile 808 / web 1198 tests, `expo export` 3.97 MB hbc, `expo-doctor` 21/21.

### 4.2 Device pass on build 6 (OWNER, ~20 min)

Things no build has proven yet: **Sign in with Apple** end to end (the
Supabase Apple provider was an owner action on 2026-09-04 with no record of
being done — a failure here means that config), email code, password sign-in,
set password, **delete account**, tour request → the lead email arrives,
submit a review → it appears in `/admin/pipeline/reviews`. Then the feed,
a community film, Search map, Compare, Saved.

### 4.3 Compliance before anything is public

- Content provenance — `docs/references/content-provenance.md`. App Store
  Connect asks the account holder to attest rights to third-party content;
  that audit is what the answer rests on. Its items 1–3 (Nextdoor, Google
  Places photos, scraped builder/agent imagery) are the second launch gate
  and need counsel or the rights holder; items 4–7 (MLS credit on mobile,
  MacLeod music credit, "real photos" store copy, legacy GreatSchools read
  policies) are small engineering fixes.
- Rotate the Supabase service-role key before the app is public — found in
  plaintext in August (DEVLOG 2026-08-19 09:05 UTC), unrotated then, no
  record of it since. Owner, in the Supabase dashboard, then every
  place it is set (Vercel, `.env.local` on the render host, Edge Function
  secrets).
- Privacy labels (Stage 3 table) still hold: since build 5 the app gained no
  new server write — the writes are still `/api/leads`, `/api/mobile/events`,
  `DELETE /api/mobile/account`, and saves/reviews through Supabase RLS.

### 4.4 Listings (OWNER + Vivian — the gate)

FMLS extended the Bridge test data 30 days on 2026-09-28 (to about
2026-10-28) and is still reviewing; Vivian asked the same day whether
turning listing photos into a motion film is permitted. When the licence
arrives: `docs/mls-integration/go-live.md` §3 (projection + sync cron,
~2–4 days), the IDX attribution moves onto the card face, and listing cards
become photo-only if FMLS says no to films (`mediaKind: 'photo'` already
exists). The sandbox rows come out of the feed the same day.

Fallback if the licence stalls: communities plus the listings Vivian holds
as listing agent (hers to publish), no MLS data at all. Thin, but not a demo.

### 4.5 Submit

External TestFlight first (one Beta App Review, ~1 day) with a handful of
real buyers; then submit with **manual release** so the owner picks the day.
Budget one or two bounces. Launch week: someone reads the review queue and
hello@percho.co daily — the terms promise 24 h.

## Later — explicitly out of scope for v1

- Push notifications (05 §5.4) — adds capability + review surface; ship
  after v1 is live.
- Universal links (percho.co/l/…) — needs AASA file on the web app.
