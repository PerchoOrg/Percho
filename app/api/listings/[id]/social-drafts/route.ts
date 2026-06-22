/**
 * GET / POST / DELETE /api/listings/[id]/social-drafts
 *
 * Phase 48.2 (2026-06-22). Persist + list + delete saved social-copy
 * drafts for a listing.
 *
 * Security model:
 *   - All three handlers require an authenticated agent.
 *   - Listing ownership verified via the agent → listings RLS path
 *     (we check explicitly here too — defense in depth).
 *   - POST runs through the same per-agent rate limit as generation
 *     ('social_copy' kind, 10/min). Saving is cheap, but unbounded
 *     saves are still abuse — and reusing the existing limiter avoids
 *     a second ledger.
 *   - POST validates platform/language enums and body length (≤ 8 KB).
 *     The DB also enforces these via column constraints; we double-up
 *     to fail fast and return a friendly error.
 *   - DELETE is RLS-gated so an agent can't pass another agent's draft id.
 */

import {
  SOCIAL_LANGUAGES,
  SOCIAL_PLATFORMS,
  type SocialLanguage,
  type SocialPlatform,
} from '@/lib/ai/anthropic';
import { checkAndRecord } from '@/lib/ai/rate-limit';
import { socialDraftHash } from '@/lib/ai/social-cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const PlatformEnum = z.enum(
  SOCIAL_PLATFORMS as readonly [SocialPlatform, ...SocialPlatform[]],
);
const LanguageEnum = z.enum(
  SOCIAL_LANGUAGES as readonly [SocialLanguage, ...SocialLanguage[]],
);

const SaveInput = z.object({
  platform: PlatformEnum,
  language: LanguageEnum,
  body: z.string().trim().min(1).max(8192),
  highlights: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

const PatchInput = z.object({
  draft_id: z.string().uuid(),
  // At least one of body / title / language must be provided.
  body: z.string().trim().min(1).max(8192).optional(),
  language: LanguageEnum.optional(),
  // Empty string clears the title (sets it to null).
  title: z.string().trim().max(120).optional(),
}).refine(
  (v) => v.body !== undefined || v.title !== undefined || v.language !== undefined,
  { message: 'no_fields_to_update' },
);

const DeleteInput = z.object({
  draft_id: z.string().uuid(),
});

interface DraftRow {
  id: string;
  platform: SocialPlatform;
  language: SocialLanguage;
  body: string;
  highlights: string[] | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

const DRAFT_COLS =
  'id, platform, language, body, highlights, title, created_at, updated_at';

async function resolveAgentAndListing(
  listingId: string,
): Promise<
  | { ok: true; agentId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; status: number; error: string }
> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId)) {
    return { ok: false, status: 400, error: 'invalid_listing_id' };
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
  // RLS already scopes listings; this is the explicit ownership check.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const owned = await (supabase as any)
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .eq('agent_id', agent.id)
    .maybeSingle();
  if (!owned.data) {
    return { ok: false, status: 404, error: 'listing_not_found' };
  }
  return { ok: true, agentId: agent.id, supabase };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: listingId } = await params;
  const ctx = await resolveAgentAndListing(listingId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const res = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .select(DRAFT_COLS)
    .eq('listing_id', listingId)
    .order('updated_at', { ascending: false })
    .limit(60);
  if (res.error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  return NextResponse.json({ drafts: (res.data ?? []) as DraftRow[] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: listingId } = await params;
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

  const ctx = await resolveAgentAndListing(listingId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  // Reuse the social_copy bucket: saving is part of the same surface and
  // we don't want a second knob to abuse.
  const service = createServiceClient();
  const limit = await checkAndRecord(service, ctx.agentId, 'social_copy');
  if (!limit.ok) {
    if (limit.reason === 'rate_limited') {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  // Compute server-side cache fingerprint. Same normalization rules as
  // the generate route — keep them in lockstep via lib/ai/social-cache.
  const inputHash = socialDraftHash({
    platform: parsed.data.platform,
    language: parsed.data.language,
    highlights: parsed.data.highlights,
  });

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const ins = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .insert({
      listing_id: listingId,
      agent_id: ctx.agentId,
      platform: parsed.data.platform,
      language: parsed.data.language,
      body: parsed.data.body,
      highlights: parsed.data.highlights ?? null,
      title: parsed.data.title ?? null,
      input_hash: inputHash,
    })
    .select(DRAFT_COLS)
    .single();
  if (ins.error) {
    // Trigger raises 'saved_drafts_cap_reached' as a check_violation.
    const msg = String(ins.error.message ?? '');
    if (msg.includes('saved_drafts_cap_reached')) {
      return NextResponse.json({ error: 'cap_reached' }, { status: 409 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  return NextResponse.json({ draft: ins.data as DraftRow }, { status: 201 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: listingId } = await params;
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
  const ctx = await resolveAgentAndListing(listingId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  // Edits are cheap but still subject to the same per-agent rate limit
  // as generation/save. Prevents a malicious client from churning
  // updated_at to spam the audit ledger or chew up Postgres write IO.
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
    // Empty string clears the title.
    updates.title = parsed.data.title.length === 0 ? null : parsed.data.title;
  }

  // RLS-gated; the listing_id filter pins the row to this listing.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const upd = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .update(updates)
    .eq('id', parsed.data.draft_id)
    .eq('listing_id', listingId)
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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: listingId } = await params;
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
  const ctx = await resolveAgentAndListing(listingId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  // RLS gates this to drafts owned by the auth user's agent. The
  // listing_id filter pins it to this listing for clarity.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const del = await (ctx.supabase as any)
    .from('saved_social_drafts')
    .delete()
    .eq('id', parsed.data.draft_id)
    .eq('listing_id', listingId);
  if (del.error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
