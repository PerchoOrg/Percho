/**
 * /admin/pipeline/worker-health — derived worker health from job tables.
 *
 * We don't have a heartbeat table yet (TODO once render-worker starts
 * writing to `worker_heartbeats`), so this page infers health from the
 * timing of the most recent job transitions.
 */

import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function loadHealth() {
  const supabase = createServiceClient();

  type LastReady = { id: string; updated_at: string; scope: string; intent_bucket: string | null };
  type LastFailed = LastReady & { error: string | null };

  const [pending, processing, failed24h, ready24h, lastReadyRes, lastFailedRes] = await Promise.all(
    [
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
        .gte('updated_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabase
        .from('generated_videos')
        .select('id, updated_at, scope, intent_bucket')
        .in('status', ['ready', 'approved'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as Promise<{ data: LastReady | null }>,
      supabase
        .from('generated_videos')
        .select('id, updated_at, error, scope, intent_bucket')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as Promise<{ data: LastFailed | null }>,
    ],
  );

  return {
    pending: pending.count ?? 0,
    processing: processing.count ?? 0,
    failed24h: failed24h.count ?? 0,
    ready24h: ready24h.count ?? 0,
    lastReady: lastReadyRes.data,
    lastFailed: lastFailedRes.data,
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
    (!h.lastReady?.updated_at ||
      Date.now() - new Date(h.lastReady.updated_at).getTime() > 30 * 60 * 1000);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Worker Health</h1>
        <p className="text-ink2 mt-1 text-sm">
          Signals inferred from `generated_videos` timing. A future{' '}
          <code className="font-mono text-xs">worker_heartbeats</code> table will replace this with
          a direct signal from the systemd unit `percho-render-worker`.
        </p>
      </header>

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
                <span className="text-ink2"> · {ageStr(h.lastReady.updated_at)}</span>
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
                <span className="text-ink2"> · {ageStr(h.lastFailed.updated_at)}</span>
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
