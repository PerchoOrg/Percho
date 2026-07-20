import { fetchBrowseCards } from '@/lib/feed/browse-cards';
/**
 * paginated browse feed API. BrowseFeed calls this
 * to append the next page of BrowseCards as the buyer nears the end of the
 * swipe. The initial ~30 come from server-side render for fast first paint.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '30', 10) || 30;
  const limit = Math.min(60, Math.max(1, limitRaw));

  const cards = await fetchBrowseCards(offset, limit);
  return NextResponse.json({ cards, offset, limit, done: cards.length < limit });
}
