/**
 * Batch-loads the POI rows the card's neighborhood scores need.
 *
 * One query pair for the whole feed page, not per listing: a 20-card page would
 * otherwise fire 40 round trips and the feed endpoint is on the swipe path.
 *
 * ── Why this reads `candidate` links too, when the map screen does not ───────
 *
 * `app/api/mobile/listing/[id]/nearby` filters `status = 'approved'` because it
 * NAMES individual places to the buyer — an un-reviewed row there means we put a
 * specific business's name and rating in front of a customer sight-unseen.
 *
 * A score is a different claim. It is an aggregate over dozens of rows, no
 * single POI is named, and one bad row moves a 0-10 number by a fraction. On the
 * sample listing only 4 of 161 links are approved and all 4 are schools, so
 * approved-only scoring would render Convenience as "no data" on a house with 64
 * real errand/dining POIs around it — reporting "we don't know" when we do know
 * is its own kind of wrong.
 *
 * ── This REQUIRES the service-role client, and that is not incidental ────────
 *
 * Migration 20260728110000 grants anon/authenticated `select` on `listing_pois`
 * only `using (status = 'approved')`. The first version of this file passed the
 * anon client and `SCORE_APPROVED_ONLY = false` did nothing at all — verified
 * against the live endpoint, which returned Schools 4.3 from 4 rows and
 * "Convenience: no POIs" on a listing with 64 of them. RLS was silently
 * overriding the flag.
 *
 * So the caller must pass a SERVICE-ROLE client. That is safe here and only
 * here: this module returns aggregate numbers, never POI names, so no
 * un-reviewed row is ever quoted to a buyer. Do not reuse this client shape for
 * anything that emits POI identities.
 *
 * The tradeoff is explicit and reversible: flip `SCORE_APPROVED_ONLY` and the
 * scores narrow to curated rows. Flagged for the owner — if he wants approved-
 * only scoring, the POI review queue has to be worked first or most listings
 * will show two dashes out of four.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type NeighborhoodScores,
  type ScorablePoi,
  scoreNeighborhood,
} from "./neighborhood-score";

/** See the header. `false` = aggregate over all crawled links. */
const SCORE_APPROVED_ONLY = false;

/**
 * Cap per page so a listing with hundreds of links can't blow up the response.
 * Ordered by distance, so the rows that actually drive the score arrive first.
 */
const MAX_LINKS = 1200;

interface LinkRow {
  listing_id: string;
  poi_id: string;
  intent_bucket: string;
  distance_m: number | null;
  status: string;
}

interface PoiRow {
  id: string;
  rating: number | null;
  user_ratings_total: number | null;
}

/**
 * @returns scores keyed by listing id. A listing with no POI rows is simply
 * absent from the map — the caller omits the field and the card renders nothing,
 * rather than showing a zeroed-out score panel.
 */
export async function fetchNeighborhoodScores(
  supabase: SupabaseClient,
  listingIds: string[],
): Promise<Map<string, NeighborhoodScores>> {
  const out = new Map<string, NeighborhoodScores>();
  const ids = [...new Set(listingIds.filter(Boolean))];
  if (ids.length === 0) return out;

  let linkQuery = supabase
    .from("listing_pois")
    .select("listing_id, poi_id, intent_bucket, distance_m, status")
    .in("listing_id", ids)
    .order("distance_m", { ascending: true })
    .limit(MAX_LINKS);
  if (SCORE_APPROVED_ONLY) linkQuery = linkQuery.eq("status", "approved");

  const { data: links, error: linkErr } = (await linkQuery) as {
    data: LinkRow[] | null;
    error: unknown;
  };
  if (linkErr) throw linkErr;
  if (!links || links.length === 0) return out;

  const poiIds = [...new Set(links.map((l) => l.poi_id))];
  const ratings = new Map<string, PoiRow>();
  // Chunked: `in.(...)` becomes a URL query string, and a few hundred uuids
  // exceeds what PostgREST will accept in one request.
  const CHUNK = 200;
  for (let i = 0; i < poiIds.length; i += CHUNK) {
    const { data: pois, error: poiErr } = (await supabase
      .from("pois")
      .select("id, rating, user_ratings_total")
      .in("id", poiIds.slice(i, i + CHUNK))) as {
      data: PoiRow[] | null;
      error: unknown;
    };
    if (poiErr) throw poiErr;
    for (const p of pois ?? []) ratings.set(p.id, p);
  }

  const byListing = new Map<string, ScorablePoi[]>();
  for (const l of links) {
    if (l.distance_m == null) continue; // an unmeasured link can't be scored
    const r = ratings.get(l.poi_id);
    const bucket = byListing.get(l.listing_id) ?? [];
    bucket.push({
      bucket: l.intent_bucket,
      distanceM: l.distance_m,
      rating: r?.rating ?? null,
      ratingCount: r?.user_ratings_total ?? null,
    });
    byListing.set(l.listing_id, bucket);
  }

  for (const [listingId, pois] of byListing) {
    out.set(listingId, scoreNeighborhood(pois));
  }
  return out;
}
