'use client';

/**
 * The worker hub: what the two local workers are doing, what the box they run
 * on looks like, what is queued behind them, what the paid queues cost, and
 * the log.
 *
 * It polls rather than rendering server-side once, because the question this
 * page answers ("is it moving?") is only answerable over time. Two endpoints
 * on two cadences: `/host` is cheap and local, `/metrics` is ~40 small
 * PostgREST counts. Pausing stops both — leaving a tab open on this page
 * should not poll Supabase forever.
 */

import type { ActivityEvent, SpendSnapshot } from '@/lib/worker-hub/activity';
import { type Alert, deriveAlerts, worstLevel } from '@/lib/worker-hub/alerts';
import {
  formatAge,
  formatBytes,
  formatDuration,
  formatUsd,
  hourlyHistogram,
} from '@/lib/worker-hub/format';
import type { ProcessSnapshot, SystemSnapshot } from '@/lib/worker-hub/host';
import type { QueueSnapshot } from '@/lib/worker-hub/queues';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Cpu,
  HardDrive,
  Info,
  Pause,
  Play,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { LogViewer } from './LogViewer';

const HOST_POLL_MS = 5_000;
const METRICS_POLL_MS = 15_000;

interface HostResponse {
  available: boolean;
  reason?: string;
  processes?: ProcessSnapshot[];
  system?: SystemSnapshot;
}

interface MetricsResponse {
  queues?: QueueSnapshot[];
  activity?: ActivityEvent[];
  spend?: SpendSnapshot;
  error?: string;
}

export function WorkerHub() {
  const [host, setHost] = useState<HostResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [paused, setPaused] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadHost = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/worker/host', { cache: 'no-store' });
      setHost((await res.json()) as HostResponse);
      setUpdatedAt(Date.now());
    } catch {
      setHost({ available: false, reason: 'host endpoint unreachable' });
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/worker/metrics', { cache: 'no-store' });
      setMetrics((await res.json()) as MetricsResponse);
    } catch {
      setMetrics({ error: 'metrics endpoint unreachable' });
    }
  }, []);

  useEffect(() => {
    void loadHost();
    void loadMetrics();
  }, [loadHost, loadMetrics]);

  useEffect(() => {
    if (paused) return;
    const a = setInterval(() => void loadHost(), HOST_POLL_MS);
    const b = setInterval(() => void loadMetrics(), METRICS_POLL_MS);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [paused, loadHost, loadMetrics]);

  async function restart(p: ProcessSnapshot) {
    const inFlight = (metrics?.queues ?? []).some(
      (q) =>
        q.active > 0 &&
        (p.id === 'render-worker' ? q.worker === 'render' : q.worker === 'seedance'),
    );
    const warning = inFlight
      ? '\n\nA job is IN FLIGHT right now. Restarting abandons it — the row stays "processing" until you requeue it.'
      : '';
    if (!confirm(`Restart ${p.name}?${warning}`)) return;

    setBusy(p.id);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/worker/restart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: p.id }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      setNotice(res.ok ? `${p.name} restarted.` : `Restart failed: ${body.error ?? res.status}`);
      await loadHost();
    } catch (e) {
      setNotice(`Restart failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy(null);
    }
  }

  const processes = host?.processes ?? [];
  const queues = metrics?.queues ?? [];
  const alerts = deriveAlerts({ processes, system: host?.system ?? null, queues });

  return (
    <div className="space-y-4">
      <TopBar
        alerts={alerts}
        updatedAt={updatedAt}
        paused={paused}
        onToggle={() => setPaused((v) => !v)}
        onRefresh={() => {
          void loadHost();
          void loadMetrics();
        }}
      />

      {notice && (
        <p className="rounded-xl border border-line bg-surface px-4 py-2 text-sm text-ink2">
          {notice}
        </p>
      )}

      {host && !host.available ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-ink2 text-sm">
          {host.reason ?? 'Host state unavailable.'} Queue and spend panels below read Supabase and
          still work.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {processes.map((p) => (
              <ProcessCard
                key={p.id}
                proc={p}
                busy={busy === p.id}
                onRestart={() => void restart(p)}
              />
            ))}
          </div>
          {host?.system && <SystemStrip system={host.system} />}
        </>
      )}

      <QueueTable queues={queues} error={metrics?.error ?? null} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {metrics?.spend && <SpendPanel spend={metrics.spend} />}
        <ActivityPanel events={metrics?.activity ?? []} />
      </div>

      <LogViewer sources={processes.map((p) => ({ id: p.id, name: p.name, logPath: p.logPath }))} />
    </div>
  );
}

/* ---------------------------------------------------------------- top bar */

function TopBar({
  alerts,
  updatedAt,
  paused,
  onToggle,
  onRefresh,
}: {
  alerts: Alert[];
  updatedAt: number | null;
  paused: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const worst = worstLevel(alerts);
  const tone =
    worst === 'error'
      ? 'border-red-500/40 bg-red-500/10'
      : worst === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10'
        : 'border-line bg-surface';

  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 font-semibold text-sm">
          {worst === 'error' ? (
            <XCircle size={16} className="text-red-500" />
          ) : worst === 'warn' ? (
            <AlertTriangle size={16} className="text-amber-500" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-500" />
          )}
          {worst === 'error'
            ? 'Something needs attention'
            : worst === 'warn'
              ? 'Running, with warnings'
              : 'All clear'}
        </span>

        <span className="text-ink2 text-xs">
          {updatedAt ? `updated ${formatAge(new Date(updatedAt).toISOString())}` : 'loading…'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-ink2 text-xs transition hover:text-ink"
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? 'Paused' : 'Live'}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-line bg-surface p-1.5 text-ink2 transition hover:text-ink"
            aria-label="Refresh now"
          >
            <RotateCw size={12} />
          </button>
        </div>
      </header>

      {alerts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {alerts.slice(0, 8).map((a) => (
            <li key={`${a.level}-${a.title}`} className="flex gap-2 text-sm">
              <AlertIcon level={a.level} />
              <span>
                <span className="font-medium">{a.title}</span>
                <span className="text-ink2"> — {a.detail}</span>
              </span>
            </li>
          ))}
          {alerts.length > 8 && <li className="text-ink2 text-xs">+{alerts.length - 8} more</li>}
        </ul>
      )}
    </section>
  );
}

function AlertIcon({ level }: { level: Alert['level'] }) {
  if (level === 'error') return <XCircle size={14} className="mt-0.5 shrink-0 text-red-500" />;
  if (level === 'warn')
    return <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />;
  return <Info size={14} className="mt-0.5 shrink-0 text-ink2" />;
}

/* --------------------------------------------------------------- processes */

function ProcessCard({
  proc,
  busy,
  onRestart,
}: {
  proc: ProcessSnapshot;
  busy: boolean;
  onRestart: () => void;
}) {
  const dot = !proc.installed
    ? 'bg-ink2/40'
    : proc.running
      ? proc.stale
        ? 'bg-amber-500'
        : 'bg-emerald-500'
      : 'bg-red-500';

  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{proc.name}</h3>
          <p className="text-ink2 text-xs">{proc.description}</p>
        </div>
        {proc.installed && (
          <button
            type="button"
            onClick={onRestart}
            disabled={busy}
            className="ml-auto shrink-0 rounded-lg border border-line px-2 py-1 text-ink2 text-xs transition hover:text-ink disabled:opacity-50"
          >
            {busy ? 'Restarting…' : 'Restart'}
          </button>
        )}
      </header>

      {!proc.installed ? (
        <p className="mt-3 text-ink2 text-xs">No launchd agent on this machine.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Field label="PID" value={proc.pid ? String(proc.pid) : 'not running'} />
            <Field label="Uptime" value={formatDuration(proc.uptimeSec)} />
            <Field label="CPU" value={proc.cpuPct === null ? '—' : `${proc.cpuPct.toFixed(1)}%`} />
            <Field label="Memory" value={formatBytes(proc.rssBytes)} />
            <Field label="Log" value={formatBytes(proc.logBytes)} />
            <Field label="Last write" value={formatAge(proc.logModifiedAt)} />
          </dl>

          {proc.repo && (
            <p className="mt-3 border-line border-t pt-2 text-[11px] text-ink2">
              <span className="font-mono">{proc.repo.sha}</span> {proc.repo.subject}
              {proc.repo.behind ? (
                <span className="text-amber-500"> · {proc.repo.behind} behind origin/main</span>
              ) : null}
            </p>
          )}

          {proc.stale && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600">
              Source edited {formatAge(proc.sourceModifiedAt)}, after this process booted. It is
              still running the old code.
            </p>
          )}
        </>
      )}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-ink2 uppercase tracking-wide">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ system */

function SystemStrip({ system }: { system: SystemSnapshot }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-center gap-2 text-ink2 text-xs uppercase tracking-wide">
        <Cpu size={13} /> {system.hostname} · {system.arch} · {system.cpuCount} cores · up{' '}
        {formatDuration(system.uptimeSec)}
      </header>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Meter
          label="Load"
          value={`${system.loadAvg[0].toFixed(2)}`}
          sub={`${system.loadAvg[1].toFixed(2)} / ${system.loadAvg[2].toFixed(2)} · ${(system.loadPerCore * 100).toFixed(0)}% of cores`}
          pct={Math.min(100, system.loadPerCore * 100)}
        />
        <Meter
          label="Memory"
          value={`${system.memory.usedPct.toFixed(0)}%`}
          sub={`${formatBytes(system.memory.availableBytes)} available of ${formatBytes(system.memory.totalBytes)}`}
          pct={system.memory.usedPct}
        />
        <Meter
          label="Disk"
          value={system.disk ? `${system.disk.usedPct.toFixed(0)}%` : '—'}
          sub={system.disk ? `${formatBytes(system.disk.freeBytes)} free` : 'unreadable'}
          pct={system.disk?.usedPct ?? 0}
        />
        <div>
          <div className="text-[10px] text-ink2 uppercase tracking-wide">Render activity</div>
          <div className="mt-0.5 font-semibold text-lg">
            {system.ffmpegProcs} <span className="font-normal text-ink2 text-xs">ffmpeg</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-ink2">
            <HardDrive size={11} /> {system.scratchDirs} scratch dirs in /tmp
          </div>
        </div>
      </div>
    </section>
  );
}

function Meter({
  label,
  value,
  sub,
  pct,
}: { label: string; value: string; sub: string; pct: number }) {
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="text-[10px] text-ink2 uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 font-semibold text-lg">{value}</div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full ${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-ink2">{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ queues */

function QueueTable({ queues, error }: { queues: QueueSnapshot[]; error: string | null }) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center gap-2 border-line border-b px-4 py-3">
        <CircleDot size={13} className="text-ink2" />
        <h2 className="font-semibold text-sm">Queues</h2>
        <span className="text-ink2 text-xs">in the order the render worker polls them</span>
      </header>

      {error ? (
        <p className="px-4 py-6 text-red-500 text-sm">{error}</p>
      ) : queues.length === 0 ? (
        <p className="px-4 py-6 text-ink2 text-sm">loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 860 }}>
            <thead className="border-line border-b bg-bg/40 text-left text-[10px] text-ink2 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 font-medium">Queue</th>
                <th className="px-3 py-2 text-right font-medium">Waiting</th>
                <th className="px-3 py-2 font-medium">Oldest</th>
                <th className="px-3 py-2 text-right font-medium">In flight</th>
                <th className="px-3 py-2 text-right font-medium">Done 24h</th>
                <th className="px-3 py-2 text-right font-medium">Failed 24h</th>
                <th className="px-4 py-2 font-medium">Last 24h</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.id} className="border-line/60 border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{q.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          q.worker === 'seedance'
                            ? 'bg-amber-500/15 text-amber-600'
                            : 'bg-ink/10 text-ink2'
                        }`}
                      >
                        {q.worker}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink2">{q.error ?? q.hint}</div>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-semibold ${q.waiting > 0 ? 'text-ink' : 'text-ink2'}`}
                  >
                    {q.waiting}
                  </td>
                  <td className="px-3 py-2.5 text-ink2 text-xs">
                    {q.waiting > 0 ? formatAge(q.oldestWaitingAt) : '—'}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-semibold ${q.active > 0 ? 'text-blue-500' : 'text-ink2'}`}
                  >
                    {q.active}
                  </td>
                  <td className="px-3 py-2.5 text-right text-emerald-500">
                    {q.done24h === null ? <span className="text-ink2">n/a</span> : q.done24h}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right ${q.failed24h > 0 ? 'text-red-500' : 'text-ink2'}`}
                  >
                    {q.failed24h}
                  </td>
                  <td className="px-4 py-2.5">
                    <Sparkline values={hourlyHistogram(q.completions)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 24 hourly buckets. Flat and empty is as informative as a spike. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden>
      {values.map((v, i) => (
        <span
          key={`h${i - 24}`}
          className={`w-[3px] rounded-sm ${v > 0 ? 'bg-emerald-500/70' : 'bg-line'}`}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          title={`${v} in hour -${23 - i}`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- spend */

function SpendPanel({ spend }: { spend: SpendSnapshot }) {
  const max = Math.max(0.01, ...spend.byDay.map((d) => d.usd));
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-semibold text-sm">Paid render spend</h2>
      <p className="text-ink2 text-xs">Seedance clips + AI tour videos, by day</p>

      <div className="mt-3 flex gap-6">
        <div>
          <div className="text-[10px] text-ink2 uppercase tracking-wide">Today</div>
          <div className="font-semibold text-2xl">{formatUsd(spend.today)}</div>
        </div>
        <div>
          <div className="text-[10px] text-ink2 uppercase tracking-wide">Last 7 days</div>
          <div className="font-semibold text-2xl">{formatUsd(spend.last7d)}</div>
          <div className="text-[11px] text-ink2">{spend.jobs7d} billed jobs</div>
        </div>
      </div>

      <div className="mt-4 flex h-16 items-end gap-1.5">
        {spend.byDay.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t ${d.usd > 0 ? 'bg-amber-500/70' : 'bg-line'}`}
              style={{ height: `${Math.max(4, (d.usd / max) * 100)}%` }}
              title={`${d.date}: ${formatUsd(d.usd)}`}
            />
            <span className="text-[9px] text-ink2">{d.date.slice(8)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- activity */

const STATUS_CLASS: Record<string, string> = {
  ready: 'text-emerald-500',
  approved: 'text-emerald-500',
  done: 'text-emerald-500',
  failed: 'text-red-500',
  processing: 'text-blue-500',
  running: 'text-blue-500',
  submitting: 'text-blue-500',
};

function ActivityPanel({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="border-line border-b px-4 py-3">
        <h2 className="font-semibold text-sm">Recent transitions</h2>
        <p className="text-ink2 text-xs">every queue, newest first</p>
      </header>
      <div className="max-h-80 overflow-auto">
        {events.length === 0 ? (
          <p className="px-4 py-6 text-ink2 text-sm">nothing yet</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {events.map((e) => (
              <li key={`${e.source}-${e.id}-${e.at}`} className="px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${STATUS_CLASS[e.status] ?? 'text-ink2'}`}>
                    {e.status}
                  </span>
                  <span className="text-ink">{e.source}</span>
                  <span className="text-ink2">{e.detail}</span>
                  <span className="ml-auto shrink-0 text-ink2">{formatAge(e.at)}</span>
                </div>
                {e.error && <p className="mt-0.5 line-clamp-2 text-red-500">{e.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
