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

/**
 * The typed client every factory here returns.
 *
 * `@supabase/ssr` 0.5's generics predate the ones supabase-js 2.5x+ uses (the
 * generated schema's `PostgrestVersion` among them), so `createServerClient<
 * Database>` resolves every table to `never` — which is why ~160 call sites
 * cast it to `any`, and why a dropped column could be queried for months
 * without the compiler noticing (phase306). The object ssr returns IS a
 * supabase-js client — ssr builds it with supabase-js's own `createClient` —
 * so it is typed as one, once, here.
 */
export type TypedClient = ReturnType<typeof createPlainClient<Database>>;

export async function createClient(): Promise<TypedClient> {
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
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
  return client as unknown as TypedClient;
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

/**
 * Anon, cookie-less Supabase client for use inside `unstable_cache` callbacks.
 *
 * `unstable_cache` forbids the cached fn from touching dynamic APIs
 * (`cookies()`, `headers()`), so the normal `createClient()` (which reads
 * the auth cookie) is unusable inside it. This client carries no auth
 * context — RLS evaluates as anon. Only use it for data that is safe to
 * expose without authentication (e.g. globally-readable community lists).
 */
export function createAnonClient() {
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
