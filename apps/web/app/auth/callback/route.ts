import { createClient } from '@/lib/supabase/server';
/**
 * Email-link callback. Used exclusively for password recovery: when a user
 * requests a reset via /forgot-password, Supabase emails them a link that
 * lands here with `?code=`. We exchange the code for a session (cookies are
 * written via the server client) and 302 to the requested redirect (typically
 * /reset-password where they set a new password).
 *
 * Open-redirect guard: `safeRedirectPath` keeps `redirect` on this origin.
 * Falls back to /dashboard.
 */
import { safeRedirectPath } from '@/lib/utils/safe-redirect';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const redirectPath = safeRedirectPath(url.searchParams.get('redirect'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', url));
  }

  return NextResponse.redirect(new URL(redirectPath, url));
}
