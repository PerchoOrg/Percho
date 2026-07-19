/**
 * Tests for the per-entity analytics aggregator.
 *
 * Phase 50 (2026-06-22): the impl moved to `entity-stats.ts` (listing
 * + community). The legacy `listing-stats` exports still work — they
 * delegate to the generic functions. We keep coverage on both call
 * shapes here.
 */

import { describe, expect, it, vi } from 'vitest';
import { type EntityStats, getEntityStats, getRollupEntityStats } from '../entity-stats';
import { getListingStats, getRollupStats } from '../listing-stats';

interface EventRow {
  event_type: string;
  session_id: string | null;
  card_id?: string | null;
}

function fakeSupabase(events: EventRow[], leadsCount: number) {
  const eventsSelectChain = {
    eq: vi.fn().mockResolvedValue({ data: events, error: null }),
    in: vi.fn().mockResolvedValue({ data: events, error: null }),
  };
  const leadsSelectChain = {
    eq: vi.fn().mockResolvedValue({ count: leadsCount, error: null }),
    in: vi.fn().mockResolvedValue({ count: leadsCount, error: null }),
  };
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'events') {
      return { select: vi.fn().mockReturnValue(eventsSelectChain) };
    }
    if (table === 'leads') {
      return { select: vi.fn().mockReturnValue(leadsSelectChain) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from, eventsSelectChain, leadsSelectChain };
}

const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── Listing-shape (legacy compat) ────────────────────────────────
describe('getListingStats (compat shim)', () => {
  it('counts page_view, video_complete, unique sessions, leads', async () => {
    const events: EventRow[] = [
      { event_type: 'page_view', session_id: 's1' },
      { event_type: 'page_view', session_id: 's1' },
      { event_type: 'page_view', session_id: 's2' },
      { event_type: 'card_view', session_id: 's2' },
      { event_type: 'video_complete', session_id: 's3' },
      { event_type: 'video_complete', session_id: 's3' },
      { event_type: 'lead_submit', session_id: 's4' },
      { event_type: 'page_view', session_id: null },
    ];
    const sb = fakeSupabase(events, 2);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getListingStats(sb as any, ID);
    expect(stats.pageViews).toBe(4);
    expect(stats.videoCompletes).toBe(2);
    expect(stats.uniqueSessions).toBe(4);
    expect(stats.leads).toBe(2);
    expect(stats.leadConversionPct).toBe(50);
  });

  it('handles zero events / zero leads', async () => {
    const sb = fakeSupabase([], 0);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getListingStats(sb as any, ID);
    expect(stats).toEqual<EntityStats>({
      pageViews: 0,
      uniqueSessions: 0,
      cardViews: 0,
      videoCompletes: 0,
      leads: 0,
      leadConversionPct: 0,
      topCards: [],
    });
  });

  it('rounds conversion to 1 decimal place', async () => {
    const events: EventRow[] = Array.from({ length: 7 }, (_, i) => ({
      event_type: 'page_view',
      session_id: `s${i}`,
    }));
    const sb = fakeSupabase(events, 1);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getListingStats(sb as any, ID);
    expect(stats.leadConversionPct).toBe(14.3);
  });
});

describe('getRollupStats (listing compat)', () => {
  it('returns zeros when listingIds is empty', async () => {
    const sb = fakeSupabase([], 0);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getRollupStats(sb as any, []);
    expect(stats.pageViews).toBe(0);
    expect(stats.leadConversionPct).toBe(0);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('aggregates across multiple listings', async () => {
    const events: EventRow[] = [
      { event_type: 'page_view', session_id: 's1' },
      { event_type: 'page_view', session_id: 's2' },
      { event_type: 'video_complete', session_id: 's1' },
    ];
    const sb = fakeSupabase(events, 3);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getRollupStats(sb as any, ['l1', 'l2']);
    expect(stats.pageViews).toBe(2);
    expect(stats.videoCompletes).toBe(1);
    expect(stats.uniqueSessions).toBe(2);
    expect(stats.leads).toBe(3);
  });
});

// ─── Community-shape (Phase 50) ───────────────────────────────────
describe('getEntityStats — community', () => {
  it('queries by community_id when entityType=community', async () => {
    const events: EventRow[] = [
      { event_type: 'page_view', session_id: 's1' },
      { event_type: 'page_view', session_id: 's2' },
    ];
    const sb = fakeSupabase(events, 1);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getEntityStats(sb as any, {
      entityType: 'community',
      entityId: ID,
    });
    expect(stats.pageViews).toBe(2);
    expect(stats.uniqueSessions).toBe(2);
    expect(stats.leads).toBe(1);
    expect(stats.leadConversionPct).toBe(50);
    // Confirms the query path used the community column, not listing.
    expect(sb.eventsSelectChain.eq).toHaveBeenCalledWith('community_id', ID);
    expect(sb.leadsSelectChain.eq).toHaveBeenCalledWith('community_id', ID);
  });

  it('aggregates top cards on community events', async () => {
    const events: EventRow[] = [
      { event_type: 'card_view', session_id: 's1', card_id: 'c1' },
      { event_type: 'card_view', session_id: 's2', card_id: 'c1' },
      { event_type: 'card_view', session_id: 's3', card_id: 'c2' },
      { event_type: 'card_view', session_id: 's4', card_id: null },
    ];
    const sb = fakeSupabase(events, 0);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getEntityStats(sb as any, {
      entityType: 'community',
      entityId: ID,
    });
    expect(stats.cardViews).toBe(4);
    expect(stats.topCards).toEqual([
      { cardId: 'c1', views: 2 },
      { cardId: 'c2', views: 1 },
    ]);
  });
});

describe('getRollupEntityStats — community', () => {
  it('short-circuits empty community list', async () => {
    const sb = fakeSupabase([], 0);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getRollupEntityStats(sb as any, {
      entityType: 'community',
      entityIds: [],
    });
    expect(stats.pageViews).toBe(0);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('rolls up community events via .in(community_id, ids)', async () => {
    const events: EventRow[] = [
      { event_type: 'page_view', session_id: 's1' },
      { event_type: 'page_view', session_id: 's2' },
    ];
    const sb = fakeSupabase(events, 4);
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const stats = await getRollupEntityStats(sb as any, {
      entityType: 'community',
      entityIds: ['c1', 'c2'],
    });
    expect(stats.pageViews).toBe(2);
    expect(stats.leads).toBe(4);
    expect(sb.eventsSelectChain.in).toHaveBeenCalledWith('community_id', ['c1', 'c2']);
  });
});
