/**
 * /dashboard/communities/[id] — community editor.
 *
 * Phase 17: video upload moved off this page (now at ./upload).
 * Phase 23 (2026-06-14): dropped Schools and POIs sections — agents weren't
 * using them and they cluttered the page. The DB tables stay (other code
 * paths still read them) but the UI no longer surfaces add/edit/delete.
 * Add-photos and Add-video are now a single "Upload" button (combined page).
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommunityEditor } from './CommunityEditor';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  created_by: string | null;
}

// Re-exported for downstream consumers that import these row types from
// this page module (e.g. the upload subpage). These mirror the shape of
// the corresponding tables; we keep them here to avoid churning callers.
export interface SchoolRow {
  id: string;
  name: string;
  grades: string | null;
  rating: number | null;
  source_url: string;
  recorded_at: string;
}

export interface PoiRow {
  id: string;
  name: string;
  poi_type: string;
  distance_text: string | null;
  source_url: string;
  recorded_at: string;
}

export default async function CommunityEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Fcommunities%2F${id}`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description, created_by')
    .eq('id', id)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-cream/60">Community not found.</p>
      </div>
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  const myAgentId = agentRow?.id ?? null;
  const canEditMetadata = community.created_by == null || community.created_by === myAgentId;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{community.name}</h1>
          <p className="mt-1 text-sm text-cream/60">
            {community.city ? `${community.city}, ${community.state}` : community.state}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/dashboard/communities/${community.id}/upload`}
            className="rounded bg-gold px-3 py-2 font-medium text-ink text-sm transition hover:opacity-90"
          >
            + Upload
          </Link>
        </div>
      </header>

      <CommunityEditor community={community} canEditMetadata={canEditMetadata} />
    </div>
  );
}
