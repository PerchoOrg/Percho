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
            // Phase 35.2: whole row → editor link. The editor itself is now
            // the manage surface (videos + metadata + cover all live there),
            // so a single tap from the list lands you in the right place.
            // Upload stays as a visible secondary action (with stopPropagation
            // wrapper) for agents whose primary intent is "add another video".
            return (
              <li key={c.id} className="relative">
                <Link
                  href={`/dashboard/communities/${c.id}`}
                  className="flex flex-col gap-3 px-4 py-3 transition hover:bg-ink/40 sm:flex-row sm:items-center sm:justify-between"
                  aria-label={canEdit ? `Edit ${c.name}` : `View ${c.name}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-cream">
                      {c.name}
                      {(() => {
                        const n = videoCountById.get(c.id) ?? 0;
                        return n > 0 ? (
                          <span className="ml-2 rounded-full bg-bronze/20 px-2 py-0.5 text-[10px] text-cream/70">
                            {n} video{n === 1 ? '' : 's'}
                          </span>
                        ) : null;
                      })()}
                      {!canEdit ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-cream/40">
                          view only
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-cream/50">
                      {c.city ? `${c.city}, ${c.state}` : c.state} ·{' '}
                      <code className="text-cream/70">{c.slug}</code>
                    </div>
                    {c.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-cream/60">{c.description}</p>
                    ) : (
                      <p className="mt-1 text-xs text-cream/30 italic">No description yet</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-cream/55">
                    <span aria-hidden>→</span>
                  </div>
                </Link>
                {/* Upload shortcut — escapes the row link via z-index +
                 * absolute positioning so the click doesn't bubble to the
                 * <Link> wrapper. */}
                <Link
                  href={`/dashboard/communities/${c.id}/upload`}
                  className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-lg border border-bronze/40 bg-ink2 px-3 py-1.5 text-xs text-cream hover:border-gold hover:text-gold sm:inline-flex"
                  onClick={(e) => e.stopPropagation()}
                >
                  + Upload
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
