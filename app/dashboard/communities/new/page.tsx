/**
 * /dashboard/communities/new — create a community (Phase 4.4).
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewCommunityForm } from './NewCommunityForm';

export default async function NewCommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=%2Fdashboard%2Fcommunities%2Fnew');

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New community</h1>
        <p className="mt-1 text-sm text-ink2">
          Communities are shared across all agents. The community will be reachable at a public URL
          derived from its name.
        </p>
      </header>
      <section className="rounded border border-line bg-surface p-6">
        <NewCommunityForm />
      </section>
    </div>
  );
}
