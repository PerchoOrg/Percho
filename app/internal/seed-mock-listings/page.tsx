/**
 * Phase 70.11 (2026-07-04): /internal/seed-mock-listings.
 *
 * Bulk-seeds the 10 mock Atlanta listings from lib/mls/mock-data.ts under
 * the currently-logged-in agent. Idempotent — re-clicking the button skips
 * already-seeded rows.
 *
 * Not linked from the main nav on purpose. Access by URL only. Same
 * "internal — unlisted" banner as the rest of /internal/*.
 */

import Link from 'next/link';
import { MOCK_LISTINGS } from '@/lib/mls/mock-data';
import { createClient } from '@/lib/supabase/server';
import { seedMockListings } from './actions';

export const dynamic = 'force-dynamic';

async function runSeed() {
  'use server';
  await seedMockListings();
}

export default async function SeedMockListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl">Seed mock listings</h1>
        <p className="text-ink2 text-sm">
          You need to be logged in as an agent to seed mock listings.{' '}
          <Link href="/login" className="underline">
            Log in
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, slug, name')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string; slug: string; name: string } | null };

  if (!agent) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl">Seed mock listings</h1>
        <p className="text-ink2 text-sm">
          No agent profile found for this user. Create one from{' '}
          <Link href="/dashboard" className="underline">
            /dashboard
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  // Look up already-seeded slugs so the table can indicate status.
  const slugs = MOCK_LISTINGS.map((m) => `mls-${m.mls_number}`);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: existing } = (await (supabase as any)
    .from('listings')
    .select('slug')
    .eq('agent_id', agent.id)
    .in('slug', slugs)) as { data: { slug: string }[] | null };
  const existingSlugs = new Set((existing ?? []).map((r) => r.slug));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl">Seed mock listings</h1>
        <p className="mt-2 text-ink2 text-sm">
          Bulk-inserts 10 Atlanta demo listings under agent{' '}
          <span className="font-medium">{agent.name}</span> ({agent.slug}). Photos are
          uploaded to Supabase Storage; videos use the pre-rendered mp4s served from{' '}
          <code className="text-xs">/demo/listings/*.mp4</code>. Idempotent — safe to
          click multiple times.
        </p>
      </div>

      <form action={runSeed}>
        <button
          type="submit"
          className="rounded-lg bg-ink px-4 py-2 font-medium text-cream text-sm hover:bg-ink/90"
        >
          Seed 10 mock listings
        </button>
      </form>

      <div className="rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink2 text-xs uppercase tracking-wider">
              <th className="px-3 py-2">MLS #</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_LISTINGS.map((m) => {
              const slug = `mls-${m.mls_number}`;
              const already = existingSlugs.has(slug);
              return (
                <tr key={m.mls_number} className="border-b border-line/50 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{m.mls_number}</td>
                  <td className="px-3 py-2">
                    {m.address}, {m.city}
                  </td>
                  <td className="px-3 py-2 tabular-nums">${m.price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">
                    {already ? (
                      <span className="text-emerald-700">✓ seeded</span>
                    ) : (
                      <span className="text-ink2">pending</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-ink2 text-xs">
        After seeding, view the listings on{' '}
        <Link href="/browse" className="underline">
          /browse
        </Link>{' '}
        or the agent page{' '}
        <Link href={`/a/${agent.slug}`} className="underline">
          /a/{agent.slug}
        </Link>
        .
      </p>
    </div>
  );
}
