/**
 * `/profile` — role-aware profile / settings landing.
 *
 * Phase 14 (2026-06-12). Minimal V1 shell:
 *   - anon  → CTA: "Sign in as agent" / "Sign up as agent" + note that
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
import { NearbyRadiusPref } from './_components/NearbyRadiusPref';

export const metadata: Metadata = {
  title: 'Profile · Vicinity',
  description: 'Account and settings.',
};

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-dvh bg-ink text-cream">
        <Header />
        <section className="mx-auto max-w-md px-6 py-12">
          <h1 className="font-serif text-3xl text-cream">Welcome</h1>

          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/login"
              className="btn-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="btn-ghost inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
            >
              Create account
            </Link>
          </div>

          <div className="mt-6">
            <NearbyRadiusPref />
          </div>
        </section>
      </main>
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet (TODO phase1-end db:types)
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('name, brokerage, slug')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: { name: string | null; brokerage: string | null; slug: string | null } | null;
  };

  if (agent) {
    return (
      <main className="min-h-dvh bg-ink text-cream pb-20 md:pb-0">
        <Header />
        <section className="mx-auto max-w-md px-6 py-8">
          <div className="rounded-xl border border-cream/10 bg-ink2/40 p-5">
            <div className="text-cream/60 text-xs uppercase tracking-wider">Signed in as agent</div>
            <div className="mt-2 font-serif text-2xl text-cream">
              {agent.name ?? user.email ?? 'Agent'}
            </div>
            {agent.brokerage ? (
              <div className="text-cream/70 text-sm">{agent.brokerage}</div>
            ) : null}
            {user.email ? <div className="mt-3 text-cream/60 text-xs">{user.email}</div> : null}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/dashboard"
              className="btn-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
            >
              Open dashboard
            </Link>
            {agent.slug ? (
              <Link
                href={`/a/${agent.slug}`}
                className="btn-ghost inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
              >
                View public profile
              </Link>
            ) : null}
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className="w-full rounded-full border border-cream/15 px-6 py-3 text-cream/70 text-sm transition hover:text-cream"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="mt-10 rounded-xl border border-cream/10 bg-ink2/40 p-4 text-xs text-cream/60">
            <div className="font-medium text-cream/80">Account settings</div>
            <div className="mt-1">
              Need to change your password? Use{' '}
              <Link href="/forgot-password" className="text-gold hover:underline">
                Forgot password
              </Link>{' '}
              to send yourself a one-time code.
            </div>
          </div>

          <div className="mt-6">
            <NearbyRadiusPref />
          </div>
        </section>
      </main>
    );
  }

  // Logged in but no agents row — treat as buyer (V1 stub; Phase 9.5).
  return (
    <main className="min-h-dvh bg-ink text-cream pb-20 md:pb-0">
      <Header />
      <section className="mx-auto max-w-md px-6 py-8">
        <div className="rounded-xl border border-cream/10 bg-ink2/40 p-5">
          <div className="text-cream/60 text-xs uppercase tracking-wider">Signed in</div>
          <div className="mt-2 font-serif text-2xl text-cream">{user.email ?? 'Buyer'}</div>
        </div>

        <div className="mt-6 rounded-xl border border-cream/10 bg-ink2/40 p-4 text-cream/70 text-sm leading-relaxed">
          Buyer profiles — saved listings, messages with agents, preferences — are coming soon. For
          now you can keep browsing.
        </div>

        <div className="mt-6">
          <NearbyRadiusPref />
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/browse"
            className="btn-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
          >
            Explore listings
          </Link>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded-full border border-cream/15 px-6 py-3 text-cream/70 text-sm transition hover:text-cream"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-center border-cream/10 border-b bg-ink/85 px-4 py-3 backdrop-blur-md">
      <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">Profile</div>
    </header>
  );
}
