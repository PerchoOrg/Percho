import { createClient } from '@/lib/supabase/server';
/**
 * Dashboard layout — gates all /dashboard/* routes behind auth.
 *
 * - Unauthenticated users get redirected to /login?redirect=<original>.
 * - Authenticated users see the TopBar (brand + agent name + sign out).
 * - The agent row is auto-created by the handle_new_user trigger
 *   (supabase/migrations/0002_*); we just look it up here.
 */
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { TopBar } from './top-bar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=%2Fdashboard');
  }

  // TODO(phase1-end): regenerate database.types.ts via `pnpm db:types` so this
  // narrow type can come from generated types instead of being inlined here.
  const { data: agent } = (await supabase
    .from('agents')
    .select('name, brokerage')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { name: string | null; brokerage: string | null } | null };

  // Trigger should always create an agents row, but if it didn't (e.g. legacy
  // user) fall back to the email so the page still renders.
  const displayName = agent?.name ?? user.email ?? 'Agent';
  const brokerage = agent?.brokerage ?? null;

  return (
    <div className="min-h-screen">
      <TopBar displayName={displayName} brokerage={brokerage} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
