import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STALL_SEC,
  LOG_SILENCE_SEC,
  WAITING_STALL_SEC,
  deriveAlerts,
  worstLevel,
} from './alerts';
import type { ProcessSnapshot, SystemSnapshot } from './host';
import type { QueueSnapshot } from './queues';

const NOW = Date.parse('2026-08-21T12:00:00.000Z');
const agoIso = (sec: number) => new Date(NOW - sec * 1000).toISOString();

function proc(over: Partial<ProcessSnapshot> = {}): ProcessSnapshot {
  return {
    id: 'render-worker',
    label: 'com.percho.render-worker',
    name: 'Render worker',
    description: '',
    installed: true,
    running: true,
    pid: 1,
    lastExitCode: 0,
    cpuPct: 1,
    rssBytes: 1,
    uptimeSec: 3600,
    startedAt: agoIso(3600),
    workingDir: '/repo',
    logPath: '/tmp/x.log',
    logBytes: 10,
    logModifiedAt: agoIso(10),
    entryScript: '/repo/worker.py',
    sourceModifiedAt: agoIso(7200),
    stale: false,
    repo: null,
    ...over,
  };
}

function queue(over: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    id: 'render-jobs',
    label: 'Home tour renders',
    worker: 'render',
    hint: '',
    waiting: 0,
    active: 0,
    failed24h: 0,
    done24h: 0,
    oldestWaitingAt: null,
    oldestActiveAt: null,
    completions: [],
    error: null,
    ...over,
  };
}

function system(over: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    hostname: 'mac',
    platform: 'darwin',
    arch: 'arm64',
    cpuCount: 10,
    loadAvg: [1, 1, 1],
    loadPerCore: 0.1,
    uptimeSec: 1000,
    memory: { totalBytes: 100, availableBytes: 60, usedPct: 40 },
    disk: { totalBytes: 100, freeBytes: 60, usedPct: 40 },
    scratchDirs: 2,
    ffmpegProcs: 0,
    ...over,
  };
}

const run = (input: Parameters<typeof deriveAlerts>[0]) => deriveAlerts({ now: NOW, ...input });

describe('deriveAlerts', () => {
  it('is silent on a healthy box', () => {
    expect(run({ processes: [proc()], system: system(), queues: [queue()] })).toEqual([]);
  });

  it('does not warn about work that is merely in progress', () => {
    const alerts = run({
      processes: [proc()],
      system: system({ ffmpegProcs: 1 }),
      queues: [
        queue({ waiting: 4, oldestWaitingAt: agoIso(120), active: 1, oldestActiveAt: agoIso(60) }),
      ],
    });
    expect(alerts).toEqual([]);
  });

  it('escalates the same queue once it has waited too long', () => {
    const alerts = run({
      processes: [proc()],
      system: system(),
      queues: [queue({ waiting: 4, oldestWaitingAt: agoIso(WAITING_STALL_SEC + 60) })],
    });
    expect(alerts[0]?.level).toBe('error');
    expect(alerts[0]?.title).toContain('4 waiting');
  });

  it('flags a claim left behind by a restart', () => {
    const alerts = run({
      processes: [proc()],
      system: system(),
      queues: [queue({ active: 1, oldestActiveAt: agoIso(ACTIVE_STALL_SEC + 60) })],
    });
    expect(alerts[0]?.level).toBe('warn');
    expect(alerts[0]?.title).toContain('in flight');
  });

  it('calls a silent-but-running worker an error only when work is waiting', () => {
    const silent = proc({ logModifiedAt: agoIso(LOG_SILENCE_SEC + 60) });

    expect(run({ processes: [silent], system: system(), queues: [queue()] })).toEqual([]);

    const alerts = run({
      processes: [silent],
      system: system(),
      queues: [queue({ waiting: 2, oldestWaitingAt: agoIso(60) })],
    });
    expect(alerts.some((a) => a.level === 'error' && a.title.includes('silent'))).toBe(true);
  });

  it('does not blame the render worker for a seedance queue', () => {
    const silent = proc({ logModifiedAt: agoIso(LOG_SILENCE_SEC + 60) });
    const alerts = run({
      processes: [silent],
      system: system(),
      queues: [queue({ worker: 'seedance', waiting: 3, oldestWaitingAt: agoIso(60) })],
    });
    expect(alerts.some((a) => a.title.includes('silent'))).toBe(false);
  });

  it('reports a stopped agent and its exit code', () => {
    const alerts = run({
      processes: [proc({ running: false, pid: null, lastExitCode: 78 })],
      system: system(),
      queues: [],
    });
    expect(alerts[0]?.level).toBe('error');
    expect(alerts[0]?.detail).toContain('78');
  });

  it('says nothing about an agent that is not installed here', () => {
    expect(
      run({ processes: [proc({ installed: false, running: false })], system: null, queues: [] }),
    ).toEqual([]);
  });

  it('warns when the running process predates its source', () => {
    const alerts = run({ processes: [proc({ stale: true })], system: system(), queues: [] });
    expect(alerts[0]?.title).toContain('older code');
  });

  it('escalates disk pressure by threshold', () => {
    const warn = run({
      processes: [],
      system: system({ disk: { totalBytes: 100, freeBytes: 12, usedPct: 88 } }),
      queues: [],
    });
    expect(warn[0]?.level).toBe('warn');

    const err = run({
      processes: [],
      system: system({ disk: { totalBytes: 100, freeBytes: 4, usedPct: 96 } }),
      queues: [],
    });
    expect(err[0]?.level).toBe('error');
  });

  it('surfaces a queue whose read failed instead of reporting zero', () => {
    const alerts = run({ processes: [], system: null, queues: [queue({ error: 'timeout' })] });
    expect(alerts[0]).toMatchObject({ level: 'warn', detail: 'timeout' });
  });

  it('sorts errors above warnings above info', () => {
    const alerts = run({
      processes: [proc({ stale: true })],
      system: system(),
      queues: [
        queue({ failed24h: 3 }),
        queue({ id: 'q2', waiting: 1, oldestWaitingAt: agoIso(WAITING_STALL_SEC + 1) }),
      ],
    });
    expect(alerts.map((a) => a.level)).toEqual(['error', 'warn', 'info']);
  });
});

describe('worstLevel', () => {
  it('is null when there is nothing to say', () => expect(worstLevel([])).toBeNull());
  it('picks the worst present', () => {
    expect(
      worstLevel([
        { level: 'info', title: '', detail: '' },
        { level: 'error', title: '', detail: '' },
      ]),
    ).toBe('error');
  });
});
