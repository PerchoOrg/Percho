/**
 * /dashboard/listings/[id]/preview — owner-only listing preview.
 *
 * Phase 27.10 (2026-06-17): lets agents view their draft / archived /
 * published listings using the same BrowseFeed render as the public page,
 * with a status banner pinned to the top. Linked from the dashboard cover
 * thumbnail for non-published rows so clicks don't dead-end at /v/... 404.
 *
 * Auth model: must be logged in; RLS scopes the listing fetch to the
 * caller's own rows. We additionally compare agent_id → user's agent.id
 * defensively (cheap, makes the 404 vs forbidden distinction explicit).
 */

import { VideoFeed } from '@/app/(public)/v/[agentSlug]/[listingSlug]/_components/VideoFeed';
import {
  buildListingCards,
  loadListingFeedById,
  loadListingPhotos,
} from '@/lib/listing-feed/load';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function StatusBanner({
  status,
  publicHref,
}: {
  status: string;
  publicHref: string | null;
}) {
  const isDraft = status === 'draft';
  const isArchived = status === 'archived';
  const isPublished = status === 'published';

  // Tailwind doesn't support `current` with opacity modifiers, so each
  // tone variant ships its own border / pill / button classes.
  const tone = isPublished
    ? {
        wrapper: 'border-gold/40 bg-gold/10 text-gold',
        pill: 'border-gold/40',
        helpText: 'text-gold/70',
        button: 'border-gold/50 hover:bg-gold/15',
      }
    : isArchived
      ? {
          wrapper: 'border-cream/15 bg-cream/5 text-cream/70',
          pill: 'border-cream/25',
          helpText: 'text-cream/50',
          button: 'border-cream/30 hover:bg-cream/10',
        }
      : {
          wrapper: 'border-bronze/40 bg-bronze/15 text-cream',
          pill: 'border-bronze/50',
          helpText: 'text-cream/70',
          button: 'border-bronze/50 hover:bg-bronze/20',
        };

  const title = isDraft
    ? 'Draft preview — only you can see this'
    : isArchived
      ? 'Archived — the public link is offline'
      : 'Published — this is what buyers see';

  const help = isDraft
    ? 'Publish it to get a shareable link.'
    : isArchived
      ? 'Restore the listing to publish it again.'
      : null;

  return (
    <div
      className={`pointer-events-auto fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 border-b px-4 py-2 text-xs sm:px-6 ${tone.wrapper}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`rounded-full border px-2 py-0.5 font-medium uppercase tracking-widest text-[10px] ${tone.pill}`}
        >
          {status}
        </span>
        <span className="truncate">
          <span className="font-medium">{title}</span>
          {help ? <span className={`ml-2 ${tone.helpText}`}>{help}</span> : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isPublished && publicHref ? (
          <Link
            href={publicHref}
            target="_blank"
            rel="noopener"
            className={`rounded-full border px-3 py-1 ${tone.button}`}
          >
            Open public ↗
          </Link>
        ) : null}
        <Link
          href="/dashboard"
          className={`rounded-full border px-3 py-1 ${tone.button}`}
        >
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardListingPreviewPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Flistings%2F${id}%2Fpreview`);

  const data = await loadListingFeedById(id);
  if (!data) notFound();

  // Defensive owner check (RLS already enforces this, but makes intent clear).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!agentRow || agentRow.id !== data.listing.agent_id) notFound();

  const photos =
    data.listingVideos.length === 0 ? await loadListingPhotos(data.listing.id) : null;
  const cards = await buildListingCards(data, photos);

  const publicHref =
    data.listing.status === 'published'
      ? `/v/${data.agent.slug}/${data.listing.slug}`
      : null;

  return (
    <>
      <StatusBanner status={data.listing.status} publicHref={publicHref} />
      {/*
        BrowseFeed is full-viewport scroll-snap; the dashboard layout wraps
        children in `max-w-6xl px-6 py-8` which would clip it. We escape the
        wrapper with `fixed inset-0` so the feed renders edge-to-edge while
        the banner sits at z-60 above it.
      */}
      <div className="fixed inset-0 z-50 bg-ink">
        <VideoFeed listingId={data.listing.id} cards={cards} />
      </div>
    </>
  );
}
