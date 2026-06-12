import { createDirectUpload } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { VideoCreateUpload } from '@/lib/zod/schemas';
/**
 * POST /api/video/create-upload
 *
 * Creates a Cloudflare Stream direct-upload URL and pre-inserts a
 * `listing_videos` row with status='processing'. The browser then uploads
 * directly to Cloudflare via tus; we never see the bytes.
 *
 * Auth: anon client + RLS. The caller must own the target listing (listing scope)
 * or be any authenticated agent (community scope, V1 shared-community model).
 */
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = VideoCreateUpload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Per-scope branching. Listing = owner-fenced via RLS. Community = any
  // authenticated agent can create rows (V1 shared-community model).
  if (input.scope === 'listing') {
    return handleListing(supabase, input);
  }
  return handleCommunity(supabase, input);
}

// ─── listing scope ───────────────────────────────────────────────

async function handleListing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: VideoCreateUpload,
) {
  // Verify listing ownership via RLS — query returns a row only if the
  // current agent owns it (or a 0-row result otherwise). Treat absence as
  // 404 to avoid leaking listing existence to non-owners.
  const { data: listing, error: listingErr } = (await supabase
    .from('listings')
    .select('id')
    .eq('id', input.parent_id)
    .maybeSingle()) as { data: { id: string } | null; error: unknown };

  if (listingErr) {
    return NextResponse.json({ error: 'listing_lookup_failed' }, { status: 500 });
  }
  if (!listing) {
    return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });
  }

  // Reserve a Cloudflare Stream slot. maxDurationSeconds=300 enforces the
  // 5-minute cap server-side (task 2.5). 2 GB byte cap is enforced by zod.
  let uploadUrl: string;
  let videoId: string;
  try {
    const result = await createDirectUpload({
      uploadLength: input.upload_length,
      maxDurationSeconds: 300,
      meta: input.title ? { name: input.title } : undefined,
    });
    uploadUrl = result.uploadUrl;
    videoId = result.videoId;
  } catch (err) {
    console.error('[create-upload] cloudflare error', err);
    return NextResponse.json({ error: 'upload_provider_failed' }, { status: 502 });
  }

  // Pre-insert the row so the webhook handler (task 2.3) can flip it to
  // 'ready' by cf_video_id. Insert via anon client — RLS allows the owner
  // to insert listing_videos under their own listing.
  // database.types.ts is a stub (see TODO in app/dashboard/layout.tsx); cast
  // through `any` so insert payload typing isn't `never`. Phase-end regen will
  // remove the cast.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row, error: insertErr } = (await (supabase as any)
    .from('listing_videos')
    .insert({
      listing_id: input.parent_id,
      cf_video_id: videoId,
      kind: input.kind,
      title: input.title ?? null,
      status: 'processing',
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown };

  if (insertErr || !row) {
    console.error('[create-upload] listing insert failed', insertErr);
    return NextResponse.json({ error: 'row_insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ uploadUrl, videoId, rowId: row.id });
}

// ─── community scope (Phase 4.5) ─────────────────────────────────

const COMMUNITY_KINDS = new Set(['school', 'poi', 'neighborhood']);

async function handleCommunity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: VideoCreateUpload,
) {
  if (!COMMUNITY_KINDS.has(input.kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  // Cross-check: school_id only valid with kind='school', poi_id with 'poi'.
  if (input.school_id && input.kind !== 'school') {
    return NextResponse.json({ error: 'school_id_requires_school_kind' }, { status: 400 });
  }
  if (input.poi_id && input.kind !== 'poi') {
    return NextResponse.json({ error: 'poi_id_requires_poi_kind' }, { status: 400 });
  }

  // Verify the community exists. Communities are publicly readable (RLS),
  // so this also smoke-checks the UUID.
  const { data: community, error: communityErr } = (await supabase
    .from('communities')
    .select('id')
    .eq('id', input.parent_id)
    .maybeSingle()) as { data: { id: string } | null; error: unknown };

  if (communityErr) {
    return NextResponse.json({ error: 'community_lookup_failed' }, { status: 500 });
  }
  if (!community) {
    return NextResponse.json({ error: 'community_not_found' }, { status: 404 });
  }

  // Look up the agent row for `uploaded_by` (auth.users.id → agents.id).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data: agent } = (await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null; error: unknown };
  if (!agent) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 403 });
  }

  let uploadUrl: string;
  let videoId: string;
  try {
    const result = await createDirectUpload({
      uploadLength: input.upload_length,
      maxDurationSeconds: 300,
      meta: input.title ? { name: input.title } : undefined,
    });
    uploadUrl = result.uploadUrl;
    videoId = result.videoId;
  } catch (err) {
    console.error('[create-upload] cloudflare error', err);
    return NextResponse.json({ error: 'upload_provider_failed' }, { status: 502 });
  }

  // Hotfix (2026-06-12): only include lat/lng keys when actually supplied.
  // If migration 0011 hasn't been applied, the columns don't exist; sending
  // them as null still triggers a 400 from PostgREST. Omitting the keys
  // entirely keeps the insert compatible with both pre- and post-migration
  // schemas. Once 0011 is applied, callers that supply geo get it persisted.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const insertPayload: any = {
    community_id: input.parent_id,
    cf_video_id: videoId,
    kind: input.kind,
    school_id: input.school_id ?? null,
    poi_id: input.poi_id ?? null,
    title: input.title ?? null,
    status: 'processing',
    uploaded_by: agent.id,
  };
  if (input.lat !== undefined && input.lat !== null) insertPayload.lat = input.lat;
  if (input.lng !== undefined && input.lng !== null) insertPayload.lng = input.lng;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row, error: insertErr } = (await (supabase as any)
    .from('community_videos')
    .insert(insertPayload)
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown };

  if (insertErr || !row) {
    console.error('[create-upload] community insert failed', insertErr);
    return NextResponse.json({ error: 'row_insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ uploadUrl, videoId, rowId: row.id });
}
