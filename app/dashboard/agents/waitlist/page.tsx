/**
 * Internal /dashboard/agents/waitlist — KW Atlanta agent-waitlist signups.
 *
 * Simple newest-first table for the founder to review beta signups collected
 * via the public /agents landing page.
 *
 * TODO(admin): There is no admin-role concept in this codebase yet, so this
 * page is currently gated on ANY authenticated session (defense-in-depth: the
 * dashboard layout already redirects unauthenticated users to /login). When
 * an admin role lands, tighten this to admin-only and redirect non-admins.
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type WaitlistRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  brokerage: string;
  license_number: string | null;
  mls_association: string;
  source: string;
  created_at: string;
};

export default async function WaitlistAdminPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect('/login?redirect=%2Fdashboard%2Fagents%2Fwaitlist');

  // Read via service role — table has no public policies (server-only inserts),
  // and the authenticated user above may not have a matching RLS grant.
  const service = createServiceClient();
  // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
  const { data } = (await (service as any)
    .from('agent_waitlist_signups')
    .select(
      'id, name, email, phone, brokerage, license_number, mls_association, source, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(500)) as { data: WaitlistRow[] | null };

  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="font-serif text-3xl text-ink">Agent waitlist</h1>
      <p className="mt-1 text-sm text-ink2">
        {rows.length} signup{rows.length === 1 ? '' : 's'} · newest first
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Brokerage</th>
              <th className="px-4 py-3">MLS</th>
              <th className="px-4 py-3">Signed up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink2">
                  No signups yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="text-ink">
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">
                    <a href={`mailto:${r.email}`} className="underline hover:text-ink/80">
                      {r.email}
                    </a>
                  </td>
                  <td className="px-4 py-3">{r.phone}</td>
                  <td className="px-4 py-3">{r.brokerage}</td>
                  <td className="px-4 py-3">{r.mls_association}</td>
                  <td className="px-4 py-3 text-ink2">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
