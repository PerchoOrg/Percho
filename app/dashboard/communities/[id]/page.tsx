/**
 * /dashboard/communities/[id] — community editor (Phase 4.4 + Phase 17).
 *
 * Phase 17: video upload moved to `./videos`. This page now only handles
 * metadata + schools + POIs, and gates the metadata sub-form to the
 * creator (or legacy unowned rows). Migration 0013 enforces creator-only
 * UPDATE on the DB; UI mirrors that so non-creators get read-only metadata
 * instead of a save button that 403s.
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

  const [{ data: schoolsRaw }, { data: poisRaw }] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('schools')
      .select('id, name, grades, rating, source_url, recorded_at')
      .eq('community_id', id)
      .order('name', { ascending: true }) as Promise<{ data: SchoolRow[] | null }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('pois')
      .select('id, name, poi_type, distance_text, source_url, recorded_at')
      .eq('community_id', id)
      .order('poi_type', { ascending: true })
      .order('name', { ascending: true }) as Promise<{ data: PoiRow[] | null }>,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{community.name}</h1>
          <p className="mt-1 text-sm text-cream/60">
            {community.city ? `${community.city}, ${community.state}` : community.state} · slug:{' '}
            <code className="text-cream">{community.slug}</code>
          </p>
        </div>
        <Link
          href={`/dashboard/communities/${community.id}/videos`}
          className="shrink-0 rounded bg-gold px-3 py-2 text-sm font-medium text-ink transition hover:opacity-90"
        >
          + Add video
        </Link>
      </header>

      <CommunityEditor
        community={community}
        schools={schoolsRaw ?? []}
        pois={poisRaw ?? []}
        canEditMetadata={canEditMetadata}
      />
    </div>
  );
}
