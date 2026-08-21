/**
 * Everything the worker hub knows about the machine it is running on.
 *
 * The two workers are launchd agents on the owner's Mac mini, not Vercel
 * functions — `com.percho.render-worker` and `com.percho.seedance-worker`
 * (plus the LiteLLM proxy they share). Their state lives in `launchctl`, `ps`
 * and two log files, and none of that is reachable from a deployed build. So
 * every reader here answers "not the worker host" instead of throwing when it
 * is asked off-box, and the hub's queue panels — which read Supabase and work
 * anywhere — keep rendering.
 *
 * The plists are the source of truth for log path, working directory and
 * program arguments; duplicating them here would rot. `MANAGED` is only the
 * allowlist of labels, and it is also what bounds the restart endpoint: a
 * label that is not in this list is never passed to `launchctl`.
 */

import { execFile } from 'node:child_process';
import { open, readdir, stat } from 'node:fs/promises';
import {
  arch,
  cpus,
  freemem,
  homedir,
  hostname,
  loadavg,
  platform,
  totalmem,
  uptime,
} from 'node:os';
import { dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import {
  type DiskSnapshot,
  type LogLine,
  type MemorySnapshot,
  type ParseLogOptions,
  parseDf,
  parseLaunchctlList,
  parseLogChunk,
  parsePsTable,
  parseVmStat,
} from './host-parsers';

const exec = promisify(execFile);
const EXEC_TIMEOUT_MS = 4_000;

export interface ManagedSpec {
  id: string;
  label: string;
  name: string;
  description: string;
}

export const MANAGED: ManagedSpec[] = [
  {
    id: 'render-worker',
    label: 'com.percho.render-worker',
    name: 'Render worker',
    description: 'ffmpeg / DepthFlow / enhance — drains six queues in priority order',
  },
  {
    id: 'seedance-worker',
    label: 'com.percho.seedance-worker',
    name: 'Seedance worker',
    description: 'submits and polls the two paid OpenRouter queues',
  },
  {
    id: 'litellm',
    label: 'com.percho.litellm',
    name: 'LiteLLM proxy',
    description: 'local model proxy on :4000',
  },
];

export function findManaged(id: string): ManagedSpec | null {
  return MANAGED.find((m) => m.id === id) ?? null;
}

/**
 * True only where the launchd agents actually run. `VERCEL` is checked first
 * because a deployed build should never try to shell out at all.
 */
export function isWorkerHost(): boolean {
  return platform() === 'darwin' && !process.env.VERCEL;
}

async function run(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await exec(cmd, args, {
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

async function runQuiet(cmd: string, args: string[]): Promise<string | null> {
  try {
    return await run(cmd, args);
  } catch {
    return null;
  }
}

interface Plist {
  ProgramArguments?: string[];
  WorkingDirectory?: string;
  StandardOutPath?: string;
  StandardErrorPath?: string;
  KeepAlive?: boolean;
}

async function readPlist(label: string): Promise<Plist | null> {
  const path = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const json = await runQuiet('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path]);
  if (!json) return null;
  try {
    return JSON.parse(json) as Plist;
  } catch {
    return null;
  }
}

/** The script the agent runs — the file whose edits require a restart. */
function entryScript(args: string[] | undefined): string | null {
  if (!args) return null;
  return args.find((a) => a.startsWith('/') && ['.py', '.ts', '.js'].includes(extname(a))) ?? null;
}

/**
 * Newest mtime among the entry script's siblings of the same extension.
 * A worker is stale if ANY module it imported has changed since it booted, and
 * every render-worker module sits in one directory — the DEVLOG has this bug
 * twice ("the worker was running code from 2026-08-17"), so it is worth the
 * one directory read.
 */
async function newestSourceMtime(script: string): Promise<number | null> {
  const dir = dirname(script);
  const ext = extname(script);
  try {
    const names = await readdir(dir);
    const stats = await Promise.all(
      names.filter((n) => extname(n) === ext).map(async (n) => (await stat(join(dir, n))).mtimeMs),
    );
    return stats.length ? Math.max(...stats) : null;
  } catch {
    return null;
  }
}

export interface RepoInfo {
  sha: string;
  subject: string;
  committedAt: string | null;
  /** Commits on origin/main the worker's checkout has not got. */
  behind: number | null;
}

async function repoInfo(dir: string): Promise<RepoInfo | null> {
  const head = await runQuiet('/usr/bin/git', ['-C', dir, 'log', '-1', '--format=%h%n%cI%n%s']);
  if (!head) return null;
  const [sha = '', committedAt = '', ...rest] = head.trim().split('\n');
  const behindRaw = await runQuiet('/usr/bin/git', [
    '-C',
    dir,
    'rev-list',
    '--count',
    'HEAD..origin/main',
  ]);
  const behind = behindRaw ? Number(behindRaw.trim()) : Number.NaN;
  return {
    sha,
    subject: rest.join(' '),
    committedAt: committedAt || null,
    behind: Number.isFinite(behind) ? behind : null,
  };
}

export interface ProcessSnapshot {
  id: string;
  label: string;
  name: string;
  description: string;
  /** False when no plist exists here — this machine does not run that agent. */
  installed: boolean;
  running: boolean;
  pid: number | null;
  lastExitCode: number | null;
  cpuPct: number | null;
  rssBytes: number | null;
  uptimeSec: number | null;
  startedAt: string | null;
  workingDir: string | null;
  logPath: string | null;
  logBytes: number | null;
  /** Last write to the log — a running worker with a cold log is a hung worker. */
  logModifiedAt: string | null;
  entryScript: string | null;
  sourceModifiedAt: string | null;
  /** Source edited after the process booted: it is running yesterday's code. */
  stale: boolean;
  repo: RepoInfo | null;
}

export async function loadProcesses(): Promise<ProcessSnapshot[]> {
  const plists = await Promise.all(MANAGED.map((m) => readPlist(m.label)));
  const list = (await runQuiet('/bin/launchctl', ['list'])) ?? '';
  const entries = MANAGED.map((m) => parseLaunchctlList(list, m.label));

  const pids = entries.map((e) => e?.pid).filter((p): p is number => typeof p === 'number');
  const ps = pids.length
    ? parsePsTable(
        (await runQuiet('/bin/ps', ['-o', 'pid=,%cpu=,rss=,etime=', '-p', pids.join(',')])) ?? '',
      )
    : new Map();

  return Promise.all(
    MANAGED.map(async (spec, i) => {
      const plist = plists[i];
      const entry = entries[i];
      const pid = entry?.pid ?? null;
      const proc = pid !== null ? ps.get(pid) : undefined;
      const script = entryScript(plist?.ProgramArguments);
      const logPath = plist?.StandardOutPath ?? null;

      const [logStat, sourceMtime, repo] = await Promise.all([
        logPath ? stat(logPath).catch(() => null) : null,
        script ? newestSourceMtime(script) : null,
        plist?.WorkingDirectory ? repoInfo(plist.WorkingDirectory) : null,
      ]);

      const startedAt = proc ? new Date(Date.now() - proc.uptimeSec * 1000) : null;

      return {
        id: spec.id,
        label: spec.label,
        name: spec.name,
        description: spec.description,
        installed: plist !== null,
        running: pid !== null,
        pid,
        lastExitCode: entry?.lastExitCode ?? null,
        cpuPct: proc?.cpuPct ?? null,
        rssBytes: proc?.rssBytes ?? null,
        uptimeSec: proc?.uptimeSec ?? null,
        startedAt: startedAt?.toISOString() ?? null,
        workingDir: plist?.WorkingDirectory ?? null,
        logPath,
        logBytes: logStat?.size ?? null,
        logModifiedAt: logStat?.mtime.toISOString() ?? null,
        entryScript: script,
        sourceModifiedAt: sourceMtime ? new Date(sourceMtime).toISOString() : null,
        stale: !!(startedAt && sourceMtime && sourceMtime > startedAt.getTime()),
        repo,
      } satisfies ProcessSnapshot;
    }),
  );
}

export interface SystemSnapshot {
  hostname: string;
  platform: string;
  arch: string;
  cpuCount: number;
  loadAvg: [number, number, number];
  /** load1 / cores — over 1.0 means the box is oversubscribed. */
  loadPerCore: number;
  uptimeSec: number;
  memory: MemorySnapshot;
  disk: DiskSnapshot | null;
  /** Leftover `/tmp/render-*` scratch: a leak shows up here before it fills the disk. */
  scratchDirs: number;
  ffmpegProcs: number;
}

const SCRATCH_PREFIXES = ['render-', 'assembly-', 'clip-', 'outpaint-', 'enhance-'];

async function scratchCount(): Promise<number> {
  try {
    const names = await readdir('/tmp');
    return names.filter((n) => SCRATCH_PREFIXES.some((p) => n.startsWith(p))).length;
  } catch {
    return 0;
  }
}

async function ffmpegCount(): Promise<number> {
  const out = await runQuiet('/usr/bin/pgrep', ['-c', '-x', 'ffmpeg']);
  const n = Number((out ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

export async function loadSystem(): Promise<SystemSnapshot> {
  const [vmStat, df, scratch, ffmpeg] = await Promise.all([
    runQuiet('/usr/bin/vm_stat', []),
    runQuiet('/bin/df', ['-k', '/']),
    scratchCount(),
    ffmpegCount(),
  ]);

  const total = totalmem();
  const [one = 0, five = 0, fifteen = 0] = loadavg();
  const cores = cpus().length || 1;

  return {
    hostname: hostname(),
    platform: platform(),
    arch: arch(),
    cpuCount: cores,
    loadAvg: [one, five, fifteen],
    loadPerCore: one / cores,
    uptimeSec: uptime(),
    memory: (vmStat && parseVmStat(vmStat, total)) || {
      totalBytes: total,
      availableBytes: freemem(),
      usedPct: ((total - freemem()) / total) * 100,
    },
    disk: df ? parseDf(df) : null,
    scratchDirs: scratch,
    ffmpegProcs: ffmpeg,
  };
}

/** Bytes read off the end of a log. 256 KB is ~1500 lines of worker output. */
const TAIL_BYTES = 256 * 1024;

export interface LogTail {
  path: string;
  totalBytes: number;
  modifiedAt: string | null;
  lines: LogLine[];
  /** True when the file is larger than the window we read. */
  truncated: boolean;
}

/**
 * Tail a log by reading the last `TAIL_BYTES` — the render log is ~12 MB of
 * mostly ffmpeg progress, so reading it whole is not an option.
 */
export async function tailLog(path: string, opts: ParseLogOptions = {}): Promise<LogTail> {
  const info = await stat(path);
  const start = Math.max(0, info.size - TAIL_BYTES);
  const length = info.size - start;

  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    return {
      path,
      totalBytes: info.size,
      modifiedAt: info.mtime.toISOString(),
      lines: parseLogChunk(buf.toString('utf8'), { ...opts, partialFirstLine: start > 0 }),
      truncated: start > 0,
    };
  } finally {
    await fh.close();
  }
}

/**
 * `launchctl kickstart -k` — stop if running, then start. The label must come
 * from `MANAGED`; the caller resolves it by id so no request string ever
 * reaches the command line.
 */
export async function restartAgent(spec: ManagedSpec): Promise<void> {
  await run('/bin/launchctl', [
    'kickstart',
    '-k',
    `gui/${process.getuid?.() ?? 501}/${spec.label}`,
  ]);
}
