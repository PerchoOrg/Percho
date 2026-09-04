/**
 * Mobile account endpoint.
 *
 *   DELETE /api/mobile/account   (Authorization: Bearer <supabase access token>)
 *   → 204 | 401 { error } | 500 { error }
 *
 * The in-app "Delete account" App Review 5.1.1(v) requires. Deleting an auth
 * user needs the service role, which must never ship in the app bundle — so
 * the app proves who it is with its session token and this route does the
 * privileged part. Authorization is the token itself: `auth.getUser(jwt)`
 * both validates the signature/expiry and names the ONLY user this call may
 * delete, so there is nothing else to check.
 *
 * The user's saves go with the row — `saved_listings.user_id` /
 * `saved_communities.user_id` reference `auth.users on delete cascade`.
 */

import { createAnonClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!token) {
    return NextResponse.json({ error: 'missing bearer token' }, { status: 401 });
  }

  const { data, error } = await createAnonClient().auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  }

  const { error: deleteError } = await createServiceClient().auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    return NextResponse.json({ error: 'account deletion failed' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
