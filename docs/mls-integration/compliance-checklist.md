# IDX / RESO compliance checklist

Anything user-visible that surfaces MLS data must satisfy the
requirements below before it ships. FMLS's IDX rules follow standard
NAR IDX with regional additions; when in doubt, over-comply.

## Display requirements

- [ ] **Attribution on every listing view**. Format:
      `Listing courtesy of {ListOfficeName}`. Must be visible on the
      same screen as the listing detail (not behind a click).
- [ ] **Broker attribution on aggregated views** (search results, map
      cards) — the office name must appear on each card, not just the
      detail page.
- [ ] **"Data last updated" timestamp** on any page that shows MLS
      data, sourced from `mirrored_at` (or `modification_timestamp`
      when older).

## Freshness

- [ ] **24-hour freshness rule.** Mirrored data must be no more than 24
      hours stale relative to the source. Our incremental sync runs
      every 15 minutes, but a cron failure of >24h means we must stop
      serving stale data. Add a health check that surfaces when the
      newest `modification_timestamp` in `mls_listings` is older than
      24h and triggers a page-level "temporarily unavailable" state.

## Opt-outs

- [ ] **`InternetEntireListingDisplayYN = false` MUST be filtered out**
      of every user-facing surface — search, autofill, detail pages,
      APIs, sitemaps. `null` is treated as displayable.
- [ ] Consider `InternetAddressDisplayYN` and
      `InternetAutomatedValuationDisplayYN` if we ever add address-hidden
      views or AVMs. Not required for MVP.

## Search-engine indexing

- [ ] **`<meta name="robots" content="noindex" />`** on public MLS
      listing detail pages until the broker signs off on public IDX
      indexing (some MLSes require an explicit approval for indexed
      display).
- [ ] Do NOT include mirrored MLS URLs in the sitemap until the above
      is signed off.

## Deletions

- [ ] **Hard delete pipeline for delisted properties.** When
      `StandardStatus` transitions to `Withdrawn`, `Expired`, or
      `Canceled`, remove the record from public surfaces within 24h.
      The sync worker should:
      1. Detect status transitions on incremental sync.
      2. Either delete from `mls_listings` or set a `hidden_at`
         timestamp and filter on it in queries.
      MVP: hard-delete, since we're not showing MLS data yet.
- [ ] **Media deletions cascade** — if a listing goes away, its
      `mls_media` rows go too (implement as an `on delete cascade` FK
      the day we add a public listing detail view).

## Data usage

- [ ] **No display of listing data outside the licensed IDX context.**
      Do not export mirrored data to marketing emails, third-party
      tools, or analytics platforms without explicit IDX approval.
- [ ] **Do not display buyer-agent commission fields** (post-NAR
      settlement). We aren't mirroring them anyway.

## Legal

- [ ] IDX license agreement signed with FMLS via broker of record.
- [ ] Bridge Interactive terms accepted (the broker does this in the
      Bridge portal during API provisioning).
- [ ] Privacy policy updated to note MLS data source and refresh
      cadence.

## Ownership

Broker of record is responsible for compliance signoff. Percho's
role is to make the technical enforcement automatic (filters,
attribution, freshness gates) so a code change can't accidentally
publish non-compliant data. Any change that touches this list should
be reviewed by the broker before merge.
