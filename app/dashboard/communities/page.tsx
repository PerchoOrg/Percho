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
  description: string | null;
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
    .select('id, name, slug, city, state, description, created_by')
    .order('name', { ascending: true })) as { data: CommunityRow[] | null };

  const communities = rows ?? [];

  // Phase 35: per-row video counts so the agent can see which communities
  // already have content without drilling in. One round-trip across all
  // communities the agent can see; cheap because we only count.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videoIdRows } = (await (supabase as any)
    .from('community_videos')
    .select('community_id')) as { data: { community_id: string }[] | null };
  const videoCountById = new Map<string, number>();
  for (const r of videoIdRows ?? []) {
    videoCountById.set(r.community_id, (videoCountById.get(r.community_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-4 sm:px-8">
      {/* Phase 36.2 (2026-06-18): Workspace sub-nav. /dashboard/communities is
       * one of the agent's three working surfaces; the chips give a stable
       * cross-link instead of relying on browser back.
       * Phase 36.3 (2026-06-18): "+ New community" promoted to the Workspace
       * header so all three sub-nav surfaces share the same gold-pill CTA
       * pattern (Listings: + New listing; Communities: + New community;
       * Community detail: + Upload video; Leads: no CTA — inbox not creator).
       * Phase 36.3.1 (2026-06-18): Tianrou — CTA moved into sub-nav row,
       * matching chip dimensions, so the action's scope is the active sub-nav
       * page, not the Workspace label above it.
       */}
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl tracking-tight text-ink sm:text-4xl">Communities</h1>
        <Link
          href="/dashboard/communities/new"
          className="rounded-full border border-line-strong bg-ink px-3 py-1.5 font-medium text-cream text-xs transition hover:opacity-90 sm:text-sm"
        >
          + New community
        </Link>
      </div>
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Communities</h2>
          <p className="mt-1 text-sm text-ink2">
            Shared across all agents. Add videos to any community; only the agent who created a
            community can edit its metadata.
          </p>
        </div>
      </header>

      {communities.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm text-ink2">
            No communities yet. Create one to start adding schools and POIs.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {communities.map((c) => {
            const canEdit = c.created_by == null || c.created_by === myAgentId;
            // Phase 35.2: whole row → editor link. The editor itself is now
            // the manage surface (videos + metadata + cover all live there),
            // so a single tap from the list lands you in the right place.
            // Phase 43.10 (2026-06-20): list → grid-cols-2 cards to match the
            // buyer-facing communities surface.
            return (
              <li key={c.id} className="relative rounded border border-line bg-surface">
                <Link
                  href={`/dashboard/communities/${c.id}`}
                  className="flex h-full flex-col gap-2 px-4 py-3 transition hover:bg-bg"
                  aria-label={canEdit ? `Edit ${c.name}` : `View ${c.name}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">
                      {c.name}
                      {(() => {
                        const n = videoCountById.get(c.id) ?? 0;
                        return n > 0 ? (
                          <span className="ml-2 rounded-full bg-ink2/20 px-2 py-0.5 text-[10px] text-ink2">
                            {n} video{n === 1 ? '' : 's'}
                          </span>
                        ) : null;
                      })()}
                      {!canEdit ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
                          view only
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {c.city ? `${c.city}, ${c.state}` : c.state} ·{' '}
                      <code className="text-ink2">{c.slug}</code>
                    </div>
                    {c.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-ink2">{c.description}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted italic">No description yet</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
