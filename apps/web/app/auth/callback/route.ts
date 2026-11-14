import { BUYER_HOME } from '@/lib/listings/listings-on-web';
import { createClient } from '@/lib/supabase/server';
/**
 * Auth callback. Two callers land here with `?code=`: the password-recovery
 * email link (redirect is /reset-password), and since phase314 Google sign-in
 * (`GoogleButton`). We exchange the code for a session (cookies are written via
 * the server client) and 302 to the requested redirect.
 *
 * The login page's default redirect is /dashboard, which only an agent can
 * use — so a non-agent arriving with that default goes to the buyer home, the
 * same rule the password form applies after its own sign-in.
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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', url));
  }

  let target = redirectPath;
  if (target === '/dashboard' && data.user) {
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (!agent) target = BUYER_HOME;
  }
  return NextResponse.redirect(new URL(target, url));
}
