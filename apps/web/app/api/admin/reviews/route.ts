/**
 * POST /api/admin/reviews — approve / reject / re-queue one resident review.
 *
 * Body: { id: uuid, status: 'approved' | 'rejected' | 'pending' }
 *
 * The only write path that can set `approved`: RLS lets a user insert and
 * edit their own row as `pending` and nothing else, so approval has to go
 * through the service role behind `requireAdmin()`.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { adminReviewVerdictSchema } from '@/lib/zod/admin-review';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = adminReviewVerdictSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'id (uuid) and status required' }, { status: 400 });
  }
  const { id, status } = parsed.data;

  const { error } = await createServiceClient()
    .from('community_reviews')
    .update({ status, reviewed_at: status === 'pending' ? null : new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id, status });
}
