/**
 * POST /api/generate-marketing — community-level multi-language marketing
 * copy.
 *
 * Phase 50 (2026-06-22). The community sibling of `/api/generate-social`.
 * Differences from listing copy:
 *   - language-only (no platform axis); the model returns one body per
 *     language. Posting that body to a specific channel is the agent's
 *     job.
 *   - the cache key uses `platform = null`. `socialDraftHash` accepts
 *     a string so we feed it the literal "community" sentinel — keeps
 *     the existing column index meaningful.
 *   - rate-limit kind reuses 'social_copy' (same human surface, same
 *     cost ceiling).
 *   - ownership: only the agent who created the community (or any
 *     agent if `created_by` is null — legacy) may generate. Mirrors the
 *     RLS shape from migration 0013.
 *
 * Origin pinning unchanged from /api/generate-social.
 */

import {
  COMMUNITY_MARKETING_LANGUAGES,
  type CommunityMarketingLanguage,
  type CommunityMarketingVideo,
  generateCommunityMarketing,
} from '@/lib/ai/anthropic';
import { checkAndRecord } from '@/lib/ai/rate-limit';
import { socialDraftHash } from '@/lib/ai/social-cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const LanguageEnum = z.enum(
  COMMUNITY_MARKETING_LANGUAGES as readonly [
    CommunityMarketingLanguage,
    ...CommunityMarketingLanguage[],
  ],
);

const Input = z.object({
  community_id: z.string().uuid(),
  languages: z.array(LanguageEnum).min(1).max(4),
  // Refine-from-edits seed. Map of language → body.
  previous_drafts: z.record(LanguageEnum, z.string().trim().min(1).max(8192)).optional(),
});

// Keep this in lockstep with `lib/zod/community-video-categories.ts`.
// Inlined as a labeled lookup so we don't need to import a server-only
// zod module on this hot path.
const CATEGORY_LABEL: Record<string, { label: string; blurb: string }> = {
  walk_the_block: { label: 'Walk the Block', blurb: 'A real, unedited walk through the streets' },
  listen_here: { label: 'Listen Here', blurb: 'What this place sounds like' },
  morning_rush: { label: 'Morning Rush', blurb: 'The commute, on a real weekday' },
  after_dark: { label: 'After Dark', blurb: 'How the area feels at night' },
  hidden_spot: { label: 'Hidden Spot', blurb: 'Locals-only places worth knowing' },
  local_pick: { label: 'Local Pick', blurb: 'A non-chain place residents actually go' },
  school_run: { label: 'School Run', blurb: 'The drive to the assigned schools' },
  daily_errands: { label: 'Daily Errands', blurb: 'Grocery, pharmacy, the boring real stuff' },
  the_park: { label: 'The Park', blurb: 'The neighborhood park, on the ground' },
  eating_out: { label: 'Eating Out', blurb: 'Where you actually go for dinner' },
  get_active: { label: 'Get Active', blurb: 'Trails, gyms, courts, fields' },
  transit_reality: {
    label: 'Transit Reality',
    blurb: 'Bus stop, train, ride share — what actually works',
  },
};

function originFor(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, '');
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const agentLookup = await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  const agent = agentLookup.data as { id: string } | null;
  if (!agent) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Community ownership: created_by must match the calling agent, OR be
  // null (legacy unowned). Mirrors the policy from migration 0013.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const communityLookup = await (supabase as any)
    .from('communities')
    .select('id, slug, name, city, state, description, created_by')
    .eq('id', parsed.data.community_id)
    .maybeSingle();
  const community = communityLookup.data as {
    id: string;
    slug: string;
    name: string;
    city: string | null;
    state: string;
    description: string | null;
    created_by: string | null;
  } | null;
  if (!community) {
    return NextResponse.json({ error: 'community_not_found' }, { status: 404 });
  }
  if (community.created_by != null && community.created_by !== agent.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Pull video categories + schools + POIs in parallel — read-only
  // grounding for the model. Public-visible videos only (the unlisted
  // toggle from migration 0026 should not be marketed).
  const [videoLookup, schoolLookup, poiLookup] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('community_videos')
      .select('category, title, visibility, status')
      .eq('community_id', parsed.data.community_id)
      .order('created_at', { ascending: true })
      .limit(60),
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('schools')
      .select('name')
      .eq('community_id', parsed.data.community_id)
      .limit(20),
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('pois')
      .select('name')
      .eq('community_id', parsed.data.community_id)
      .limit(30),
  ]);

  // Filter to videos that are publicly listed and ready, with a known
  // category. Anything else either the buyer can't see or the model
  // can't honestly cite.
  const videos: CommunityMarketingVideo[] = (
    (videoLookup.data ?? []) as Array<{
      category: string | null;
      title: string | null;
      visibility: string | null;
      status: string | null;
    }>
  )
    .filter(
      (v) =>
        v.category &&
        CATEGORY_LABEL[v.category] &&
        (v.visibility ?? 'public') === 'public' &&
        (v.status ?? 'ready') === 'ready',
    )
    .map((v) => {
      const meta = CATEGORY_LABEL[v.category as string];
      if (!meta) throw new Error('unreachable');
      return {
        category: v.category as string,
        categoryLabel: meta.label,
        categoryBlurb: meta.blurb,
        ...(v.title ? { title: v.title } : {}),
      };
    });

  const schools: string[] = ((schoolLookup.data ?? []) as Array<{ name: string | null }>)
    .map((s) => (s.name ?? '').trim())
    .filter((n) => n.length > 0);
  const pois: string[] = ((poiLookup.data ?? []) as Array<{ name: string | null }>)
    .map((p) => (p.name ?? '').trim())
    .filter((n) => n.length > 0);

  // Cache: only on fresh single-language calls (no previous_drafts).
  const isRefine =
    parsed.data.previous_drafts && Object.keys(parsed.data.previous_drafts).length > 0;
  const isSingleLang = parsed.data.languages.length === 1;
  if (!isRefine && isSingleLang) {
    const language = parsed.data.languages[0];
    if (!language) throw new Error('unreachable');
    // Sentinel platform value so cache rows don't collide with listing
    // rows in the same hash space (defense in depth — community rows
    // also live in a separate column).
    const hash = socialDraftHash({
      platform: 'community',
      language,
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const cached = await (supabase as any)
      .from('saved_social_drafts')
      .select('body')
      .eq('community_id', parsed.data.community_id)
      .eq('input_hash', hash)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached.data?.body) {
      return NextResponse.json({ [language]: cached.data.body, cached: true }, { status: 200 });
    }
  }

  const service = createServiceClient();
  const limit = await checkAndRecord(service, agent.id, 'social_copy');
  if (!limit.ok) {
    if (limit.reason === 'rate_limited') {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  const communityUrl = `${originFor(req)}/c/${community.slug}`;

  try {
    const out = await generateCommunityMarketing({
      communityUrl,
      name: community.name,
      city: community.city ?? undefined,
      state: community.state,
      description: community.description ?? undefined,
      videos,
      schools: schools.length > 0 ? schools : undefined,
      pois: pois.length > 0 ? pois : undefined,
      languages: parsed.data.languages,
      previousDrafts: parsed.data.previous_drafts,
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    console.error('[generate-marketing] anthropic call failed', err);
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }
}
