/**
 * Batch listing summaries for the mobile explore page (phase118).
 *
 * One endpoint serves two consumers with the SAME payload:
 *   - the CompareRail ("Next to what you've saved") needs price + thumb + city
 *     for each saved listing;
 *   - the FitCard's local derivation needs the saved homes' attributes
 *     (price / sqft / beds / city) to compute honest "N of your M saves…"
 *     attributions.
 *
 * The client stores saved listings as IDS ONLY (`state/saved.ts` — snapshots go
 * stale the moment a price changes), so both consumers must re-read fresh rows.
 * Splitting this into two endpoints would just be the same query twice.
 *
 * Same projection rule as `detail.ts`: absent means the key is OMITTED.
 */

import type { Database } from '@/lib/supabase/database.types';
import { photoPublicUrl } from '@/lib/supabase/storage';
import { createClient as createPlainClient } from '@supabase/supabase-js';

/** Hard cap on ids per request. The rail shows ~10; 24 is headroom, not a page. */
export const SUMMARY_IDS_LIMIT = 24;

export interface ListingSummaryDTO {
  id: string;
  address: string;
  city: string;
  state: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  thumbUrl?: string;
}

type SummaryRow = {
  id: string;
  address: string;
  city: string;
  state: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

type ThumbRow = { listing_id: string; storage_path: string; sort_order: number | null };

/**
 * Rows → DTOs, in the CALLER's id order — the rail renders saves
 * most-recent-first and the database returns rows in arbitrary order.
 */
export function projectSummaries(
  ids: readonly string[],
  rows: SummaryRow[],
  thumbs: ThumbRow[],
): ListingSummaryDTO[] {
  const thumbByListing = new Map<string, ThumbRow>();
  for (const t of thumbs) {
    const prev = thumbByListing.get(t.listing_id);
    const to = t.sort_order ?? Number.MAX_SAFE_INTEGER;
    const po = prev?.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (!prev || to < po) thumbByListing.set(t.listing_id, t);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: ListingSummaryDTO[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue; // gone / inactive — the client renders what remains
    const thumb = thumbByListing.get(id);
    out.push({
      id: r.id,
      address: r.address,
      city: r.city,
      state: r.state ?? 'GA',
      ...(r.price != null && r.price > 0 ? { price: r.price } : {}),
      ...(r.beds != null ? { beds: r.beds } : {}),
      ...(r.baths != null ? { baths: r.baths } : {}),
      ...(r.sqft != null && r.sqft > 0 ? { sqft: r.sqft } : {}),
      ...(thumb ? { thumbUrl: photoPublicUrl(thumb.storage_path) } : {}),
    });
  }
  return out;
}

/** Comma list → deduped valid uuids, capped. Pure, so the parse is testable. */
export function parseSummaryIds(raw: string | null): string[] {
  if (!raw) return [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (uuid.test(id)) seen.add(id);
    if (seen.size >= SUMMARY_IDS_LIMIT) break;
  }
  return [...seen];
}

function createUncachedAnonClient() {
  // Same fetch-cache opt-out as `detail.ts` — see the long note there.
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

export async function fetchListingSummaries(ids: readonly string[]): Promise<ListingSummaryDTO[]> {
  if (ids.length === 0) return [];
  const supabase = createUncachedAnonClient();

  const [rowRes, thumbRes] = await Promise.all([
    supabase
      .from('listings')
      .select('id, address, city, state, price, beds, baths, sqft')
      .in('id', [...ids])
      .eq('status', 'active'),
    supabase
      .from('listing_photos')
      .select('listing_id, storage_path, sort_order')
      .in('listing_id', [...ids])
      .eq('status', 'ready'),
  ]);

  if (rowRes.error) throw new Error(`listing-summaries: read failed: ${rowRes.error.message}`);
  // Thumbs are decoration; a photo-read failure degrades to text-only cards.
  const thumbs = thumbRes.error ? [] : ((thumbRes.data ?? []) as ThumbRow[]);

  return projectSummaries(ids, (rowRes.data ?? []) as SummaryRow[], thumbs);
}
