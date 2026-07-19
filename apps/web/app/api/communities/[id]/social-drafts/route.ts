/**
 * GET / POST / PATCH / DELETE /api/communities/[id]/social-drafts
 *
 * Phase 50 (2026-06-22). Sibling of /api/listings/[id]/social-drafts
 * for community marketing copy. The same `saved_social_drafts` table
 * holds both shapes, distinguished by which target FK is set:
 *   - listing drafts: listing_id set, platform set, language set
 *   - community drafts: community_id set, platform null, language set
 *
 * Different shape => different validator, but every other concern
 * (auth, ownership, rate limit, cap, RLS, soft-friendly errors) is
 * identical to the listing handler. We deliberately do not factor
 * the two routes through one helper: Next.js route co-location +
 * the schema differences would make a generic helper harder to read
 * than two surgical handlers.
 */

import { COMMUNITY_MARKETING_LANGUAGES, type CommunityMarketingLanguage } from '@/lib/ai/anthropic';
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

const SaveInput = z.object({
  language: LanguageEnum,
  body: z.string().trim().min(1).max(8192),
  title: z.string().trim().min(1).max(120).optional(),
});

const PatchInput = z
  .object({
    draft_id: z.string().uuid(),
    body: z.string().trim().min(1).max(8192).optional(),
    language: LanguageEnum.optional(),
    // Empty string clears the title (sets it null).
    title: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.body !== undefined || v.title !== undefined || v.language !== undefined, {
    message: 'no_fields_to_update',
  });

const DeleteInput = z.object({
  draft_id: z.string().uuid(),
});

interface DraftRow {
  id: string;
  language: CommunityMarketingLanguage;
  body: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

const DRAFT_COLS = 'id, language, body, title, created_at, updated_at';

async function resolveAgentAndCommunity(
  communityId: string,
): Promise<
  | { ok: true; agentId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; status: number; error: string }
> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(communityId)) {
    return { ok: false, status: 400, error: 'invalid_community_id' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const agentLookup = await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  const agent = agentLookup.data as { id: string } | null;
  if (!agent) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  // Ownership: created_by must match this agent, or be null (legacy
  // unowned). Mirrors migration 0013's communities policy.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const owned = await (supabase as any)
    .from('communities')
    .select('id, created_by')
    .eq('id', communityId)
    .maybeSingle();
  const row = owned.data as { id: string; created_by: string | null } | null;
  if (!row) {
    return { ok: false, status: 404, error: 'community_not_found' };
  }
  if (row.created_by != null && row.created_by !== agent.id) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  return { ok: true, agentId: agent.id, supabase };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: communityId } = await params;
  const ctx = await resolveAgentAndCommunity(communityId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const res = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .select(DRAFT_COLS)
    .eq('community_id', communityId)
    .order('updated_at', { ascending: false })
    .limit(60);
  if (res.error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  return NextResponse.json({ drafts: (res.data ?? []) as DraftRow[] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: communityId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = SaveInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const ctx = await resolveAgentAndCommunity(communityId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const service = createServiceClient();
  const limit = await checkAndRecord(service, ctx.agentId, 'social_copy');
  if (!limit.ok) {
    if (limit.reason === 'rate_limited') {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  // Same sentinel platform as the generate route — keeps cache rows
  // distinct from listing rows on the shared input_hash column.
  const inputHash = socialDraftHash({
    platform: 'community',
    language: parsed.data.language,
  });

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const ins = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .insert({
      community_id: communityId,
      listing_id: null,
      agent_id: ctx.agentId,
      platform: null,
      language: parsed.data.language,
      body: parsed.data.body,
      highlights: null,
      title: parsed.data.title ?? null,
      input_hash: inputHash,
    })
    .select(DRAFT_COLS)
    .single();
  if (ins.error) {
    const msg = String(ins.error.message ?? '');
    if (msg.includes('saved_drafts_cap_reached')) {
      return NextResponse.json({ error: 'cap_reached' }, { status: 409 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  return NextResponse.json({ draft: ins.data as DraftRow }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: communityId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const ctx = await resolveAgentAndCommunity(communityId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const service = createServiceClient();
  const limit = await checkAndRecord(service, ctx.agentId, 'social_copy');
  if (!limit.ok) {
    if (limit.reason === 'rate_limited') {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.language !== undefined) updates.language = parsed.data.language;
  if (parsed.data.title !== undefined) {
    updates.title = parsed.data.title.length === 0 ? null : parsed.data.title;
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const upd = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .update(updates)
    .eq('id', parsed.data.draft_id)
    .eq('community_id', communityId)
    .select(DRAFT_COLS)
    .maybeSingle();
  if (upd.error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  if (!upd.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ draft: upd.data as DraftRow });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: communityId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = DeleteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const ctx = await resolveAgentAndCommunity(communityId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const del = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .delete()
    .eq('id', parsed.data.draft_id)
    .eq('community_id', communityId);
  if (del.error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
