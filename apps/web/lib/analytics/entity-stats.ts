/**
 * Per-entity behavioral analytics aggregation.
 *
 * Phase 50 (2026-06-22). Generalizes the listing-only stats helper
 * (Phase 6.4a → 8.5) so the agent-hub Community detail page can show
 * the same Analytics tab as the listing edit hub. The events row is
 * attributable to either a listing OR a community (see migrations
 * 0001 + 0035), and the leads row likewise (0001 + 0029). Same shape
 * either way.
 *
 * Reads from `public.events` and `public.leads`. RLS is what scopes
 * the rows to the calling agent's owned listings / communities — this
 * helper does no permission checks of its own.
 *
 * Returned shape (`EntityStats`) is identical regardless of entity
 * type so the AnalyticsPanel UI can be reused 1:1.
 *
 *   pageViews        — count of event_type='page_view'
 *   uniqueSessions   — count of distinct session_id across all events
 *   cardViews        — count of event_type='card_view'
 *   videoCompletes   — count of event_type='video_complete'
 *   leads            — count of rows in `leads` for this entity
 *   leadConversionPct — leads / uniqueSessions × 100, rounded to 1dp
 *   topCards         — Map<card_id, view_count>, sorted desc, top 10
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// biome-ignore lint/suspicious/noExplicitAny: opaque rows
type AnyClient = SupabaseClient<any, any, any, any, any>;

export type EntityType = 'listing' | 'community';

export interface TopCardEntry {
  cardId: string;
  views: number;
}

export interface EntityStats {
  pageViews: number;
  uniqueSessions: number;
  cardViews: number;
  videoCompletes: number;
  leads: number;
  leadConversionPct: number; // 0-100, rounded to 1 decimal
  topCards: TopCardEntry[];
}

interface EventRow {
  event_type: string;
  session_id: string | null;
  card_id: string | null;
}

function emptyStats(): EntityStats {
  return {
    pageViews: 0,
    uniqueSessions: 0,
    cardViews: 0,
    videoCompletes: 0,
    leads: 0,
    leadConversionPct: 0,
    topCards: [],
  };
}

function aggregate(rows: EventRow[], leads: number): EntityStats {
  let pageViews = 0;
  let cardViews = 0;
  let videoCompletes = 0;
  const sessions = new Set<string>();
  const cardCounts = new Map<string, number>();

  for (const r of rows) {
    if (r.event_type === 'page_view') pageViews++;
    else if (r.event_type === 'card_view') cardViews++;
    else if (r.event_type === 'video_complete') videoCompletes++;
    if (r.session_id) sessions.add(r.session_id);
    if (r.event_type === 'card_view' && r.card_id) {
      cardCounts.set(r.card_id, (cardCounts.get(r.card_id) ?? 0) + 1);
    }
  }

  const topCards: TopCardEntry[] = Array.from(cardCounts.entries())
    .map(([cardId, views]) => ({ cardId, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const uniqueSessions = sessions.size;
  const leadConversionPct =
    uniqueSessions > 0 ? Math.round((leads / uniqueSessions) * 1000) / 10 : 0;

  return {
    pageViews,
    uniqueSessions,
    cardViews,
    videoCompletes,
    leads,
    leadConversionPct,
    topCards,
  };
}

function fkColumn(entityType: EntityType): 'listing_id' | 'community_id' {
  return entityType === 'listing' ? 'listing_id' : 'community_id';
}

export async function getEntityStats(
  supabase: AnyClient,
  args: { entityType: EntityType; entityId: string },
): Promise<EntityStats> {
  const col = fkColumn(args.entityType);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const eventsRes = await (supabase as any)
    .from('events')
    .select('event_type, session_id, card_id')
    .eq(col, args.entityId);
  if (eventsRes.error) throw eventsRes.error;
  const rows: EventRow[] = (eventsRes.data ?? []) as EventRow[];

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const leadsRes = await (supabase as any)
    .from('leads')
    .select('id', { head: true, count: 'exact' })
    .eq(col, args.entityId);
  if (leadsRes.error) throw leadsRes.error;
  const leads = (leadsRes.count ?? 0) as number;

  return aggregate(rows, leads);
}

/**
 * Aggregate stats across multiple entities of the same type (dashboard
 * rollup). Single events query with `in(col, ids)`.
 */
export async function getRollupEntityStats(
  supabase: AnyClient,
  args: { entityType: EntityType; entityIds: string[] },
): Promise<EntityStats> {
  if (args.entityIds.length === 0) return emptyStats();
  const col = fkColumn(args.entityType);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const eventsRes = await (supabase as any)
    .from('events')
    .select('event_type, session_id, card_id')
    .in(col, args.entityIds);
  if (eventsRes.error) throw eventsRes.error;
  const rows: EventRow[] = (eventsRes.data ?? []) as EventRow[];

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const leadsRes = await (supabase as any)
    .from('leads')
    .select('id', { head: true, count: 'exact' })
    .in(col, args.entityIds);
  if (leadsRes.error) throw leadsRes.error;
  const leads = (leadsRes.count ?? 0) as number;

  return aggregate(rows, leads);
}
