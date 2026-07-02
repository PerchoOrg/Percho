/**
 * `/profile` — role-aware profile / settings landing.
 *
 * Phase 14 (2026-06-12). Minimal V1 shell:
 *   - anon  → CTA: "Log in as agent" / "Sign up as agent" + note that
 *             buyer accounts are coming soon.
 *   - agent → identity card (name, brokerage, email) + shortcut to
 *             /dashboard + Sign out form.
 *   - buyer → stub: "Buyer profiles are coming soon" (Phase 9.5). The page
 *             still renders something so the bottom-nav Profile tab isn't
 *             a dead link for a logged-in non-agent.
 *
 * No avatar/password edit in V1. Email + password change route through
 * Supabase Auth's built-in flows from /forgot-password (intentionally
 * minimal — adds surface area for V2).
 */

import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EditableAgentIdentity } from './_components/EditableAgentIdentity';
import { EditableBuyerIdentity } from './_components/EditableBuyerIdentity';
// Phase 66.1 (2026-07-02): NearbyRadiusPref removed from Me per owner
// (笑云 feedback — reduce distractions; Nearby is no longer surfaced in
// the buyer chrome as of phase 66). Component file kept in the repo in
// case Nearby comes back.

export const metadata: Metadata = {
  title: 'Profile · Vicinity',
  description: 'Account and settings.',
};

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) {
    // Phase 45.10 (2026-06-20): anon Me lands here per owner. Show the
    // search-radius preference (so anon viewers can dial /browse/nearby
    // without an account) plus the Log in / Sign up CTA pair.
    return (
      <main className="min-h-dvh bg-bg text-ink">
        <section className="mx-auto max-w-md px-6 py-8">
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="font-serif text-lg text-ink">Sign in to save your work</div>
            <p className="mt-1 text-ink2 text-sm">
              Log in or create an account to save listings, follow neighborhoods, and (for
              agents) publish your own tours.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/login"
                className="btn-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="btn-ghost inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
              >
                Create account
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet (TODO phase1-end db:types)
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('name, brokerage, slug, headshot_url')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: {
      name: string | null;
      brokerage: string | null;
      slug: string | null;
      headshot_url: string | null;
    } | null;
  };

  if (agent) {
    return (
      <main className="min-h-dvh bg-bg text-ink pb-20 md:pb-0">
        <section className="mx-auto max-w-md px-6 py-8">
          <EditableAgentIdentity
            initialName={agent.name ?? user.email ?? 'Agent'}
            initialBrokerage={agent.brokerage}
            email={user.email ?? ''}
            userId={user.id}
            initialAvatarUrl={agent.headshot_url}
          />

          <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-xs text-ink2">
            <div className="font-medium text-ink2">Account settings</div>
            <div className="mt-1">
              To change your password we'll email you a reset link.{' '}
              <Link href="/forgot-password" className="text-ink hover:underline">
                Send password reset email
              </Link>
              .
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2">
            {/* Phase 36.1 (2026-06-18): "Open dashboard" CTA removed.
             * The bottom-nav "Workspace" tab (slot 4) is now the canonical
             * entry to /dashboard for agents — keeping a second entry here
             * recreates the duplication Tianrou caught 2026-06-18. */}
            {agent.slug ? (
              <Link
                href={`/a/${agent.slug}`}
                className="btn-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
              >
                View public profile
              </Link>
            ) : null}
            {/* Phase 66 (2026-07-02): Analytics moved off Agent Hub sub-tabs
             * and lives here per owner (笑云 feedback — reduce Agent Hub
             * frictions). Simple link, not a sub-tab. Destination URL is
             * unchanged (/dashboard/analytics) so the analytics page and
             * its data pipes stay put. */}
            <Link
              href="/dashboard/analytics"
              className="w-full rounded-full border border-line px-6 py-3 text-center text-ink2 text-sm transition hover:text-ink"
            >
              Analytics
            </Link>
            {/* Phase 36 (2026-06-18): "Preview as buyer" removed — agents
             * already share the buyer surface as their default. */}
          </div>

          {/* Phase 66.1 (2026-07-02): Sign out visually separated from the
           * other CTAs per owner — the destructive action shouldn't sit in
           * the same stack as View public profile / Analytics. Divider +
           * larger top margin makes the boundary obvious. */}
          <div className="mt-10 border-t border-line pt-6">
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className="w-full rounded-full border border-line px-6 py-3 text-ink2 text-sm transition hover:border-rose-400 hover:text-rose-600"
              >
                Sign out
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  // Logged in but no agents row — treat as buyer (V1 stub; Phase 9.5).
  // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
  const { data: buyer } = (await (supabase as any)
    .from('buyers')
    .select('display_name, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: { display_name: string | null; avatar_url: string | null } | null;
  };

  const buyerDisplayName = buyer?.display_name?.trim() || user.email?.split('@')[0] || 'Buyer';

  return (
    <main className="min-h-dvh bg-bg text-ink pb-20 md:pb-0">
      <section className="mx-auto max-w-md px-6 py-8">
        <EditableBuyerIdentity
          initialDisplayName={buyerDisplayName}
          email={user.email ?? ''}
          userId={user.id}
          initialAvatarUrl={buyer?.avatar_url ?? null}
        />

        <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-xs text-ink2">
          <div className="font-medium text-ink2">Account settings</div>
          <div className="mt-1">
            To change your password we'll email you a reset link.{' '}
            <Link href="/forgot-password" className="text-ink hover:underline">
              Send password reset email
            </Link>
            .
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/browse"
            className="btn-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
          >
            Explore listings
          </Link>
        </div>

        {/* Phase 66.1 (2026-07-02): Sign out separated from primary CTAs. */}
        <div className="mt-10 border-t border-line pt-6">
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded-full border border-line px-6 py-3 text-ink2 text-sm transition hover:border-rose-400 hover:text-rose-600"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}


