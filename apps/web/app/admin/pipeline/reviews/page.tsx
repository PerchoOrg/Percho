/**
 * /admin/pipeline/reviews — resident review moderation queue (phase E).
 *
 * Every row in `community_reviews`, pending first. Nothing a buyer wrote
 * reaches the community page until someone here presses Approve — that gate
 * is the whole moderation story, and the reason the table has no seed.
 *
 * requireAdmin() runs in the parent layout; the service-role client is what
 * reads the queue, since RLS shows anon only the approved rows.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReviewQueue, type ReviewQueueRow } from './ReviewQueue';

export const dynamic = 'force-dynamic';

const STATUS_ORDER: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

export default async function ReviewsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/dashboard');

  const { data, error } = await createServiceClient()
    .from('community_reviews')
    .select(
      'id, rating, dimensions, body, status, created_at, updated_at, reviewed_at, communities ( name, city, slug )',
    )
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`reviews read failed: ${error.message}`);

  const rows: ReviewQueueRow[] = (data ?? [])
    .map((r) => {
      const c = r.communities as { name: string; city: string | null; slug: string } | null;
      return {
        id: r.id,
        rating: r.rating,
        dimensions:
          r.dimensions && typeof r.dimensions === 'object' && !Array.isArray(r.dimensions)
            ? (r.dimensions as Record<string, unknown>)
            : {},
        body: r.body,
        status: r.status,
        updatedAt: r.updated_at,
        reviewedAt: r.reviewed_at,
        community: c ? { name: c.name, city: c.city ?? '', slug: c.slug } : null,
      };
    })
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return <ReviewQueue rows={rows} />;
}
