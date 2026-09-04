/**
 * Resident reviews (phase E, store launch) — the approved slice of
 * `community_reviews`, projected for the community page.
 *
 * Only `approved` rows leave the DB (RLS says so for anon; this file also
 * filters, so a future service-role caller cannot leak the queue by
 * accident). A review is shown as "A resident" and a month — never as an
 * account, and `user_id` is not even readable to anon.
 *
 * Dimension keys are the closed set below; anything else the client sent is
 * dropped here rather than rendered as a label we did not choose.
 */

import type { Database } from '@/lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const REVIEW_DIMENSIONS = ['quiet', 'walkable', 'friendly', 'value'] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export const REVIEW_DIMENSION_LABELS: Record<ReviewDimension, string> = {
  quiet: 'Quiet',
  walkable: 'Walkable',
  friendly: 'Neighbourly',
  value: 'Value',
};

/** How many reviews the detail page carries inline. */
export const REVIEW_PAGE_SIZE = 10;

export interface CommunityReviewDTO {
  id: string;
  rating: number;
  dimensions: Partial<Record<ReviewDimension, number>>;
  body: string;
  /** ISO date of the last edit — what the page prints as "Aug 2026". */
  date: string;
}

export interface CommunityReviewsDTO {
  count: number;
  /** Mean rating over ALL approved reviews (not just the page), 1 decimal. */
  avgRating: number;
  /** Per-dimension means over reviews that scored that dimension. */
  dimensionAvgs: Partial<Record<ReviewDimension, number>>;
  items: CommunityReviewDTO[];
}

type ReviewRow = {
  id: string;
  rating: number;
  dimensions: unknown;
  body: string;
  status: string;
  updated_at: string;
};

function isDimensionScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** Keep only the known keys with a 1–5 integer score. */
export function cleanDimensions(raw: unknown): Partial<Record<ReviewDimension, number>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Partial<Record<ReviewDimension, number>> = {};
  const o = raw as Record<string, unknown>;
  for (const k of REVIEW_DIMENSIONS) {
    const v = o[k];
    if (isDimensionScore(v)) out[k] = v;
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pure projection, exported for direct testing. `null` when nothing is approved. */
export function projectCommunityReviews(rows: ReviewRow[]): CommunityReviewsDTO | null {
  const approved = rows.filter((r) => r.status === 'approved');
  if (approved.length === 0) return null;

  const sums: Partial<Record<ReviewDimension, { total: number; n: number }>> = {};
  let ratingTotal = 0;
  const items: CommunityReviewDTO[] = [];
  for (const r of approved) {
    ratingTotal += r.rating;
    const dimensions = cleanDimensions(r.dimensions);
    for (const k of REVIEW_DIMENSIONS) {
      const v = dimensions[k];
      if (v === undefined) continue;
      const s = sums[k] ?? { total: 0, n: 0 };
      s.total += v;
      s.n += 1;
      sums[k] = s;
    }
    if (items.length < REVIEW_PAGE_SIZE) {
      items.push({ id: r.id, rating: r.rating, dimensions, body: r.body, date: r.updated_at });
    }
  }

  const dimensionAvgs: Partial<Record<ReviewDimension, number>> = {};
  for (const k of REVIEW_DIMENSIONS) {
    const s = sums[k];
    if (s) dimensionAvgs[k] = round1(s.total / s.n);
  }

  return {
    count: approved.length,
    avgRating: round1(ratingTotal / approved.length),
    dimensionAvgs,
    items,
  };
}

/** Approved reviews for one community, newest edit first. */
export async function fetchCommunityReviews(
  supabase: SupabaseClient<Database>,
  communityId: string,
): Promise<CommunityReviewsDTO | null> {
  const { data, error } = await supabase
    .from('community_reviews')
    .select('id, rating, dimensions, body, status, updated_at')
    .eq('community_id', communityId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`community reviews fetch failed: ${error.message}`);
  return projectCommunityReviews((data ?? []) as ReviewRow[]);
}
