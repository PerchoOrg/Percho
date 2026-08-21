'use client';

/**
 * The worker hub: one table, everything on it.
 *
 * Owner 2026-08-21, having seen the panelled version: "can you make it a big
 * table that i can view everything in one page?" — the same call made about the
 * community tour on 2026-08-19, and the same answer: one wide table plus a
 * compact strip, instead of stacked sections you scroll between.
 *
 * The rows are grouped by the worker that drains them, which is not just
 * layout. A queue backs up for exactly one reason — the process that polls it
 * is down, stuck, or busy with a queue above it — so a stalled row and the
 * evidence for why sit in the same group, and the group header carries the
 * process's pid, uptime, CPU, log freshness and running SHA. Alerts print on
 * the row they belong to (`scope` in `alerts.ts`) rather than in a banner the
 * reader has to map back onto the data.
 *
 * Layout, owner 2026-08-21: basic information (host, and what it is costing)
 * top left, recent transitions top right, the table under both, the log last.
 * The two top panels are "what is going on right now"; the table is the
 * detail; the log is what you open once the table says something is wrong.
 *
 * It polls rather than rendering once: the question this page answers ("is it
 * moving?") is only answerable over time. Two cadences — `/host` is cheap and
 * local, `/metrics` is ~50 small PostgREST counts. Pausing stops both, so a
 * tab left open on this page does not poll Supabase forever.
 */

import type { ActivityEvent, SpendSnapshot } from '@/lib/worker-hub/activity';
import {
  type Alert,
  alertsFor,
  deriveAlerts,
  systemAlerts,
  worstLevel,
} from '@/lib/worker-hub/alerts';
import {
  formatAge,
  formatBytes,
  formatDuration,
  formatUsd,
  hourlyHistogram,
} from '@/lib/worker-hub/format';
import type { ProcessSnapshot, SystemSnapshot } from '@/lib/worker-hub/host';
import type { QueueSnapshot, QueueWorker } from '@/lib/worker-hub/queues';
import { AlertTriangle, CheckCircle2, Info, Pause, Play, RotateCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { LogViewer } from './LogViewer';

const HOST_POLL_MS = 5_000;
const METRICS_POLL_MS = 15_000;

/** Which process drains which queue group. Keyed by `QueueSpec.worker`. */
const WORKER_OF: Record<QueueWorker, string> = {
  render: 'render-worker',
  seedance: 'seedance-worker',
};

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
      (q) => q.active > 0 && WORKER_OF[q.worker] === p.id,
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

  // Queues in poll order, grouped under their worker. A process with no queues
  // (LiteLLM) still gets a group — it is a thing that can be down.
  const groups = processes.map((p) => ({
    proc: p,
    rows: queues.filter((q) => WORKER_OF[q.worker] === p.id),
  }));
  const ungrouped = queues.filter((q) => !processes.some((p) => WORKER_OF[q.worker] === p.id));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-2">
        <BasicInfo
          alerts={alerts}
          system={host?.system ?? null}
          hostReason={host && !host.available ? (host.reason ?? 'host unavailable') : null}
          spend={metrics?.spend ?? null}
          updatedAt={updatedAt}
          paused={paused}
          onToggle={() => setPaused((v) => !v)}
          onRefresh={() => {
            void loadHost();
            void loadMetrics();
          }}
        />
        <ActivityPanel events={metrics?.activity ?? []} />
      </div>

      {notice && (
        <p className="rounded-lg border border-line bg-surface px-3 py-1.5 text-ink2 text-xs">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full border-collapse text-left text-[11px]" style={{ minWidth: 1100 }}>
          <thead className="bg-bg/40 text-ink2">
            <tr className="border-line border-b">
              <th className="px-3 py-2 font-medium">Queue</th>
              <th className="px-2 py-2 text-right font-medium">Waiting</th>
              <th className="px-2 py-2 font-medium">Oldest</th>
              <th className="px-2 py-2 text-right font-medium">In flight</th>
              <th className="px-2 py-2 font-medium">Since</th>
              <th className="px-2 py-2 text-right font-medium">Done 24h</th>
              <th className="px-2 py-2 text-right font-medium">Failed 24h</th>
              <th className="px-3 py-2 font-medium">Last 24h</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && queues.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-ink2">
                  loading…
                </td>
              </tr>
            )}

            {groups.map(({ proc, rows }) => (
              <WorkerGroup
                key={proc.id}
                proc={proc}
                rows={rows}
                alerts={alerts}
                busy={busy === proc.id}
                onRestart={() => void restart(proc)}
              />
            ))}

            {/* Off the worker host there are no processes to group under. */}
            {ungrouped.length > 0 && (
              <>
                <tr className="border-line border-y bg-bg/40">
                  <td colSpan={9} className="px-3 py-1.5 text-ink2">
                    Queues (worker state unavailable — not the worker host)
                  </td>
                </tr>
                {ungrouped.map((q) => (
                  <QueueRow key={q.id} queue={q} alerts={alertsFor(alerts, 'queue', q.id)} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <LogViewer sources={processes.map((p) => ({ id: p.id, name: p.name, logPath: p.logPath }))} />
    </div>
  );
}

/* ------------------------------------------------------------ basic info */

/**
 * Top left: what machine this is, how hard it is working, and what it is
 * costing. Owner 2026-08-21 asked for the cost here and asked what it was —
 * hence the per-source breakdown and the explicit note that it is the
 * provider's own billed figure, not an estimate of ours.
 */
function BasicInfo({
  alerts,
  system,
  hostReason,
  spend,
  updatedAt,
  paused,
  onToggle,
  onRefresh,
}: {
  alerts: Alert[];
  system: SystemSnapshot | null;
  hostReason: string | null;
  spend: SpendSnapshot | null;
  updatedAt: number | null;
  paused: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const worst = worstLevel(alerts);
  const hostIssues = systemAlerts(alerts);
  const errors = alerts.filter((a) => a.level === 'error').length;
  const warns = alerts.filter((a) => a.level === 'warn').length;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center gap-2 border-line border-b px-3 py-2">
        <span className="flex items-center gap-1.5 font-semibold text-[11.5px]">
          {worst === 'error' ? (
            <XCircle size={14} className="text-red-500" />
          ) : worst === 'warn' ? (
            <AlertTriangle size={14} className="text-amber-500" />
          ) : (
            <CheckCircle2 size={14} className="text-emerald-500" />
          )}
          {worst === 'error'
            ? `${errors} problem${errors === 1 ? '' : 's'}`
            : worst === 'warn'
              ? `${warns} warning${warns === 1 ? '' : 's'}`
              : 'All clear'}
        </span>

        <span className="ml-auto flex items-center gap-2 text-[10px]">
          <span className="text-ink2">
            {updatedAt ? formatAge(new Date(updatedAt).toISOString()) : 'loading…'}
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-ink2 transition hover:text-ink"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
            {paused ? 'Paused' : 'Live'}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-line p-1 text-ink2 transition hover:text-ink"
            aria-label="Refresh now"
          >
            <RotateCw size={11} />
          </button>
        </span>
      </header>

      <div className="px-3 py-2.5">
        {system ? (
          <>
            <div className="text-[10px] text-ink2">
              {system.hostname.replace(/\.local$/, '')} · {system.arch} · {system.cpuCount} cores ·
              up {formatDuration(system.uptimeSec)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <Meter
                label="Load"
                value={system.loadAvg[0].toFixed(2)}
                hint={`${system.loadAvg[1].toFixed(2)} / ${system.loadAvg[2].toFixed(2)}`}
                pct={Math.min(100, system.loadPerCore * 100)}
              />
              <Meter
                label="Memory"
                value={`${system.memory.usedPct.toFixed(0)}%`}
                hint={`${formatBytes(system.memory.availableBytes)} free`}
                pct={system.memory.usedPct}
              />
              <Meter
                label="Disk"
                value={system.disk ? `${system.disk.usedPct.toFixed(0)}%` : '—'}
                hint={system.disk ? `${formatBytes(system.disk.freeBytes)} free` : 'unreadable'}
                pct={system.disk?.usedPct ?? 0}
              />
              <Stat label="ffmpeg" value={String(system.ffmpegProcs)} hint="rendering now" />
              <Stat label="scratch" value={`${system.scratchDirs}`} hint="dirs in /tmp" />
            </div>
          </>
        ) : (
          <p className="text-[11px] text-ink2">
            {hostReason ?? 'reading host…'}
            <span className="block text-[10px]">
              Machine and process readings only exist on the Mac the workers run on.
            </span>
          </p>
        )}

        {hostIssues.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {hostIssues.map((a) => (
              <li key={a.title} className="flex gap-1 text-[10px] text-amber-600">
                <AlertTriangle size={11} className="mt-px shrink-0" />
                <span title={a.detail}>{a.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SpendBlock spend={spend} />
    </section>
  );
}

/**
 * The cost, and what it is.
 *
 * `cost_usd` is `usage.cost` off the provider's own response — what OpenRouter
 * says it billed for that generation, not a rate we multiply out. Local Ken
 * Burns and DepthFlow renders never write one, so a $0 day means no paid
 * generation ran, not that nothing rendered. The breakdown is here because the
 * owner's first question about the number was what it covered.
 */
function SpendBlock({ spend }: { spend: SpendSnapshot | null }) {
  if (!spend) return null;
  const max = Math.max(0.01, ...spend.byDay.map((d) => d.usd));

  return (
    <div className="border-line border-t px-3 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] text-ink2 uppercase tracking-wide">Paid generation</span>
        <span className="text-[10px] text-ink2">billed by OpenRouter · local renders are free</span>
      </div>

      <div className="mt-1.5 flex items-end gap-5">
        <div>
          <div className="font-semibold text-lg leading-none">{formatUsd(spend.today)}</div>
          <div className="text-[10px] text-ink2">today (UTC)</div>
        </div>
        <div>
          <div className="font-semibold text-lg leading-none">{formatUsd(spend.last7d)}</div>
          <div className="text-[10px] text-ink2">7 days · {spend.jobs7d} jobs</div>
        </div>
        <div className="ml-auto flex h-8 items-end gap-1">
          {spend.byDay.map((d) => (
            <span
              key={d.date}
              className={`w-2 rounded-t ${d.usd > 0 ? 'bg-amber-500/70' : 'bg-line'}`}
              style={{ height: `${Math.max(6, (d.usd / max) * 100)}%` }}
              title={`${d.date}: ${formatUsd(d.usd)}`}
            />
          ))}
        </div>
      </div>

      {spend.bySource.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {spend.bySource.map((s) => (
            <li key={s.label} className="flex items-baseline gap-2 text-[10px]">
              <span className="text-ink2">{s.label}</span>
              <span className="flex-1 border-line/60 border-b border-dotted" aria-hidden />
              <span className="text-ink2">{s.jobs} jobs</span>
              <span className="w-12 text-right font-medium">{formatUsd(s.usd)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Meter({
  label,
  value,
  hint,
  pct,
}: {
  label: string;
  value: string;
  hint: string;
  pct: number;
}) {
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="text-[10px] text-ink2 uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-sm leading-tight">{value}</div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full ${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-ink2">{hint}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'bad';
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[10px] text-ink2 uppercase tracking-wide">{label}</span>
      <span className={`font-medium ${tone === 'bad' ? 'text-red-500' : ''}`}>{value}</span>
      {hint && <span className="text-[10px] text-ink2">{hint}</span>}
    </span>
  );
}

/* ----------------------------------------------------------- worker group */

function WorkerGroup({
  proc,
  rows,
  alerts,
  busy,
  onRestart,
}: {
  proc: ProcessSnapshot;
  rows: QueueSnapshot[];
  alerts: Alert[];
  busy: boolean;
  onRestart: () => void;
}) {
  const own = alertsFor(alerts, 'process', proc.id);
  const dot = !proc.installed
    ? 'bg-ink2/40'
    : proc.running
      ? proc.stale
        ? 'bg-amber-500'
        : 'bg-emerald-500'
      : 'bg-red-500';

  return (
    <>
      <tr className="border-line border-y bg-bg/40">
        <td colSpan={9} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 font-semibold text-[11.5px]">
              <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
              {proc.name}
            </span>

            {!proc.installed ? (
              <span className="text-ink2">no launchd agent on this machine</span>
            ) : !proc.running ? (
              <span className="font-medium text-red-500">
                not running
                {proc.lastExitCode !== null && proc.lastExitCode !== 0
                  ? ` · last exit ${proc.lastExitCode}`
                  : ''}
              </span>
            ) : (
              <>
                <Stat label="pid" value={String(proc.pid)} />
                <Stat label="up" value={formatDuration(proc.uptimeSec)} />
                <Stat
                  label="cpu"
                  value={proc.cpuPct === null ? '—' : `${proc.cpuPct.toFixed(1)}%`}
                />
                <Stat label="rss" value={formatBytes(proc.rssBytes)} />
                <Stat
                  label="log"
                  value={formatAge(proc.logModifiedAt)}
                  hint={formatBytes(proc.logBytes)}
                />
                {proc.repo && (
                  <Stat
                    label="code"
                    value={proc.repo.sha}
                    hint={proc.repo.behind ? `${proc.repo.behind} behind` : 'up to date'}
                    tone={proc.repo.behind ? 'bad' : undefined}
                  />
                )}
                {proc.stale && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-600">
                    running older code — source edited {formatAge(proc.sourceModifiedAt)}
                  </span>
                )}
              </>
            )}

            {own
              .filter((a) => a.level === 'error')
              .map((a) => (
                <span key={a.title} className="flex items-center gap-1 text-red-500">
                  <XCircle size={11} />
                  {a.title}
                </span>
              ))}

            {proc.installed && (
              <button
                type="button"
                onClick={onRestart}
                disabled={busy}
                className="ml-auto rounded border border-line px-2 py-0.5 text-ink2 transition hover:text-ink disabled:opacity-50"
              >
                {busy ? 'Restarting…' : 'Restart'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {rows.length === 0 ? (
        <tr className="border-line/60 border-b">
          <td colSpan={9} className="px-3 py-1.5 pl-8 text-ink2">
            no queues — nothing to drain
          </td>
        </tr>
      ) : (
        rows.map((q) => <QueueRow key={q.id} queue={q} alerts={alertsFor(alerts, 'queue', q.id)} />)
      )}
    </>
  );
}

/* -------------------------------------------------------------- queue row */

function QueueRow({ queue: q, alerts }: { queue: QueueSnapshot; alerts: Alert[] }) {
  const worst = worstLevel(alerts);
  const rowTone =
    worst === 'error' ? 'bg-red-500/[0.06]' : worst === 'warn' ? 'bg-amber-500/[0.06]' : '';

  return (
    <tr className={`border-line/60 border-b align-top ${rowTone}`}>
      <td className="py-1.5 pr-2 pl-8">
        <div className="font-medium">{q.label}</div>
        <div className="text-[10px] text-ink2">{q.hint}</div>
      </td>
      <td
        className={`px-2 py-1.5 text-right font-semibold ${q.waiting > 0 ? 'text-ink' : 'text-ink2'}`}
      >
        {q.waiting}
      </td>
      <td className="px-2 py-1.5 text-[10px] text-ink2">
        {q.waiting > 0 ? formatAge(q.oldestWaitingAt) : '—'}
      </td>
      <td
        className={`px-2 py-1.5 text-right font-semibold ${q.active > 0 ? 'text-blue-500' : 'text-ink2'}`}
      >
        {q.active}
      </td>
      <td className="px-2 py-1.5 text-[10px] text-ink2">
        {q.active > 0 ? formatAge(q.oldestActiveAt) : '—'}
      </td>
      <td className="px-2 py-1.5 text-right text-emerald-600">
        {q.done24h === null ? <span className="text-ink2">n/a</span> : q.done24h}
      </td>
      <td className={`px-2 py-1.5 text-right ${q.failed24h > 0 ? 'text-red-500' : 'text-ink2'}`}>
        {q.failed24h}
      </td>
      <td className="px-3 py-1.5">
        <Sparkline values={hourlyHistogram(q.completions)} />
      </td>
      <td className="px-3 py-1.5">
        {alerts.length === 0 ? (
          <span className="text-[10px] text-ink2">—</span>
        ) : (
          <ul className="space-y-0.5">
            {alerts.map((a) => (
              <li key={a.title} className="flex gap-1 text-[10px]">
                <AlertIcon level={a.level} />
                <span title={a.detail}>{a.title.replace(`${q.label}: `, '')}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function AlertIcon({ level }: { level: Alert['level'] }) {
  if (level === 'error') return <XCircle size={11} className="mt-px shrink-0 text-red-500" />;
  if (level === 'warn')
    return <AlertTriangle size={11} className="mt-px shrink-0 text-amber-500" />;
  return <Info size={11} className="mt-px shrink-0 text-ink2" />;
}

/** 24 hourly buckets. Flat and empty is as informative as a spike. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-4 items-end gap-px" aria-hidden>
      {values.map((v, i) => (
        <span
          key={`h${i - 24}`}
          className={`w-[3px] rounded-sm ${v > 0 ? 'bg-emerald-500/70' : 'bg-line'}`}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
          title={`${v} in hour -${23 - i}`}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- activity */

const STATUS_CLASS: Record<string, string> = {
  ready: 'text-emerald-600',
  approved: 'text-emerald-600',
  done: 'text-emerald-600',
  failed: 'text-red-500',
  processing: 'text-blue-500',
  running: 'text-blue-500',
  submitting: 'text-blue-500',
};

/**
 * Top right: the last transition of every queue, merged into one list. This is
 * the "what just happened" view — the table says how many failed in 24h, this
 * says which one and why.
 */
function ActivityPanel({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface">
      <header className="flex items-baseline gap-2 border-line border-b px-3 py-2">
        <h2 className="font-semibold text-[11.5px]">Recent transitions</h2>
        <span className="text-[10px] text-ink2">every queue, newest first</span>
        <span className="ml-auto text-[10px] text-ink2">{events.length}</span>
      </header>
      <div className="max-h-[19rem] min-h-[9rem] flex-1 overflow-auto">
        {events.length === 0 ? (
          <p className="px-3 py-6 text-[11px] text-ink2">nothing yet</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {events.map((e) => (
              <li key={`${e.source}-${e.id}-${e.at}`} className="px-3 py-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${STATUS_CLASS[e.status] ?? 'text-ink2'}`}>
                    {e.status}
                  </span>
                  <span>{e.source}</span>
                  <span className="truncate text-[10px] text-ink2">{e.detail}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-ink2">{formatAge(e.at)}</span>
                </div>
                {e.error && (
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-red-500">{e.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
