/**
 * DashboardMetrics — server component rendering 3 stat cards on the agent
 * dashboard home (NEW LEADS · THIS WEEK · TOP LISTING).
 *
 * Replaces the three CTA cards (Add property / Pick community / View leads)
 * which were redundant with the bottom nav + center FAB. The CTAs are still
 * shown for new agents (0 listings) as an onboarding hint — see
 * `app/dashboard/page.tsx`.
 *
 * All queries are RLS-scoped to the calling agent.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

type Metrics = {
  newLeads24h: number;
  latestLead: { id: string; name: string; created_at: string } | null;
  thisWeek: { views: number; saves: number; leads: number };
  prevWeek: { views: number; saves: number; leads: number };
  topListing: {
    id: string;
    address: string | null;
    views: number;
    leads: number;
  } | null;
};

function pct(curr: number, prev: number): { txt: string; up: boolean } | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return { txt: 'new', up: true };
  const delta = ((curr - prev) / prev) * 100;
  const rounded = Math.round(Math.abs(delta));
  if (rounded === 0) return null;
  return { txt: `${delta >= 0 ? '↑' : '↓'} ${rounded}%`, up: delta >= 0 };
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function loadMetrics(agentId: string): Promise<Metrics> {
  const supabase = await createClient();
  const now = Date.now();
  const day = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const week1Start = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const week2Start = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Run 5 queries in parallel
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb = supabase as any;
  const [
    { count: newLeads24h },
    { data: latestLeadRow },
    { data: thisWeekEvents },
    { data: prevWeekEvents },
    { data: weekLeadsRows },
  ] = await Promise.all([
    sb
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .gte('created_at', day),
    sb
      .from('leads')
      .select('id, name, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('events').select('event_type, listing_id').gte('created_at', week1Start),
    sb
      .from('events')
      .select('event_type')
      .gte('created_at', week2Start)
      .lt('created_at', week1Start),
    sb.from('leads').select('id, created_at').eq('agent_id', agentId).gte('created_at', week2Start),
  ]);

  // RLS already scopes events to the agent's listings (policy: "agent reads
  // own listing events"). So we can aggregate directly.
  const aggEvents = (rows: Array<{ event_type: string }> | null) => {
    let views = 0;
    let saves = 0;
    for (const r of rows ?? []) {
      if (r.event_type === 'page_view') views++;
      else if (r.event_type === 'save') saves++;
    }
    return { views, saves };
  };

  const tw = aggEvents(thisWeekEvents);
  const pw = aggEvents(prevWeekEvents);

  // Saves: anonymous swipes write to saved_listings — query that for an
  // accurate count, scoped to this agent's listings.
  const { data: savedThisWeek } = await sb
    .from('saved_listings')
    .select('listing_id, listings!inner(agent_id)')
    .eq('listings.agent_id', agentId)
    .gte('created_at', week1Start);
  const { data: savedPrevWeek } = await sb
    .from('saved_listings')
    .select('listing_id, listings!inner(agent_id)')
    .eq('listings.agent_id', agentId)
    .gte('created_at', week2Start)
    .lt('created_at', week1Start);

  // Bucket leads into this/prev week
  let twLeads = 0;
  let pwLeads = 0;
  for (const l of (weekLeadsRows ?? []) as Array<{ created_at: string }>) {
    const t = new Date(l.created_at).getTime();
    if (t >= new Date(week1Start).getTime()) twLeads++;
    else pwLeads++;
  }

  // Top listing: this week's views per listing_id
  const viewsByListing = new Map<string, number>();
  for (const r of (thisWeekEvents ?? []) as Array<{
    event_type: string;
    listing_id: string | null;
  }>) {
    if (r.event_type !== 'page_view' || !r.listing_id) continue;
    viewsByListing.set(r.listing_id, (viewsByListing.get(r.listing_id) ?? 0) + 1);
  }
  let topId: string | null = null;
  let topViews = 0;
  for (const [lid, v] of viewsByListing.entries()) {
    if (v > topViews) {
      topViews = v;
      topId = lid;
    }
  }

  let topListing: Metrics['topListing'] = null;
  if (topId) {
    const { data: lr } = await sb
      .from('listings')
      .select('id, address')
      .eq('id', topId)
      .maybeSingle();
    if (lr) {
      // leads for that listing this week
      const { count: topLeads } = await sb
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', topId)
        .eq('agent_id', agentId)
        .gte('created_at', week1Start);
      topListing = {
        id: lr.id,
        address: lr.address,
        views: topViews,
        leads: topLeads ?? 0,
      };
    }
  }

  return {
    newLeads24h: newLeads24h ?? 0,
    latestLead: latestLeadRow
      ? {
          id: latestLeadRow.id,
          name: latestLeadRow.name,
          created_at: latestLeadRow.created_at,
        }
      : null,
    thisWeek: {
      views: tw.views,
      saves: (savedThisWeek ?? []).length,
      leads: twLeads,
    },
    prevWeek: {
      views: pw.views,
      saves: (savedPrevWeek ?? []).length,
      leads: pwLeads,
    },
    topListing,
  };
}

export async function DashboardMetrics({ agentId }: { agentId: string }) {
  const m = await loadMetrics(agentId);

  const wowViews = pct(m.thisWeek.views, m.prevWeek.views);
  const totalThisWeek = m.thisWeek.views + m.thisWeek.saves + m.thisWeek.leads;

  return (
    <section className="mb-10 grid grid-cols-3 gap-2 sm:gap-5">
      {/* New leads (24h) */}
      <Link
        href="/dashboard/leads"
        className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-3 transition hover:border-line-strong sm:p-5"
      >
        <div className="text-[9px] uppercase tracking-widest text-ink sm:text-[11px]">
          {m.newLeads24h > 0 ? `🔥 ${m.newLeads24h} new · 24h` : 'Leads · 24h'}
        </div>
        <div className="mt-2 truncate font-serif text-base text-ink sm:text-2xl">
          {m.latestLead ? m.latestLead.name : m.newLeads24h > 0 ? 'View →' : 'No new leads'}
        </div>
        {m.latestLead && (
          <div className="mt-0.5 text-[10px] text-muted sm:text-[11px]">
            {relTime(m.latestLead.created_at)}
          </div>
        )}
      </Link>

      {/* This week */}
      <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-3 sm:p-5">
        <div className="text-[9px] uppercase tracking-widest text-ink sm:text-[11px]">
          This week
        </div>
        {totalThisWeek === 0 ? (
          <div className="mt-2 font-serif text-ink2 text-xs sm:text-base">
            Waiting for views…
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-1.5 font-serif text-ink sm:gap-3">
              <span className="text-base sm:text-2xl">{m.thisWeek.views.toLocaleString()}</span>
              <span className="text-[9px] text-muted uppercase tracking-wider sm:text-xs">
                views
              </span>
            </div>
            <div className="mt-1 text-[10px] text-ink2 sm:text-xs">
              {m.thisWeek.saves}s · {m.thisWeek.leads}l
              {wowViews && (
                <span className={wowViews.up ? ' text-ink' : ' text-ink2'}>
                  {' '}
                  · {wowViews.txt}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Top listing */}
      {m.topListing ? (
        <Link
          href={`/dashboard/listings/${m.topListing.id}/analytics`}
          className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-3 transition hover:border-line-strong sm:p-5"
        >
          <div className="text-[9px] uppercase tracking-widest text-ink sm:text-[11px]">
            🏆 Top listing
          </div>
          <div className="mt-2 truncate font-serif text-ink text-sm sm:text-xl">
            {m.topListing.address ?? '(no address)'}
          </div>
          <div className="mt-0.5 text-[10px] text-ink2 sm:text-xs">
            {m.topListing.views}v · {m.topListing.leads}l
          </div>
        </Link>
      ) : (
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-3 sm:p-5">
          <div className="text-[9px] uppercase tracking-widest text-ink sm:text-[11px]">
            Top listing
          </div>
          <div className="mt-2 font-serif text-ink2 text-xs sm:text-base">No views yet</div>
        </div>
      )}
    </section>
  );
}
