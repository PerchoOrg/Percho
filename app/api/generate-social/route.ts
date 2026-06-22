/**
 * POST /api/generate-social — generate multi-platform, multi-language social
 * copy for a listing.
 *
 * Phase 48: replaces the Phase 6.3a fixed Facebook+Instagram+Email shape.
 * Caller now picks platforms and languages explicitly. Backend pulls
 * description / photo alt-text / video titles from the listing so the model
 * has actual content to work with.
 *
 * Origin pinning unchanged: public URL host is taken from request `origin`
 * header, falls back to NEXT_PUBLIC_SITE_URL, then the request URL origin.
 * Never trust a client-supplied host.
 */

import {
  generateSocialCopy,
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

const PlatformEnum = z.enum(SOCIAL_PLATFORMS as readonly [SocialPlatform, ...SocialPlatform[]]);
const LanguageEnum = z.enum(SOCIAL_LANGUAGES as readonly [SocialLanguage, ...SocialLanguage[]]);

const Input = z.object({
  listing_id: z.string().uuid(),
  highlights: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
  // Soft caps: ≤ 6 platforms × ≤ 4 languages per call. Bigger requests blow
  // through the token budget and the agent doesn't need 9 platforms at once.
  platforms: z.array(PlatformEnum).min(1).max(6),
  languages: z.array(LanguageEnum).min(1).max(4),
  // Optional refine-from-edits seed. Map of platform → language → body.
  // When the requested cell has a non-empty seed, the model treats it as
  // the agent's edited starting point rather than generating fresh.
  // 8 KB column-cap per cell (matches saved_social_drafts), defended in lib.
  previous_drafts: z
    .record(
      PlatformEnum,
      z.record(LanguageEnum, z.string().trim().min(1).max(8192)),
    )
    .optional(),
});

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
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();
  const agent = agentLookup.data as { id: string; slug: string } | null;
  if (!agent) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // RLS scopes this to the agent's own listings — no separate ownership check
  // needed.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const listingLookup = await (supabase as any)
    .from('listings')
    .select('slug, address, city, state, price, beds, baths, sqft, description')
    .eq('id', parsed.data.listing_id)
    .maybeSingle();
  const listing = listingLookup.data as {
    slug: string;
    address: string;
    city: string;
    state: string;
    price: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    description: string[] | null;
  } | null;
  if (!listing) {
    return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });
  }

  // Pull photo alt-text and video titles in parallel — both are read-only
  // grounding for the model. Each capped at 12 entries to bound prompt size.
  const [photoLookup, videoLookup] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('listing_photos')
      .select('alt_text, sort_order')
      .eq('listing_id', parsed.data.listing_id)
      .order('sort_order', { ascending: true })
      .limit(12),
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('listing_videos')
      .select('title, sort_order')
      .eq('listing_id', parsed.data.listing_id)
      .order('sort_order', { ascending: true })
      .limit(12),
  ]);

  const photoAltText: string[] = (
    (photoLookup.data ?? []) as Array<{ alt_text: string | null }>
  )
    .map((p) => (p.alt_text ?? '').trim())
    .filter((s) => s.length > 0);
  const videoTitles: string[] = (
    (videoLookup.data ?? []) as Array<{ title: string | null }>
  )
    .map((v) => (v.title ?? '').trim())
    .filter((s) => s.length > 0);

  // Cache lookup: only when this is a fresh request (no previous_drafts seed),
  // and only single-cell calls (the panel sends 1×1; multi-cell is forward-
  // compat that nobody uses today and would need per-cell merge logic).
  const isRefine =
    parsed.data.previous_drafts &&
    Object.keys(parsed.data.previous_drafts).length > 0;
  const isSingleCell =
    parsed.data.platforms.length === 1 && parsed.data.languages.length === 1;
  if (!isRefine && isSingleCell) {
    const platform = parsed.data.platforms[0]!;
    const language = parsed.data.languages[0]!;
    const hash = socialDraftHash({
      platform,
      language,
      highlights: parsed.data.highlights,
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const cached = await (supabase as any)
      .from('saved_social_drafts')
      .select('body')
      .eq('listing_id', parsed.data.listing_id)
      .eq('input_hash', hash)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached.data?.body) {
      // Cache hit — no LLM call, no rate-limit charge. Surface the hit
      // so the UI can label it ("Loaded from saved draft").
      return NextResponse.json(
        {
          [platform]: { [language]: cached.data.body },
          cached: true,
        },
        { status: 200 },
      );
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

  const listingUrl = `${originFor(req)}/v/${agent.slug}/${listing.slug}`;

  try {
    const out = await generateSocialCopy({
      listingUrl,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      price: listing.price ?? undefined,
      beds: listing.beds ?? undefined,
      baths: listing.baths ?? undefined,
      sqft: listing.sqft ?? undefined,
      highlights: parsed.data.highlights,
      description: listing.description ?? undefined,
      photoAltText: photoAltText.length > 0 ? photoAltText : undefined,
      videoTitles: videoTitles.length > 0 ? videoTitles : undefined,
      platforms: parsed.data.platforms,
      languages: parsed.data.languages,
      previousDrafts: parsed.data.previous_drafts,
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    console.error('[generate-social] anthropic call failed', err);
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }
}
