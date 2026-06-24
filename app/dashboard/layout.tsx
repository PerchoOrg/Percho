import { createClient } from '@/lib/supabase/server';
/**
 * Dashboard layout — gates all /dashboard/* routes behind auth.
 *
 * Phase 26 (2026-06-14): the dashboard-specific <TopBar> is gone — the
 * global <SiteHeader> in the root layout now handles desktop chrome for
 * agent routes too. This file is now just an auth gate + page wrapper.
 * Phase 36 (2026-06-18): removed the "preview as buyer" redirect — that
 * mode no longer exists under the unified IA.
 *
 * Phase 47 (2026-06-21): dropped the inner `mx-auto max-w-6xl px-6 py-8`
 * <main> wrapper. Each child page now owns its own container so the
 * agent-side grids (My Listings, My Communities) can use exactly the
 * same container chrome as the buyer-side grids (For You, Communities)
 * via the shared <GridPageShell>. Form/detail pages keep their own
 * container (max-w-2xl / max-w-3xl / max-w-5xl as appropriate). The
 * outer <main> retains pb-24 md:pb-8 to clear the mobile BottomNav.
 */
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) vs getUser() round-trip (~150ms).
  // Middleware re-validates on each request — chrome doesn't need fresh JWT validation.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) {
    redirect('/login?redirect=%2Fdashboard');
  }

  return (
    <div className="min-h-screen">
      <main className="pb-24 md:pb-8">{children}</main>
    </div>
  );
}
