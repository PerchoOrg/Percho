/**
 * The verdict line at the top of the worker hub.
 *
 * Counts alone don't say whether anything is wrong — "4 pending" is healthy
 * mid-render and a dead worker four hours later. Every rule here pairs a
 * number with a *time*, which is what separates the two. Pure and tested, so
 * the thresholds are reviewable in one place instead of scattered across JSX.
 */

import type { ProcessSnapshot, SystemSnapshot } from './host';
import type { QueueSnapshot } from './queues';

export type AlertLevel = 'error' | 'warn' | 'info';

/**
 * What the alert is about, so the table can print it on the row it belongs to
 * rather than in a banner the reader has to map back onto the data themselves.
 * `id` is the queue id or the process id; `system` alerts belong to the host
 * strip, which is neither.
 */
export type AlertScope =
  | { kind: 'queue'; id: string }
  | { kind: 'process'; id: string }
  | { kind: 'system' };

export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
  scope: AlertScope;
}

/** A queue that has waited this long with nothing draining it is stuck. */
export const WAITING_STALL_SEC = 30 * 60;
/** A claimed row still `processing` after this is almost always a dead claim. */
export const ACTIVE_STALL_SEC = 90 * 60;
/** A running worker that hasn't written a line in this long, while work waits. */
export const LOG_SILENCE_SEC = 15 * 60;
export const DISK_WARN_PCT = 85;
export const DISK_ERROR_PCT = 93;
export const MEM_WARN_PCT = 92;
export const LOAD_WARN_PER_CORE = 2;
/** Scratch dirs left in /tmp — a few are in flight, dozens are a leak. */
export const SCRATCH_WARN = 25;

export interface AlertInput {
  processes: ProcessSnapshot[];
  system: SystemSnapshot | null;
  queues: QueueSnapshot[];
  now?: number;
}

const ageSec = (iso: string | null, now: number): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now - t) / 1000 : null;
};

const mins = (sec: number): string =>
  sec < 3600 ? `${Math.round(sec / 60)}m` : `${(sec / 3600).toFixed(1)}h`;

const LEVEL_ORDER: Record<AlertLevel, number> = { error: 0, warn: 1, info: 2 };

export function deriveAlerts({ processes, system, queues, now = Date.now() }: AlertInput): Alert[] {
  const out: Alert[] = [];

  for (const p of processes) {
    if (!p.installed) continue;

    if (!p.running) {
      out.push({
        scope: { kind: 'process', id: p.id },
        level: 'error',
        title: `${p.name} is not running`,
        detail:
          p.lastExitCode !== null && p.lastExitCode !== 0
            ? `launchd reports exit code ${p.lastExitCode}. KeepAlive should have restarted it — check the log.`
            : 'The launchd agent is loaded but has no PID.',
      });
      continue;
    }

    if (p.stale) {
      out.push({
        scope: { kind: 'process', id: p.id },
        level: 'warn',
        title: `${p.name} is running older code`,
        detail: `Its source was edited after the process booted ${p.uptimeSec ? mins(p.uptimeSec) : '?'} ago. A merged fix does nothing until it restarts.`,
      });
    }

    if (p.repo?.behind) {
      out.push({
        scope: { kind: 'process', id: p.id },
        level: 'info',
        title: `${p.name}'s checkout is ${p.repo.behind} commit(s) behind origin/main`,
        detail: `Running ${p.repo.sha} — ${p.repo.subject}`,
      });
    }
  }

  // The stall detector: a worker that is alive but silent while its own queues
  // have work is the failure the old page could not see.
  const waitingFor = (worker: 'render' | 'seedance') =>
    queues.filter((q) => q.worker === worker).reduce((n, q) => n + q.waiting, 0);

  for (const p of processes) {
    if (!p.running || !p.logModifiedAt) continue;
    const worker =
      p.id === 'render-worker' ? 'render' : p.id === 'seedance-worker' ? 'seedance' : null;
    if (!worker) continue;
    const silence = ageSec(p.logModifiedAt, now);
    const waiting = waitingFor(worker);
    if (silence !== null && silence > LOG_SILENCE_SEC && waiting > 0) {
      out.push({
        scope: { kind: 'process', id: p.id },
        level: 'error',
        title: `${p.name} has been silent for ${mins(silence)}`,
        detail: `${waiting} job(s) are waiting and nothing has been written to its log. The process is up but not working.`,
      });
    }
  }

  for (const q of queues) {
    if (q.error) {
      out.push({
        scope: { kind: 'queue', id: q.id },
        level: 'warn',
        title: `Can't read ${q.label}`,
        detail: q.error,
      });
      continue;
    }

    const waitAge = ageSec(q.oldestWaitingAt, now);
    if (q.waiting > 0 && waitAge !== null && waitAge > WAITING_STALL_SEC) {
      out.push({
        scope: { kind: 'queue', id: q.id },
        level: 'error',
        title: `${q.label}: ${q.waiting} waiting, oldest ${mins(waitAge)}`,
        detail:
          'Nothing has claimed it. The worker for this queue is down, stuck, or starved by a queue above it.',
      });
    }

    const activeAge = ageSec(q.oldestActiveAt, now);
    if (q.active > 0 && activeAge !== null && activeAge > ACTIVE_STALL_SEC) {
      out.push({
        scope: { kind: 'queue', id: q.id },
        level: 'warn',
        title: `${q.label}: a row has been in flight for ${mins(activeAge)}`,
        detail:
          'Most likely a claim left behind by a worker restart. It will never be picked up again — requeue it.',
      });
    }

    if (q.failed24h > 0) {
      out.push({
        scope: { kind: 'queue', id: q.id },
        level: 'info',
        title: `${q.label}: ${q.failed24h} failed in 24h`,
        detail: 'See the activity feed for the error.',
      });
    }
  }

  if (system) {
    if (system.disk) {
      const pct = system.disk.usedPct;
      if (pct >= DISK_ERROR_PCT) {
        out.push({
          scope: { kind: 'system' },
          level: 'error',
          title: `Disk ${pct.toFixed(0)}% full`,
          detail: 'A render writes hundreds of MB of scratch. This box will start failing jobs.',
        });
      } else if (pct >= DISK_WARN_PCT) {
        out.push({
          scope: { kind: 'system' },
          level: 'warn',
          title: `Disk ${pct.toFixed(0)}% full`,
          detail: 'Worth clearing before the next batch of renders.',
        });
      }
    }

    if (system.memory.usedPct >= MEM_WARN_PCT) {
      out.push({
        scope: { kind: 'system' },
        level: 'warn',
        title: `Memory ${system.memory.usedPct.toFixed(0)}% used`,
        detail: 'Real-ESRGAN and DepthFlow both load models per job; swapping makes renders crawl.',
      });
    }

    if (system.loadPerCore > LOAD_WARN_PER_CORE) {
      out.push({
        scope: { kind: 'system' },
        level: 'warn',
        title: `Load ${system.loadAvg[0].toFixed(1)} on ${system.cpuCount} cores`,
        detail: 'The box is oversubscribed — renders will take longer than their usual wall time.',
      });
    }

    if (system.scratchDirs >= SCRATCH_WARN) {
      out.push({
        scope: { kind: 'system' },
        level: 'warn',
        title: `${system.scratchDirs} scratch directories in /tmp`,
        detail: 'Left behind by interrupted renders. Safe to delete when nothing is running.',
      });
    }
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/** The alerts belonging to one row, worst first. */
export function alertsFor(alerts: Alert[], kind: 'queue' | 'process', id: string): Alert[] {
  return alerts.filter((a) => a.scope.kind === kind && a.scope.id === id);
}

/** Host-level alerts — disk, memory, load, scratch. */
export function systemAlerts(alerts: Alert[]): Alert[] {
  return alerts.filter((a) => a.scope.kind === 'system');
}

/** Worst level present, or null when everything is clean. */
export function worstLevel(alerts: Alert[]): AlertLevel | null {
  if (alerts.some((a) => a.level === 'error')) return 'error';
  if (alerts.some((a) => a.level === 'warn')) return 'warn';
  return alerts.length ? 'info' : null;
}
