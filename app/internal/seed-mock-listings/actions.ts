'use server';

/**
 * Phase 70.11 (2026-07-04): seed 10 mock Atlanta listings under the
 * currently-logged-in agent. Idempotent — re-running skips already-
 * seeded slugs and photo counts.
 *
 * Photos: fetched from Unsplash (URLs in lib/mls/mock-data.ts), uploaded
 * into Supabase Storage `listing-photos` bucket at `{listing_id}/{uuid}.jpg`,
 * then recorded in `listing_photos` with status='ready'.
 *
 * Videos: recorded in `listing_videos` with `external_url` pointing to the
 * pre-rendered mp4 hosted at `/demo/listings/{mls}.mp4`. `cf_video_id` is
 * NULL — the migration `20260704120000_listing_video_external_url.sql`
 * makes this legal.
 */

import { MOCK_LISTINGS } from '@/lib/mls/mock-data';
import { createClient } from '@/lib/supabase/server';
import { LISTING_PHOTOS_BUCKET, photoPublicUrl } from '@/lib/supabase/storage';
import { revalidatePath } from 'next/cache';

export type SeedResult = {
  ok: boolean;
  seeded: number;
  skipped: number;
  errors: { mls: string; message: string }[];
};

export async function seedMockListings(): Promise<SeedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, seeded: 0, skipped: 0, errors: [{ mls: '-', message: 'not_logged_in' }] };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string; slug: string } | null };
  if (!agent) return { ok: false, seeded: 0, skipped: 0, errors: [{ mls: '-', message: 'no_agent_profile' }] };

  const errors: { mls: string; message: string }[] = [];
  let seeded = 0;
  let skipped = 0;

  for (const mock of MOCK_LISTINGS) {
    try {
      const slug = `mls-${mock.mls_number}`;

      // 1. Upsert listing by (agent_id, slug).
      // biome-ignore lint/suspicious/noExplicitAny: stub generated types
      let { data: existing } = (await (supabase as any)
        .from('listings')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('slug', slug)
        .maybeSingle()) as { data: { id: string } | null };

      let listingId: string;
      let alreadyExisted = false;
      if (existing) {
        listingId = existing.id;
        alreadyExisted = true;
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: stub generated types
        const insertRes = (await (supabase as any)
          .from('listings')
          .insert({
            agent_id: agent.id,
            slug,
            address: mock.address,
            city: mock.city,
            state: mock.state,
            zip: mock.zip,
            price: mock.price,
            beds: mock.beds,
            baths: mock.baths,
            sqft: mock.sqft,
            year_built: mock.year_built,
            description: [mock.description],
            status: 'active',
            cover_url: null,
          })
          .select('id')
          .single()) as { data: { id: string } | null; error: { message?: string } | null };
        if (insertRes.error || !insertRes.data) {
          throw new Error(`insert_listing_failed: ${insertRes.error?.message ?? 'unknown'}`);
        }
        listingId = insertRes.data.id;
      }

      // 2. Photos — check existing count for idempotency.
      // biome-ignore lint/suspicious/noExplicitAny: stub generated types
      const { data: existingPhotos } = (await (supabase as any)
        .from('listing_photos')
        .select('id, storage_path, sort_order')
        .eq('listing_id', listingId)
        .order('sort_order', { ascending: true })) as {
        data: { id: string; storage_path: string; sort_order: number }[] | null;
      };
      const startIndex = existingPhotos?.length ?? 0;
      let firstStoragePath: string | null =
        existingPhotos && existingPhotos.length > 0 ? existingPhotos[0]!.storage_path : null;

      if (startIndex < mock.photo_urls.length) {
        for (let i = startIndex; i < mock.photo_urls.length; i++) {
          const url = mock.photo_urls[i]!;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`photo_fetch_failed: ${url} (${resp.status})`);
          const buf = Buffer.from(await resp.arrayBuffer());

          const uuid =
            globalThis.crypto?.randomUUID?.() ??
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const storagePath = `${listingId}/${uuid}.jpg`;

          const upload = await supabase.storage
            .from(LISTING_PHOTOS_BUCKET)
            .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false });
          if (upload.error) throw new Error(`photo_upload_failed: ${upload.error.message}`);

          // biome-ignore lint/suspicious/noExplicitAny: stub generated types
          const ins = (await (supabase as any).from('listing_photos').insert({
            listing_id: listingId,
            storage_path: storagePath,
            sort_order: i,
            alt_text: null,
            status: 'ready',
          })) as { error: { message?: string } | null };
          if (ins.error) throw new Error(`photo_row_insert_failed: ${ins.error.message}`);

          if (i === 0) firstStoragePath = storagePath;
        }
      }

      // 3. Cover URL — set from first photo if not already set.
      if (firstStoragePath) {
        // biome-ignore lint/suspicious/noExplicitAny: stub generated types
        const { data: cur } = (await (supabase as any)
          .from('listings')
          .select('cover_url')
          .eq('id', listingId)
          .maybeSingle()) as { data: { cover_url: string | null } | null };
        if (cur && !cur.cover_url) {
          // biome-ignore lint/suspicious/noExplicitAny: stub generated types
          await (supabase as any)
            .from('listings')
            .update({ cover_url: photoPublicUrl(firstStoragePath) })
            .eq('id', listingId);
        }
      }

      // 4. Video (external_url).
      if (mock.videoUrl) {
        // biome-ignore lint/suspicious/noExplicitAny: stub generated types
        const { data: existingVid } = (await (supabase as any)
          .from('listing_videos')
          .select('id')
          .eq('listing_id', listingId)
          .maybeSingle()) as { data: { id: string } | null };
        if (!existingVid) {
          // biome-ignore lint/suspicious/noExplicitAny: stub generated types
          const vidIns = (await (supabase as any).from('listing_videos').insert({
            listing_id: listingId,
            cf_video_id: null,
            external_url: mock.videoUrl,
            kind: 'walkthrough',
            title: 'Slideshow',
            status: 'ready',
            sort_order: 0,
            duration_sec: 24,
          })) as { error: { message?: string } | null };
          if (vidIns.error) throw new Error(`video_insert_failed: ${vidIns.error.message}`);
        }
      }

      if (alreadyExisted && startIndex >= mock.photo_urls.length) {
        skipped++;
      } else {
        seeded++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ mls: mock.mls_number, message: msg });
    }
  }

  revalidatePath('/browse');
  revalidatePath('/browse/feed');
  revalidatePath(`/a/${agent.slug}`);

  return { ok: errors.length === 0, seeded, skipped, errors };
}
