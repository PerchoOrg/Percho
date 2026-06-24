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
  const isDraft = status === 'inactive';
  const isArchived = false; // phase46: archive removed
  const isPublished = status === 'active';

  // Tailwind doesn't support `current` with opacity modifiers, so each
  // tone variant ships its own border / pill / button classes.
  const tone = isPublished
    ? {
        wrapper: 'border-line-strong bg-ink/10 text-ink',
        pill: 'border-line-strong',
        helpText: 'text-ink/70',
        button: 'border-line-strong hover:bg-ink/15',
      }
    : isArchived
      ? {
          wrapper: 'border-line bg-surface/5 text-ink2',
          pill: 'border-line',
          helpText: 'text-muted',
          button: 'border-line hover:bg-surface/10',
        }
      : {
          wrapper: 'border-line bg-ink2/15 text-ink',
          pill: 'border-line',
          helpText: 'text-ink2',
          button: 'border-line hover:bg-ink2/20',
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
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
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
    data.listing.status === 'active'
      ? `/v/${data.agent.slug}/${data.listing.slug}`
      : null;

  return (
    <>
      <StatusBanner status={data.listing.status} publicHref={publicHref} />
      {/*
        BrowseFeed is full-viewport scroll-snap; render it edge-to-edge
        outside any normal page container so the snap points line up
        with the viewport. The status banner sits at z-60 above it.
      */}
      <div className="fixed inset-0 z-50 bg-bg">
        <VideoFeed listingId={data.listing.id} cards={cards} />
      </div>
    </>
  );
}
