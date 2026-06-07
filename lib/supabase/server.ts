/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 *
 * Reads/writes auth cookies via the Next.js cookies() API.
 * Use the anon key — RLS is your access control.
 *
 * For privileged operations (webhook handlers, admin scripts), use
 * createServiceClient() instead and gate the caller's authorization yourself.
 */
import { createServerClient } from '@supabase/ssr';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — Next.js disallows cookie writes
            // there. Safe to ignore: middleware refreshes the session on the
            // next request.
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS. Use ONLY in:
 *   - Webhook handlers (after signature verification)
 *   - Admin scripts under scripts/admin/
 *   - Edge Functions where the action is system-driven, not user-driven
 *
 * NEVER call this from a Route Handler reachable by an unauthenticated request
 * without first verifying the request is authorized.
 */
export function createServiceClient() {
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
