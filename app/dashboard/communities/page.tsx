/**
 * /dashboard/communities — list page (Phase 4.4 + Phase 17 polish).
 *
 * Phase 17: every row now has explicit `+ Add video` and `Edit` actions
 * instead of being a single edit-link. Edit is only shown to the agent who
 * created the community (or for legacy unowned rows where created_by is
 * NULL); migration 0013 enforces this on the DB side too — UI hide is just
 * a UX hint so non-creators don't try and get a "forbidden" toast.
 *
 * V1 design choice (kept): communities are globally readable. Schools / POIs
 * / community videos remain editable by any authenticated agent — only
 * metadata (name / city / state / description) is creator-gated.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  created_by: string | null;
}

export default async function CommunitiesListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=%2Fdashboard%2Fcommunities');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  const myAgentId = agentRow?.id ?? null;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rows } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, created_by')
    .order('name', { ascending: true })) as { data: CommunityRow[] | null };

  const communities = rows ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Communities</h1>
          <p className="mt-1 text-sm text-cream/60">
            Shared across all agents. Add videos to any community; only the agent who created a
            community can edit its metadata.
          </p>
        </div>
        <Link
          href="/dashboard/communities/new"
          className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:opacity-90"
        >
          + New community
        </Link>
      </header>

      {communities.length === 0 ? (
        <div className="rounded border border-dashed border-bronze/30 bg-ink2 px-6 py-12 text-center">
          <p className="text-sm text-cream/60">
            No communities yet. Create one to start adding schools and POIs.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-bronze/20 rounded border border-bronze/30 bg-ink2">
          {communities.map((c) => {
            const canEdit = c.created_by == null || c.created_by === myAgentId;
            return (
              <li
                key={c.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-cream">{c.name}</div>
                  <div className="truncate text-xs text-cream/50">
                    {c.city ? `${c.city}, ${c.state}` : c.state} ·{' '}
                    <code className="text-cream/70">{c.slug}</code>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/dashboard/communities/${c.id}/videos`}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-bronze/40 px-3 py-1.5 text-cream text-xs hover:border-gold hover:text-gold"
                  >
                    + Add video
                  </Link>
                  {canEdit ? (
                    <Link
                      href={`/dashboard/communities/${c.id}`}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-bronze/40 px-3 py-1.5 text-cream text-xs hover:border-gold hover:text-gold"
                    >
                      Edit
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/communities/${c.id}`}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-bronze/20 px-3 py-1.5 text-cream/60 text-xs hover:border-bronze/50 hover:text-cream/80"
                      title="View only — only the creator can edit metadata"
                    >
                      View
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
