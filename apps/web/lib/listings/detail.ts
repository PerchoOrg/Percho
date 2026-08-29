/**
 * Listing detail DTO for the mobile explore screen (`02-listing.md` task-2).
 *
 * Sibling of `lib/feed/*`: the feed endpoint serves *inventory*, this serves one
 * listing in the depth §2.1–2.5 needs. Split out of the route file because
 * Next.js forbids a route module from exporting non-handlers, and because the
 * projection — which numbers are real and which are absent — is the part worth
 * unit-testing without HTTP.
 *
 * WHAT IS REAL, verified against the remote 2026-07-27 (265 listings):
 *   price 265 · sqft/year_built ~254-258 · hoa **10** · lat/lng **13**
 *   community_id **4** · k12_schools 15 rows total · NO list_date/dom column
 *
 * Three consequences, all deliberate and all visible in the DTO's shape:
 *
 * 1. **`daysOnMarket` comes from the `mls_listings` mirror only** (phase119 —
 *    the mirror postdates the 2026-07-27 audit above, which found no listing
 *    date on `listings` itself). Absent when the listing has no linked mirror
 *    row. An absent key beats `daysOnMarket: 0`, which would render as
 *    "listed today" on every unlinked home in the database.
 * 2. **The comps cohort is the CITY, not the subdivision.** §2.1 anchors on
 *    subdivision ("Waterside median $228"), but 4 of 265 rows carry a
 *    `community_id`. `cohortLabel` names what was actually measured so the UI
 *    cannot imply otherwise.
 * 3. **`hoa` is a text column** ("$85/mo", "250"). It is passed through RAW and
 *    parsed client-side by `lib/listing/monthly.ts`, so one parser serves the
 *    data-face row and the calculator instead of two that can disagree.
 *
 * Absent means the key is OMITTED. No nulls, no zeros, no "—" strings: the
 * client renders a missing key as absent, and that is the only honest rendering
 * of a number we do not have (`_MASTER.md`).
 */

import { streamManifestUrl, streamPosterUrl } from '@/lib/feed/vertical-videos';
import { mobileVideoUid } from '@/lib/feed/video-uid';
import type { Database } from '@/lib/supabase/database.types';
import { photoPublicUrl, preferredPhotoPath } from '@/lib/supabase/storage';
import { createClient as createPlainClient } from '@supabase/supabase-js';

/** Mirrors the tagger's output (`scripts/render-worker/photo_tagger.py`). */
export interface PhotoTagsDTO {
  room_type?: string | null;
  caption?: string | null;
  style_signals?: string[] | null;
  subject_bbox?: number[] | null;
  quality?: number | null;
  hero_score?: number | null;
  usable?: boolean | null;
}

export interface DetailPhotoDTO {
  id: string;
  url: string;
  /** Present only for photos the vision tagger has actually processed. */
  tags?: PhotoTagsDTO;
}

/** The comps cohort. `pricesUsd` drives the §2.1 #5 / §2.4 #3 histogram. */
export interface CompsCohortDTO {
  /** What was measured — a city name today. Never implies a subdivision. */
  cohortLabel: string;
  pricesUsd: number[];
  /** Median $/sqft across the cohort, when enough rows carry both fields. */
  medianPricePerSqft?: number;
  medianPricePerSqftSampleSize?: number;
}

/** The listing's own walkthrough video, when one has been rendered. */
export interface ListingVideoDTO {
  /** HLS manifest URL (Cloudflare Stream). */
  url: string;
  posterUrl: string;
  durationSec?: number;
}

/** One source under an insight card. */
export interface InsightBasisDTO {
  note: string;
  url?: string;
}

/**
 * One approved "After you move in" card from `listing_insights` (phase130).
 * `kind` is watch | plus | know and `theme` one of the shared themes; both
 * are passed through as strings so an unknown value degrades to a neutral
 * card rather than a dropped one.
 */
export interface InsightDTO {
  id: string;
  headline: string;
  detail: string;
  kind: string;
  theme: string;
  verify?: string;
  basis: InsightBasisDTO[];
  decisiveness: 1 | 2 | 3;
}

export interface ListingDetailDTO {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  /** RAW text from the column — parsed client-side. See file note 3. */
  hoaRaw?: string;
  /** Paragraphs, as stored. */
  description?: string[];
  photos: DetailPhotoDTO[];
  comps: CompsCohortDTO;
  communityId?: string;
  /**
   * From the `mls_listings` mirror (joined on `our_listing_id`), NOT the
   * `listings` table — file note 1 predates the MLS mirror. Absent when the
   * listing has no mirror row.
   */
  daysOnMarket?: number;
  /** RAW lot text from `listings.lot_size` ("0.31 acres", "13,504 sqft"…). */
  lotSizeRaw?: string;
  /** `mls_listings.lot_size_acres`, when the mirror has it and listings doesn't. */
  lotSizeAcres?: number;
  zip?: string;
  neighborhood?: string;
  /** `mls_listings.listing_key` — the FMLS number a buyer can quote. */
  mlsNumber?: string;
  video?: ListingVideoDTO;
  /** Approved "After you move in" cards. Absent when the listing has none. */
  insights?: InsightDTO[];
}

type ListingRow = {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  hoa: string | null;
  description: string[] | null;
  community_id: string | null;
  lot_size?: string | null;
  zip?: string | null;
  neighborhood?: string | null;
};

/** The slice of the `mls_listings` mirror the DTO reads. */
type MlsMirrorRow = {
  days_on_market: number | null;
  lot_size_acres: number | null;
  listing_key: string;
  /** IDX display gate. `false` means the MLS forbids showing this record. */
  internet_entire_listing_display_yn?: boolean | null;
};

/** The slice of a `listing_insights` row the DTO reads. */
export type InsightRow = Pick<
  Database['public']['Tables']['listing_insights']['Row'],
  'id' | 'headline' | 'detail' | 'kind' | 'theme' | 'verify' | 'basis' | 'decisiveness'
>;

/**
 * Approved rows → DTO. A row whose `basis` is not a non-empty array of
 * `{ note }` objects is dropped rather than shown without its sources — the
 * constraint guarantees the shape on write, but the projection is the last
 * reader and does not trust a jsonb column blindly.
 */
export function projectInsights(rows: InsightRow[]): InsightDTO[] {
  const out: InsightDTO[] = [];
  for (const r of rows) {
    if (!Array.isArray(r.basis)) continue;
    const basis: InsightBasisDTO[] = [];
    for (const b of r.basis) {
      if (typeof b !== 'object' || b === null || Array.isArray(b)) continue;
      const o = b as Record<string, unknown>;
      if (typeof o.note !== 'string' || o.note.length === 0) continue;
      basis.push({
        note: o.note,
        ...(typeof o.url === 'string' && o.url.length > 0 ? { url: o.url } : {}),
      });
    }
    if (basis.length === 0) continue;
    const d = r.decisiveness;
    out.push({
      id: r.id,
      headline: r.headline,
      detail: r.detail,
      kind: r.kind,
      theme: r.theme,
      ...(r.verify?.trim() ? { verify: r.verify.trim() } : {}),
      basis,
      decisiveness: d === 1 || d === 3 ? d : 2,
    });
  }
  return out;
}

/** A `listing_videos` row, uid-resolved by `mobileVideoUid`. */
type ListingVideoRow = {
  cf_video_id: string | null;
  cf_video_id_landscape: string | null;
  cf_video_id_square: string | null;
  duration_sec: number | null;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  ai_tags: PhotoTagsDTO | null;
  sort_order: number | null;
};

type CompRow = { price: number | null; sqft: number | null };

/**
 * Rows → DTO. Pure, so the "is this number real" rules are testable without a
 * database. Every optional field is written only when the value is really there.
 */
export function projectDetail(
  listing: ListingRow,
  photos: PhotoRow[],
  comps: CompRow[],
  extras: {
    mls?: MlsMirrorRow | null;
    video?: ListingVideoRow | null;
    insights?: InsightRow[];
  } = {},
): ListingDetailDTO {
  const video = projectVideo(extras.video ?? null);
  const insights = projectInsights(extras.insights ?? []);
  // A mirror row the MLS forbids displaying projects nothing at all.
  const mls =
    extras.mls && extras.mls.internet_entire_listing_display_yn !== false ? extras.mls : null;
  return {
    id: listing.id,
    slug: listing.slug,
    address: listing.address,
    city: listing.city,
    state: listing.state ?? 'GA',
    ...(listing.price != null && listing.price > 0 ? { price: listing.price } : {}),
    ...(listing.beds != null ? { beds: listing.beds } : {}),
    ...(listing.baths != null ? { baths: listing.baths } : {}),
    ...(listing.sqft != null && listing.sqft > 0 ? { sqft: listing.sqft } : {}),
    ...(listing.year_built != null ? { yearBuilt: listing.year_built } : {}),
    // Kept as text on purpose: "$85/mo" vs "250" vs "1200/yr" all appear in
    // production and one client-side parser owns that ambiguity.
    ...(listing.hoa?.trim() ? { hoaRaw: listing.hoa.trim() } : {}),
    ...(listing.description?.length ? { description: listing.description } : {}),
    ...(listing.community_id ? { communityId: listing.community_id } : {}),
    ...(listing.lot_size?.trim() ? { lotSizeRaw: listing.lot_size.trim() } : {}),
    ...(listing.zip?.trim() ? { zip: listing.zip.trim() } : {}),
    ...(listing.neighborhood?.trim() ? { neighborhood: listing.neighborhood.trim() } : {}),
    // DOM ≥ 0 only: the mirror's null means "not provided", never "listed today".
    ...(mls?.days_on_market != null && mls.days_on_market >= 0
      ? { daysOnMarket: mls.days_on_market }
      : {}),
    // Only when `listings.lot_size` is empty — one lot figure, not two that disagree.
    ...(!listing.lot_size?.trim() && mls?.lot_size_acres != null && mls.lot_size_acres > 0
      ? { lotSizeAcres: mls.lot_size_acres }
      : {}),
    ...(mls?.listing_key?.trim() ? { mlsNumber: mls.listing_key.trim() } : {}),
    ...(video ? { video } : {}),
    ...(insights.length > 0 ? { insights } : {}),
    photos: projectPhotos(photos),
    comps: projectComps(comps, listing.city),
  };
}

/**
 * The walkthrough video's playable projection, or null when no render exists.
 * Square-first (`mobileVideoUid`) because the explore hero is a full-width
 * ~1:1 block — the same shape preference the feed card uses.
 */
export function projectVideo(row: ListingVideoRow | null): ListingVideoDTO | null {
  const uid = mobileVideoUid(row);
  if (!uid) return null;
  return {
    url: streamManifestUrl(uid),
    posterUrl: streamPosterUrl(uid),
    ...(row?.duration_sec != null && row.duration_sec > 0 ? { durationSec: row.duration_sec } : {}),
  };
}

/**
 * Photos in display order. `sort_order` is nullable, and `??  0` would collapse
 * every untagged photo onto the same key and let the DB's arbitrary order win —
 * so nulls sort LAST, deterministically, behind everything with a real position.
 */
export function projectPhotos(rows: PhotoRow[]): DetailPhotoDTO[] {
  return rows
    .slice()
    .sort((a, b) => {
      const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.id.localeCompare(b.id);
    })
    .map((r) => ({
      id: r.id,
      url: photoPublicUrl(preferredPhotoPath(r)),
      // Omitted entirely when untagged. `tags: {}` would make a hotspot builder
      // think it had data and produce a titleless pin.
      ...(r.ai_tags ? { tags: r.ai_tags } : {}),
    }));
}

/** §2.1 #5's cohort: real prices only, plus a $/sqft median when it is earned. */
export function projectComps(rows: CompRow[], cohortLabel: string): CompsCohortDTO {
  const pricesUsd = rows
    .map((r) => r.price)
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0);

  const perSqft = rows
    .filter((r) => r.price != null && r.price > 0 && r.sqft != null && r.sqft > 0)
    .map((r) => (r.price as number) / (r.sqft as number))
    .sort((a, b) => a - b);

  const cohort: CompsCohortDTO = { cohortLabel, pricesUsd };

  // Same 5-sample floor the histogram uses (`lib/listing/histogram.ts`). A
  // "$241/sqft" derived from two homes reads as authoritative and is not.
  if (perSqft.length >= 5) {
    const mid = perSqft.length >> 1;
    const median =
      perSqft.length % 2 === 1
        ? (perSqft[mid] as number)
        : ((perSqft[mid - 1] as number) + (perSqft[mid] as number)) / 2;
    cohort.medianPricePerSqft = Math.round(median);
    cohort.medianPricePerSqftSampleSize = perSqft.length;
  }

  return cohort;
}

/** Cap on the comps cohort read. ~50 active per city today; 400 is headroom. */
const COMPS_LIMIT = 400;

/**
 * Anon client with Next's fetch cache explicitly DISABLED.
 *
 * Next 14 patches global `fetch` and, in the App Router, persists responses to
 * `.next/cache/fetch-cache` ON DISK — surviving a dev-server restart. supabase-js
 * uses `fetch`, so a listing read gets pinned to whatever the row looked like the
 * first time it was requested.
 *
 * That cost a real debugging detour on 2026-07-27: after backfilling
 * `listing_photos.ai_tags`, the DB and a direct PostgREST call with the SAME anon
 * key both returned 10 tagged photos while this endpoint kept returning 0 tagged —
 * through a restart, and for one listing but not another (whichever had been
 * requested pre-backfill). `export const dynamic = 'force-dynamic'` on the route
 * does NOT cover this; that governs route rendering, not the inner fetch cache.
 *
 * `cache: 'no-store'` on the client's own fetch is the fix. This data is
 * per-listing and read once per screen open, so there is nothing to gain from
 * caching it here anyway.
 */
function createUncachedAnonClient() {
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}

/**
 * Service-role client for the ONE read RLS cannot serve: the `mls_listings`
 * mirror is deliberately policy-less ("Server-role only", migration
 * 20260704075823), so the anon client's mirror read always came back empty
 * and daysOnMarket / lot / MLS number silently never shipped (phase119.1).
 *
 * Same trust model as the mobile feed route, which already reads
 * community-video rows with `createServiceClient()` from this unauthenticated
 * namespace: server-side only, projecting three non-sensitive display fields
 * for a listing the caller can already see, and only when the mirror row's
 * `internet_entire_listing_display_yn` does not forbid display. Same
 * `no-store` wrapper as the anon client — the fetch-cache trap above applies
 * to any supabase-js client.
 */
function createUncachedServiceClient() {
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}

/**
 * Fetches one listing by id OR slug. Both because the feed carries ids while
 * shared/deep-linked URLs are slugs, and a screen that only accepts one of them
 * dead-ends the other.
 *
 * Returns null when the listing does not exist or is not active — the route maps
 * that to a 404 rather than rendering a shell.
 */
export async function fetchListingDetail(idOrSlug: string): Promise<ListingDetailDTO | null> {
  const supabase = createUncachedAnonClient();
  const columns =
    'id, slug, address, city, state, price, beds, baths, sqft, year_built, hoa, description, community_id, status, lot_size, zip, neighborhood';

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const { data: rows, error } = await supabase
    .from('listings')
    .select(columns)
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .limit(1);

  if (error) throw new Error(`listing-detail: read failed: ${error.message}`);
  const row = (rows ?? [])[0] as (ListingRow & { status: string | null }) | undefined;
  if (!row || row.status !== 'active') return null;

  // Independent reads — run them together rather than paying four sequential
  // round trips on a screen the buyer is waiting on.
  const [photoRes, compRes, mlsRes, videoRes, insightRes] = await Promise.all([
    supabase
      .from('listing_photos')
      .select('id, storage_path, enhanced_path, enhanced_status, ai_tags, sort_order')
      .eq('listing_id', row.id)
      .eq('status', 'ready'),
    supabase
      .from('listings')
      .select('price, sqft')
      .eq('city', row.city)
      .eq('status', 'active')
      .not('price', 'is', null)
      .limit(COMPS_LIMIT),
    // The MLS mirror row, when the sync has linked one. Service-role client —
    // see `createUncachedServiceClient` for why anon cannot read the mirror.
    // `maybeSingle`: a missing mirror is normal, not an error. The display
    // flag is fetched so a row the MLS forbids displaying projects nothing.
    createUncachedServiceClient()
      .from('mls_listings')
      .select('days_on_market, lot_size_acres, listing_key, internet_entire_listing_display_yn')
      .eq('our_listing_id', row.id)
      .limit(1)
      .maybeSingle(),
    // The home's own walkthrough — same rule as the feed hero
    // (`lib/feed/vertical-videos.ts`): `kind='walkthrough'` only, because
    // that is the one kind built from the listing's own photos.
    supabase
      .from('listing_videos')
      .select('cf_video_id, cf_video_id_landscape, cf_video_id_square, duration_sec')
      .eq('listing_id', row.id)
      .eq('kind', 'walkthrough')
      .eq('status', 'ready')
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // "After you move in" cards (phase130). RLS already limits anon to
    // approved rows; the filter is repeated so the intent is in the query.
    supabase
      .from('listing_insights')
      .select('id, headline, detail, kind, theme, verify, basis, decisiveness')
      .eq('listing_id', row.id)
      .eq('status', 'approved'),
  ]);

  if (photoRes.error) throw new Error(`listing-detail: photos failed: ${photoRes.error.message}`);
  if (compRes.error) throw new Error(`listing-detail: comps failed: ${compRes.error.message}`);
  // MLS mirror and video are enrichments: a read failure downgrades to absence
  // rather than 500ing a page whose core content loaded fine.
  const mls = mlsRes.error ? null : (mlsRes.data as MlsMirrorRow | null);
  const video = videoRes.error ? null : (videoRes.data as ListingVideoRow | null);
  // Same soft failure — and it also covers the table not existing yet on a
  // database the migration has not reached.
  const insights = insightRes.error ? [] : ((insightRes.data ?? []) as InsightRow[]);

  return projectDetail(
    row,
    (photoRes.data ?? []) as PhotoRow[],
    (compRes.data ?? []) as CompRow[],
    {
      mls,
      video,
      insights,
    },
  );
}
