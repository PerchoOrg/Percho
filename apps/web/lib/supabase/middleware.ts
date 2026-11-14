/**
 * Refresh the Supabase auth session on every request.
 *
 * Used by the Next.js root middleware. Without this, server-side reads of
 * auth state lag behind the client and protected routes flicker between
 * authed/unauthed on navigation.
 */
import { BUYER_HOME, LISTINGS_ON_WEB, isListingRoute } from '@/lib/listings/listings-on-web';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { Database } from './database.types';

export async function updateSession(request: NextRequest) {
  // Listings are off on the web (phase311) — send listing routes to the
  // neighbourhood grid. Temporary (307), since listings come back later.
  if (!LISTINGS_ON_WEB && isListingRoute(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = BUYER_HOME;
    url.search = '';
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the session — refresh tokens if expiring.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate /dashboard behind auth.
  const path = request.nextUrl.pathname;
  if (path.startsWith('/dashboard') && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  return response;
}
