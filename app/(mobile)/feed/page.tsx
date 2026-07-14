/**
 * Mobile Reel feed route — vertical TikTok-style listing feed.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.1
 *
 * F1.1 delivers the container + real Supabase-backed listings (limit 5).
 * F1.2 will replace the placeholder slide body with <ReelCard>.
 *
 * Chrome (BottomNav / DesktopSidebar / TopBar) is hidden on this route via
 * the `/feed` prefix added to `isChromeHidden` — the reel is full-bleed.
 */
import { Suspense } from 'react';
import { ReelCard } from '@/components/reelestate/ReelCard';
import { ReelFeed, ReelFeedSkeleton, type ReelFeedItem } from '@/components/reelestate/ReelFeed';
import { fetchReelFeedListings } from '@/lib/reelestate/feed';

export const dynamic = 'force-dynamic';

export default function MobileFeedPage() {
  return (
    <Suspense fallback={<ReelFeedSkeleton />}>
      <FeedContent />
    </Suspense>
  );
}

async function FeedContent() {
  const listings = await fetchReelFeedListings();
  const items: ReelFeedItem[] = listings.map((l) => ({
    id: l.id,
    node: <ReelCard listing={l} />,
  }));
  return <ReelFeed items={items} />;
}
