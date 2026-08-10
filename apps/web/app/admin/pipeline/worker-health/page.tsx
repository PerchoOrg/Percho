/**
 * /admin/pipeline/worker-health — derived worker health from job tables.
 *
 * We don't have a heartbeat table yet (TODO once render-worker starts
 * writing to `worker_heartbeats`), so this page infers health from the
 * timing of the most recent job transitions.
 *
 * NOTE: generated_videos has NO `updated_at` column — only created_at /
 * reviewed_at / approved_at. Completion time for a bucket render is not
 * timestamped separately, so created_at is the closest available signal
 * for "last successful render" (rows are enqueued and drained within
 * seconds, so the approximation is tight).
 */

import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function loadHealth() {
  const supabase = createServiceClient();

  type LastReady = { id: string; created_at: string; scope: string; intent_bucket: string | null };
  type LastFailed = LastReady & { error: string | null };
  type RecentJob = {
    id: string;
    listing_id: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
    error: string | null;
  };

  const [pending, processing, failed24h, ready24h, lastReadyRes, lastFailedRes, recentJobsRes] =
    await Promise.all([
      supabase
        .from('generated_videos')
        .select('id', { count: 'exact', head: true })
        .in('scope', ['listing_intent_bucket', 'community_intent_bucket'])
        .eq('status', 'pending'),
      supabase
        .from('generated_videos')
        .select('id', { count: 'exact', head: true })
        .in('scope', ['listing_intent_bucket', 'community_intent_bucket'])
        .eq('status', 'processing'),
      supabase
        .from('generated_videos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabase
        .from('generated_videos')
        .select('id', { count: 'exact', head: true })
        .in('status', ['ready', 'approved'])
        .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabase
        .from('generated_videos')
        .select('id, created_at, scope, intent_bucket')
        .in('status', ['ready', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as Promise<{ data: LastReady | null }>,
      supabase
        .from('generated_videos')
        .select('id, created_at, error, scope, intent_bucket')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as Promise<{ data: LastFailed | null }>,
      supabase
        .from('render_jobs')
        .select('id, listing_id, status, created_at, updated_at, error')
        .order('created_at', { ascending: false })
        .limit(5) as unknown as Promise<{ data: RecentJob[] | null }>,
    ]);

  return {
    pending: pending.count ?? 0,
    processing: processing.count ?? 0,
    failed24h: failed24h.count ?? 0,
    ready24h: ready24h.count ?? 0,
    lastReady: lastReadyRes.data,
    lastFailed: lastFailedRes.data,
    recentJobs: recentJobsRes.data ?? [],
  };
}

function ageStr(iso: string | null | undefined) {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min}m ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

export default async function WorkerHealthPage() {
  const h = await loadHealth();

  const stalled =
    h.pending > 0 &&
    (!h.lastReady?.created_at ||
      Date.now() - new Date(h.lastReady.created_at).getTime() > 30 * 60 * 1000);

  return (
    <div className="space-y-4">
      {stalled && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
          ⚠ {h.pending} pending job(s) with no successful render in the last 30 minutes — worker may
          be stalled. Check <code>journalctl -u percho-render-worker -n 100</code>.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Pending" value={h.pending} tone="neutral" />
        <Card label="Processing" value={h.processing} tone="blue" />
        <Card label="Ready (24h)" value={h.ready24h} tone="emerald" />
        <Card label="Failed (24h)" value={h.failed24h} tone={h.failed24h > 0 ? 'red' : 'neutral'} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-ink2 text-xs uppercase tracking-wide">Last successful render</div>
          <div className="mt-1 text-sm">
            {h.lastReady ? (
              <>
                <span className="text-emerald-500">{h.lastReady.intent_bucket ?? '—'}</span>
                <span className="text-ink2"> · {h.lastReady.scope}</span>
                <span className="text-ink2"> · {ageStr(h.lastReady.created_at)}</span>
              </>
            ) : (
              <span className="text-ink2">no data</span>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-ink2 text-xs uppercase tracking-wide">Last failure</div>
          <div className="mt-1 text-sm">
            {h.lastFailed ? (
              <>
                <span className="text-red-500">{h.lastFailed.intent_bucket ?? '—'}</span>
                <span className="text-ink2"> · {h.lastFailed.scope}</span>
                <span className="text-ink2"> · {ageStr(h.lastFailed.created_at)}</span>
                {h.lastFailed.error && (
                  <div className="text-ink2 mt-1 line-clamp-3 text-xs">{h.lastFailed.error}</div>
                )}
              </>
            ) : (
              <span className="text-ink2">none in recent history</span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-ink2 text-xs uppercase tracking-wide">
          Recent render jobs <span className="normal-case">(render_jobs — includes Mac mini tour renders)</span>
        </div>
        <div className="mt-2 space-y-1.5 text-sm">
          {h.recentJobs.length === 0 ? (
            <span className="text-ink2">no jobs</span>
          ) : (
            h.recentJobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3">
                <span className="font-mono text-xs text-ink2">{j.id.slice(0, 8)}</span>
                <span
                  className={`text-xs font-medium ${
                    j.status === 'done'
                      ? 'text-emerald-500'
                      : j.status === 'failed'
                        ? 'text-red-500'
                        : j.status === 'running'
                          ? 'text-blue-500'
                          : 'text-ink2'
                  }`}
                >
                  {j.status}
                </span>
                <span className="text-xs text-ink2">
                  {new Date(j.created_at).toLocaleString()}
                </span>
                {j.error && <span className="text-ink2 line-clamp-1 text-xs">{j.error}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'blue' | 'emerald' | 'red';
}) {
  const cls =
    tone === 'blue'
      ? 'text-blue-500'
      : tone === 'emerald'
        ? 'text-emerald-500'
        : tone === 'red'
          ? 'text-red-500'
          : 'text-ink';
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-ink2 text-xs uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
