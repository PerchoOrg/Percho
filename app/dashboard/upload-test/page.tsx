import { UploadHarness, type VideoRow } from '@/components/dashboard/UploadHarness';
import { createClient } from '@/lib/supabase/server';
/**
 * /dashboard/upload-test — standalone page to test the Phase 2 video pipeline
 * end-to-end before listings CRUD ships in Phase 4.
 *
 * Each agent gets a private fake listing (slug `__upload_test__`) auto-seeded
 * on first visit. The VideoUploader component POSTs to /api/video/create-upload
 * and streams bytes directly to Cloudflare via tus. The video table is rendered
 * by ListingVideosLive (Client Component) which subscribes to Realtime so
 * status flips processing → ready (driven by the Cloudflare webhook in 2.3)
 * appear without a refresh.
 *
 * Phase 4 will delete this page and the seeded rows.
 */
import { redirect } from 'next/navigation';

const TEST_LISTING_SLUG = '__upload_test__';

export default async function UploadTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=%2Fdashboard%2Fupload-test');

  // Look up the agent row for this user (created by handle_new_user trigger).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };

  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p style={{ color: 'var(--muted)' }}>
          No agent record found for this user. Sign out and back in to retrigger setup.
        </p>
      </div>
    );
  }

  // Idempotent fake-listing seed: one per agent, keyed on slug.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  let { data: listing } = (await (supabase as any)
    .from('listings')
    .select('id')
    .eq('agent_id', agent.id)
    .eq('slug', TEST_LISTING_SLUG)
    .maybeSingle()) as { data: { id: string } | null };

  if (!listing) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: created, error: insertErr } = (await (supabase as any)
      .from('listings')
      .insert({
        agent_id: agent.id,
        slug: TEST_LISTING_SLUG,
        address: 'Phase 2 upload test (placeholder)',
        city: 'Test',
        state: 'GA',
        status: 'draft',
      })
      .select('id')
      .single()) as { data: { id: string } | null; error: unknown };

    if (insertErr || !created) {
      console.error('[upload-test] seed listing failed', insertErr);
      return (
        <div className="mx-auto max-w-2xl py-12 text-center">
          <p style={{ color: '#f87171' }}>Failed to seed test listing. Check server logs.</p>
        </div>
      );
    }
    listing = created;
  }

  // Initial server-rendered snapshot. ListingVideosLive subscribes to changes
  // on top of this so the user sees rows appear and flip status without
  // refreshing.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videosRaw } = (await (supabase as any)
    .from('listing_videos')
    .select('id, cf_video_id, kind, title, status, created_at')
    .eq('listing_id', listing.id)
    .order('created_at', { ascending: false })) as { data: VideoRow[] | null };

  const initialVideos = videosRaw ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Upload test</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Phase 2 pipeline harness. Uploads attach to a private placeholder listing and will be
          cleaned up when listings CRUD ships in Phase 4.
        </p>
      </header>

      <UploadHarness listingId={listing.id} initialVideos={initialVideos} />
    </div>
  );
}
