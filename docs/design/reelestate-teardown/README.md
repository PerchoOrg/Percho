# ReelEstate UI Teardown — Percho Redesign Reference

> **Purpose.** Rebuild Percho's mobile-first UI 1:1 against ReelEstate's design language, with light adjustments for Percho's positioning (GA/Atlanta agent-only, community-vibe reels, photo→video pipeline). This file is the single source of truth for tomorrow's implementation kick-off.

**Source app**: `ReelEstate: Reels Meet Homes` by Gabriel Simao / Beaker Ice Studios
**App Store**: https://apps.apple.com/us/app/reelestate-reels-meet-homes/id6749325123
**Website**: https://reelestate.dev
**Version teardown was captured against**: v1.0.2 (released 2026-06-17)
**Screenshots**: `./screenshots/` — 10 App Store shots (`screen-00.png`..`screen-09.png`, 1290×2796 native iPhone Pro Max) + 9 named marketing shots pulled from the reelestate.dev homepage (`01-office-profile.png` .. `09-messages.png`, plus `reel-hero.png`).

---

## 0. Executive summary

ReelEstate is a **dark-mode, neon-accent, iOS-native short-form video app for real estate**. Think TikTok/Reels for listings — vertical reels, follow feed, agent profiles, DM inbox, commute calculator, MLS AI import, brokerage seats, buyer "Circles" for co-shopping.

**Aesthetic in one line**: near-black background + electric cyan primary + magenta/purple secondary + gradient pills + glassy translucent overlays + rounded 16-24 px cards + SF Pro Rounded / Inter typography.

**Percho differences to bake in from day one**:
| Area | ReelEstate | Percho |
|---|---|---|
| Market | US-wide, MA-lean, rentals + sales | GA/Atlanta selling only |
| Community anchor | City-level | **Subdivision** (Waterside), POI 3km from subdivision entrance |
| Content pipeline | Agents record reels manually | **Photo→video batch pipeline** (Ken Burns / auto slideshow) — batch onboarding beats reelestate's per-listing manual demo |
| "Community" meaning | Not surfaced strongly | House surroundings + neighborhood vibe (not kin/family) — reels can be POI/subdivision content, not just the home |
| Pricing model | $9.99/mo indiv, tiered office to $229.99 | Can 1:1 copy this |
| Multilingual buyer copy | English only | English + optional Chinese/Spanish/Vietnamese/Korean marketing copy (Phase 48 pivot) |

---

## 1. Design tokens (copy these into `tailwind.config.ts` day one)

### Colors
```ts
colors: {
  // Backgrounds — near-black, slightly navy-tinted
  bg: {
    DEFAULT: '#05070E',   // page bg (screens 03, 09)
    surface: '#0A1220',   // card fill
    elevated: '#101827',  // input fill, tab fill
    border:  '#12203A',   // hairline
  },
  // Cyan — primary brand accent (used everywhere)
  cyan: {
    DEFAULT: '#22D3EE',
    bright:  '#38D9F2',   // gradient start
    deep:    '#1EA7FF',   // gradient mid
    ink:     '#0E1B3D',   // dark navy for logo tile
  },
  // Blue — CTA gradient endpoint
  blue: {
    DEFAULT: '#2563EB',
    600:     '#3B82F6',
  },
  // Magenta / pink — destructive + secondary badges
  magenta: {
    DEFAULT: '#EC4899',
    700:     '#E11D74',
  },
  purple: {
    DEFAULT: '#8B5CF6',
    700:     '#7C3AED',
  },
  // Status
  ok:    '#22C55E',       // online dot
  warn:  '#F5C518',       // low-power / video-required
},

// Gradients (as bg-gradient utilities)
// primary CTA:   from-cyan-bright to-blue-600
// destructive:   from-magenta to-magenta-700
// gradient ring: conic pink→purple→cyan (avatar rings, tile borders)
```

### Radii
- Card: `rounded-2xl` (20 px) — property cards, message cards, stats card
- Pill/chip: `rounded-full` — filter chips, CTAs, price badge
- Small tile: `rounded-xl` (16 px) — reel thumbnails
- Navy logo tile: `rounded-[18px]` — top-left menu launcher

### Typography
Recommended: **Inter** (open-source, closest to SF Pro on the web). If we want the rounded look, add **SF Pro Rounded** local fallback for iOS Safari. Never use system default.

| Role | Size | Weight |
|---|---|---|
| Screen title (gradient wordmark) | 30–34pt | 700–800 |
| Price (detail hero) | 36–40pt | 700–900 |
| Price (card) | 28–30pt | 700 |
| Section header | 17pt | 600 |
| Body / row primary | 15–17pt | 500–600 |
| Body secondary / muted | 13–15pt | 400 |
| Chip / caption | 12–13pt | 600, uppercase, +1.5 tracking |
| Timestamp | 13pt | 400 |

### Spacing rhythm
- Screen edge margin: **16 px** (mobile), 20 px on iPhone Pro widths
- Card internal padding: **16 px**
- Card-to-card vertical gap: **20–24 px**
- Chip gap: **8 px**
- Icon stroke: 1.5–2 px, rounded terminals (Lucide `stroke-2 rounded-linecap`)

### Elevation / glass
- **Overlay glass**: `bg-black/40 backdrop-blur-md` with `border border-white/8`
- **Icon glow ring**: `shadow-[0_0_20px_rgba(34,211,238,0.35)]` on cyan icons
- **Tile border glow** (agent-profile stats): `border border-cyan-DEFAULT/60 shadow-[inset_0_0_12px_rgba(34,211,238,0.15)]`

---

## 2. Screen-by-screen teardown

### 2.1 Reel Hero / Feed — `reel-hero.png`, `screen-00.png`

**What it is**: The core value screen — vertical fullbleed video feed, TikTok-style. Photo/video fills the entire viewport; a translucent caption card floats bottom-left; right rail has interaction icons; top has segmented tabs.

**Layout (top → bottom)**:

1. **Top overlay row** (safe-area, ~56 px tall, transparent bg):
   - **Left**: Rounded-square navy tile (56×56, `rounded-[18px]`, `bg-cyan-ink`) with a 5-dot quincunx glyph in white → menu / app launcher.
   - **Center**: Two-tab segmented control (`Following` | `Trending`). Active tab has a **50-60 px wide, 2-3 px cyan underline with rounded ends** directly under the label. Inactive tab: white at 65% opacity.
   - **Right**: Circular button (~52 px), translucent light-gray fill + backdrop blur, white magnifier icon.

2. **Media layer**: Full-bleed 9:16 video (or first-frame photo). Aspect-fills. Behind everything else.

3. **Progress bar** (video only): Thin horizontal bar sitting **just above** the caption card. Filled portion in solid cyan `#22D3EE`, remainder in `rgba(255,255,255,0.25)`. Height ~2 px.

4. **Caption card** (bottom-left, floating, ~80% width, `rounded-2xl`, `bg-black/55 backdrop-blur-md`, 16 px padding):
   - **Row 1**: 48 px circular avatar (white ring border 2px) + agent name in white semibold ~19pt.
   - **Row 2**: Cyan location-arrow icon + `Austin, TX` in white ~15pt.
   - **Row 3 — chips row** (8 px gaps):
     - **Price chip**: cyan gradient fill (`#38D9F2 → #1FB6E8`), white bold text, e.g. `$635,000`. Full digits, no K/M.
     - **Bed chip**: black glass fill, bed icon + `4 beds`.
     - **Bath chip**: black glass fill, tub icon + `2 baths`.
   - **Row 4**: Caption text `Stunning home with a spacious backyard! 🌳🏠` in white ~14pt regular.

5. **Right rail** (vertical stack of circular buttons, ~52 px each, 16 px gaps, positioned right-edge just above caption card):
   - Heart (like)
   - Comment (bubble)
   - Share (up-arrow-from-tray)
   - Save (bookmark)
   - Each is `bg-black/40 backdrop-blur` with a **cyan ring border** and count label beneath in white ~12pt.

6. **`DETAILS` pill** (bottom-right or center-bottom, above tab bar): outlined pill, cyan border, cyan text, all-caps, +1.5 tracking. Tap → property detail (2.3).

7. **Bottom tab bar**: Not visible on this screen (feed goes full-bleed to home indicator). Standard tab bar appears on other screens — see 2.11.

**Percho notes**:
- Feed is where photo→video pipeline pays off — every subdivision listing gets an auto-generated Ken Burns reel using the existing photo set. No agent action required.
- **Caption**: Percho canonical caption is `{price} · {beds}bd/{baths}ba · {sqft}sqft` — matches reelestate's chip pattern. Keep our K/M variant (§74.14 override 22/26) but on feed use full digits like reelestate does.
- **Community tab**: Add a 3rd tab `Community` next to `Following`/`Trending` for subdivision + POI content (this is our moat #2).

---

### 2.2 Properties List — `03-properties-list.png`

**What it is**: Owner/agent-facing list of the agent's own listings. Single-column stacked cards, not a grid. Buyer feed uses the reel hero instead — this list is for management.

**Top nav**:
- Left: dot-grid menu button (~44 px circular, cyan-tinted outline).
- Center: title `Properties` in cyan bold ~32pt.
- Right: circular `+` button, cyan outline glow.

**Search bar** (full width, `rounded-2xl`, `bg-elevated`, 52 px tall, cyan hairline border): magnifier icon + placeholder `Search properties…`.

**Filter chip row** (three pills, 8 px gaps):
- `Filters` (sliders icon + label)
- `All Types` (label + chevron-down)
- `Sort` (arrows icon + label)
All same style: black glass fill, cyan hairline border, white text ~16pt.

**Property card** (`rounded-2xl`, `bg-surface`, 20 px card gaps):
- **4:3 landscape thumbnail**, top corners match card radius.
- **Overlays on image**:
  - Top-left: `ON MARKET` chip — cyan fill, uppercase white bold, ~11pt.
  - Top-right: circular magenta delete button (owner view — for buyer view swap for cyan heart).
- **Info block** (20 px padding):
  - Price white bold ~30pt (e.g. `$635,000`).
  - Address line 1 white semibold ~18pt.
  - Address line 2 muted `#94A3B8` ~14pt regular.
  - **4-column stats row** with faint vertical dividers: bed | bath | sqft | built. Each: cyan icon (top), white ~16pt semibold number, muted ~11pt label.

**Percho notes**:
- We already have canonical caption 26/13/13/13 (feed) + 15/11/11 (grid). Reelestate uses 30/18/14 + 16/11 — go slightly larger for parity.
- Address format: `{street}, {city}, {state}` on one line for card, split on detail. Zip only in detail (per our conventions).

---

### 2.3 Property Detail — `04-property-detail.png`

**Layout (long-scroll, no top tabs)**:

1. **Hero photo** (top ~45% of screen, `rounded-b-3xl`, ~24-28 px radius on bottom corners so it "floats"):
   - Back button top-left: circular black-glass chip with white `‹`.
   - Top-right cluster: **edit (pencil, cyan)**, **share (up-arrow, cyan)**, **heart (outline cyan)** — three circular chips.
   - Pagination bottom: 4 dot indicators + `+2` label left; `📷 1/7` counter pill right.

2. **Info block** (page bg, 16 px padding):
   - **Status chip**: `ON MARKET` — cyan bg, uppercase black bold, `rounded-full`.
   - **Price**: `$635,000` white bold ~38pt.
   - **Title (street)**: `159 Maplewood Ave` white semibold ~22pt.
   - **Full address**: 2 lines, muted `#94A3B8` ~15pt.

3. **Stats card** (`rounded-2xl`, `bg-surface`, subtle border, 4-column):
   - Each column: cyan icon top-left, big white number, small muted label.
   - Columns: `Beds` | `Baths` | `Sq Ft` | `Built`.

4. **`Watch 1 Reel` CTA** — inline video-play card. Tap → opens the vertical reel.

5. **About** — description card, matching stats card style. Section header: cyan list-icon + `About` white semibold ~17pt.

6. **Neighborhood** (collapsible) — cyan building icon + label + chevron. Expandable card.

7. **Commute Calculator** (see 2.4).

8. **Listed By** (agent card) — avatar left, name/role right, then full-width **`Message Agent`** button with primary CTA gradient (cyan→blue).

**Percho notes**:
- Status chip should support: `ON MARKET`, `NEW`, `OPEN HOUSE`, `PENDING`, `SOLD` — reelestate only shows one at a time; keep that discipline.
- Community section replaces "Neighborhood" for Percho: subdivision + POI 3km list (schools, coffee, gyms, grocery — from `google-places` skill / `poi-content-pipeline.md`).

---

### 2.4 Commute Calculator — `05-commute-calculator.png`

Sits as a card inside property detail. Not a standalone screen.

**Anatomy**:
- Header row: cyan car icon + `Commute Calculator` + expand/collapse chevron.
- **Destination chips**: preset saved destinations shown as pills, cyan-active state. E.g. `Work` (selected), `Downtown Austin`.
- **Search field** for custom destination: dark input, magnifier left, `×` clear right.
- **4-mode result rows** (all shown simultaneously, no toggle):
  - Driving: 🚗 3.4 mi — `14 min` (cyan bold, right-aligned)
  - Transit: 🚌 Estimated — `~22 min`
  - Walking: 🚶 3.4 mi — `1h 15m`
  - Biking: 🚴 3.4 mi — `16 min`
- **`Save Destination`** outlined pill CTA at bottom.

**Percho notes**: We should default the destination list to `Downtown Atlanta`, `Midtown`, `Buckhead`, `Perimeter`, `Hartsfield-Jackson`, custom.

---

### 2.5 Agent Profile — `02-agent-profile.png`

**Layout**:
- **No cover photo** — pure black bg.
- Top-left: dot-grid menu launcher.
- Top-right: **`Edit Profile`** pill (own view) — cyan→blue gradient fill, pencil icon, soft outer glow. For other-agent view, swap for `Follow` + `Message`.
- **Avatar**: ~140-150 px circular, **pink→purple→cyan conic gradient ring** ~4 px, small cyan camera badge bottom-right (own view only).
- **Identity card** (right of avatar):
  - Name (2-line bold ~28-30pt, white).
  - `AGENT` badge pill, cyan→blue gradient fill, uppercase white bold.
  - Brokerage line in **cyan** with building icon + chevron `›` (tap → office profile).
  - Role muted gray (`Licensed Salesperson`).
  - Credential row: 🇺🇸 flag + verified seal icon.
- **3 stat tiles** (equal-width, 12 px gutters, each `rounded-2xl` dark fill, 20 px radius):
  - `Reels 2` — **magenta glow border**.
  - `Properties 8` — **blue glow border**.
  - `Followers 1.2K` — **cyan glow border**.
  - Layout: icon top-center, big white number, muted gray label.
- **Filter chips** (purple→magenta gradient pills): `Residential`, `Commercial`, `Sales`, `Rentals`.
- **Segmented tab**: `Reels` (play icon, active with pink→purple underline) | `Properties` (building icon).
- **Grid**: 2-column, 9:16 aspect, 16 px radius, ~16 px gutter.
  - Reel overlays: pink 🗑 top-left (owner), gray play top-right, pink ❤ + count bottom-left, cyan 👁 + count bottom-left.

**Percho notes**:
- Percho agents are GA/Atlanta only → drop `Rentals` chip (we're sales-only).
- Follower count is aspirational at launch — hide the followers tile until >0, replace with `Reviews` count.

---

### 2.6 Office / Brokerage Profile — `01-office-profile.png`

Like agent profile but for a brokerage.

**Header**:
- No cover.
- Top-left: `×` close button. Top-right: `Following` outlined pill (viewer state).
- **Logo tile** ~72 px square, `rounded-2xl`, **cyan→purple gradient**, monogram (`MR`).
- **Name** bold white ~28pt.
- **`OFFICE` badge** with verified checkmark, cyan.
- Website row: globe icon + URL in cyan.
- Address row (rounded card, navigation icon): `875 Brookline St, Suite 410, Denver, CO 80203`.

**3 stat tiles**: `Agents 9` (cyan) | `Properties 27` (magenta) | `Followers 1.1K` (cyan).

**4-tab segmented**: `Reels` (active) | `Properties` | `Buildings` | `Agents`.

**Content**: 3-column grid of reel thumbnails with agent-avatar overlays + view counts.

**Percho notes**: `Buildings` tab is for multi-unit apartment/condo complexes — we probably drop it for GA sales focus. Keep `Reels/Properties/Agents`.

---

### 2.7 Messages / Inbox — `09-messages.png`

**Top nav**:
- Dot-grid menu left.
- Center: `Messages` cyan gradient wordmark with subtle glow.
- Right: cyan group-people icon (opens group compose).

**Search field**: full-width dark pill, magnifier icon, `Search conversations…` placeholder.

**Active users row**: horizontal scroll of circular avatars, cyan gradient ring + green presence dot bottom-right, name below.

**Conversation card** (`rounded-2xl`, dark fill, 16 px padding, 12-16 px gaps between cards, no dividers):
- Avatar (56-64 px circular) with green online dot.
- Name white bold ~17pt (group threads wrap to 2 lines, participants joined with `+`).
- **Optional property pill** (row 1 only): blue-tinted pill, home icon + address. Appears only when a listing is formally linked to the thread.
- Last message preview muted gray, 1-2 lines truncated.
- Timestamp top-right, muted gray ~13pt (`11:30 AM` same-day, `Apr 26` prior).

**Percho notes**:
- Every DM should attach the listing context automatically (per reelestate description: "every inquiry is already attached to a property"). This is a data-model requirement, not just UI.

---

### 2.8 Create Reel — `07-create-reel.png`

Two-step wizard (`1. Choose Property → 2. Upload Reel`).

**Top**:
- Dot-grid menu left.
- Center: `Create` cyan title.
- Sub-tabs: `Reel` (video icon, active, cyan underline) | `Property` (house icon).

**Step indicator**: horizontal 2-step tracker with filled cyan circle for active step.

**Step 1 card**: `Choose Property` — icon + heading + subtitle + horizontally scrollable property carousel (each card: photo, address, green price) + `+ Create New Property` gradient CTA button inside the card.

**Warning banner**: orange triangle + `Video required to create reel`.

**Bottom CTA**: full-width `Next >` gradient pill.

Step 2 (not shown): presumably file picker + trim + voice-narration + auto-subtitle + music.

**Percho notes**:
- **Skip step 1 entirely**: since we generate reels from existing listing photos automatically, Create Reel should default to "Auto-generate from photos" or "Upload custom video". Manual multi-step choose-property flow is reelestate's cold-start problem, not ours.

---

### 2.9 Create Property — `06-create-property.png`

Five-step wizard.

**Top**:
- Same nav as Create Reel, `Property` sub-tab active.

**Step indicator**: 5 numbered circles, step 1 cyan+glow, 2-5 dim outline.

**🎯 KEY: `Import from MLS Sheet / Photo` card** — prominent, orange-accented, sits directly under step indicator. Document-with-magnifier icon + label + chevron. This is the AI import shortcut (Gemini extracts price/beds/baths/sqft/address from MLS PDFs).

**"What are you listing?"** section: tag icon + heading. 2 large square selectors:
- `For Sale` (selected — cyan glow border, house icon).
- `For Rent` (unselected — key icon).

**"Property Type"** section: 2×2 grid of tiles — House (selected) | Condo | Townhouse | Land.

**`Next >`** gradient pill bottom.

**Percho notes**:
- Sales-only → drop `For Rent`.
- MLS import: use our existing `poi-content-pipeline.md` / `content-pipeline-v1.md` (Phase 24 docs). Reelestate uses Gemini; we can too.

---

### 2.10 Circles (buyer co-shop) — `08-circles.png`

**Top nav**: dot-grid menu left, `My Circles` cyan gradient title, group-people icon right.
Subtitle muted: `Co-search with your people`.

**Two CTA pills side-by-side**:
- `+ Create Circle` (filled cyan→blue gradient).
- `🔗 Join Circle` (outlined cyan).

**Circle card** (single card in empty-ish state):
- Large `HT` avatar circle with cyan glow ring.
- Title `Horizon Homes Team` white bold.
- `👥 3 members` label muted.
- 3 member avatars with green online dots.

**Percho notes**:
- Circles = Percho's family/co-shop equivalent. Voting UI (thumbs up/down/emoji per property) not shown in this screen but implied by the app description → design that in the circle-detail screen.
- Naming: probably rename to something Percho-specific. TBD product decision — `Circles` is fine to ship for now.

---

### 2.11 Global patterns

**Bottom tab bar** (visible on multiple screens, but hidden on immersive feed):
- Not clearly captured in these screenshots — the feed hides it, the list/detail views scroll to bottom. Best guess based on flow: `Feed | Search | Create (+) | Inbox | Profile`.
- **Implement as**: 5-slot bottom bar, `bg-black/85 backdrop-blur`, icons in muted white, active tab in cyan with tiny cyan dot underneath.

**Menu launcher (dot-grid)**: universal top-left affordance. Tap → sheet or drawer with: `Feed / Search / Circles / Messages / Create / Profile / Settings / Sign out`. Consider making this a `useMobileNav` context.

**Status chip variants** — use consistently across list + detail:
- `ON MARKET` — cyan
- `NEW` — cyan (with a `NEW` label instead)
- `OPEN HOUSE` — magenta gradient
- `PENDING` — amber
- `SOLD` — muted gray

**Number formatting**:
- Price: full digits with commas (`$635,000`) on hero + detail. K/M abbreviation allowed on very small chips only.
- Sqft: `1,820` with comma.
- Followers: `1.2K` / `12.5K` / `1.2M`.

**Icons**: Lucide (matches reelestate's stroke style). Rounded caps, 1.5-2 px stroke, cyan when accented, white when neutral, muted `#94A3B8` when secondary.

---

## 3. Percho differentiation checklist (do NOT copy 1:1)

- [ ] **Community tab** in feed (subdivision + POI-anchored reels).
- [ ] **Batch photo→video generator** in Create flow, default over manual reel upload.
- [ ] **GA/Atlanta only** — drop rental flows, drop non-GA regions from onboarding.
- [ ] **Sales only** — drop `For Rent` from Create Property step 1.
- [ ] **Neighborhood section** renamed → `Community` (subdivision-anchored, 3km POI radius).
- [ ] **Commute defaults**: Atlanta metros, not Austin.
- [ ] **Circles vote UI**: design thumbs-up/down + emoji reactions per property inside a circle (reelestate doesn't show it — we need to invent it).
- [ ] **Multilingual marketing copy generator** (Phase 48) — hook it into the agent-facing Create Property step 5 as an optional per-listing tool.

---

## 4. Pricing to 1:1 copy

Reelestate pricing (unchanged for Percho unless product decides otherwise):

| Plan | Price | Seats |
|---|---|---|
| Individual Agent | $9.99/mo · $79.99/yr (save 33%) | 1 |
| Office Starter | $34.99/mo · $349.99/yr | ≤5 |
| Office Growth | $59.99/mo · $599.99/yr | ≤10 |
| Office Pro | $124.99/mo · $999.99/yr | ≤25 |
| Office Enterprise | $229.99/mo | ≤50 |

Buyer / renter side: **free**, browse feed, save, follow agents, DM, create Circles.
Agent side: **7-day free trial**, then subscription.

---

## 5. Copy library (reelestate description verbatim, adapt for Percho)

Key marketing lines worth stealing / adapting for Percho landing:

> "Reels meet homes."
> "Instead of bouncing between one app for listings, another for reels, your inbox for inquiries, and a spreadsheet for open houses — do all of it in one place."
> "Built from the ground up for the way agents actually market and the way buyers actually shop."
> "Every inquiry is already attached to a property, so you never lose context."
> "Browse a vertical feed of real properties — a feed you'll actually want to scroll."
> "Private Circles to co-shop with your partner, parents, or roommates and vote on properties together."

**Percho adaptations**:
> "Atlanta homes, in reels."
> "Every home on Percho shows up as a scrollable reel — neighborhood, walk-through, commute, all in one flow."
> "Batch onboarding for agents: upload your MLS photos, we generate the reel."

---

## 6. Implementation kickoff order (tomorrow)

1. **Design tokens** into `tailwind.config.ts` (§1) — 30 min.
2. **Global chrome**: bottom tab bar + dot-grid menu launcher — 1 hr.
3. **Feed (reel hero)** — the pivotal screen. Rebuild against §2.1. Reuse existing Percho photo→video generator on backend. — 3-4 hrs.
4. **Property detail** (§2.3) — 2-3 hrs.
5. **Properties list** (§2.2) — 1 hr (mostly card component).
6. **Agent profile** (§2.5) — 2 hrs.
7. **Messages** (§2.7) — 2 hrs (data-model change: attach listing to every DM).
8. **Create Property** (§2.9) + **MLS AI import** — 4 hrs (Gemini integration).
9. **Circles** (§2.10) — day 2, product decision needed on voting UI.
10. **Office profile** (§2.6) — day 2 or defer (we may not have office plans at launch).

**Ship target**: iOS TestFlight build within 2 weeks. Web mirror concurrent (mobile-web-first responsive, matches Percho's existing stack).

---

## 7. Open product questions for tomorrow

1. **Do we keep `Circles` as a name**, or rename (e.g. `Groups`, `Rooms`)? Reelestate already owns `Circles` — non-blocking but consider.
2. **Community anchor**: subdivision-only, or also city + neighborhood? Ties into how the `Community` tab in feed sources content.
3. **Sales-only**: confirm we drop `For Rent` entirely for MVP. Adding it later is trivial.
4. **Bottom nav slots**: do we need `Circles` in the bottom bar, or bury it under menu launcher? First-time buyers won't know what Circles is — probably needs bottom slot with onboarding tooltip.
5. **Voting UI in Circles**: emoji reactions (👍/👎/😍) vs. star rating vs. thumbs-up count. Product call.

---

*Teardown captured 2026-07-14 by Percho design/eng. Rebuild starts 2026-07-15. See `./screenshots/` for pixel references.*
