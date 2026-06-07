/**
 * Browser-side Supabase client.
 *
 * Use in Client Components ('use client'). Reads from cookies on the client.
 * NEVER pass the service role key here — only the anon key.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
