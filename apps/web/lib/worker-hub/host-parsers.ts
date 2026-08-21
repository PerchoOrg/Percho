/**
 * Pure parsers for the command output the worker hub reads off the host.
 *
 * Separated from `host.ts` so they are testable without a Mac, a running
 * worker, or `child_process`. Everything here takes a string and returns data;
 * nothing here spawns anything.
 */

/** One row of `launchctl list`: PID, last exit status, label. */
export interface LaunchdEntry {
  /** Null when the job is loaded but not running. */
  pid: number | null;
  /** Exit status of the last run. Non-zero after a crash; 0 after a clean stop. */
  lastExitCode: number | null;
}

export function parseLaunchctlList(text: string, label: string): LaunchdEntry | null {
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3 || parts[2] !== label) continue;
    const pid = parts[0] === '-' ? null : Number(parts[0]);
    const status = parts[1] === '-' ? null : Number(parts[1]);
    return {
      pid: pid !== null && Number.isFinite(pid) ? pid : null,
      lastExitCode: status !== null && Number.isFinite(status) ? status : null,
    };
  }
  return null;
}

export interface PsRow {
  cpuPct: number;
  rssBytes: number;
  uptimeSec: number;
}

/** `[[DD-]HH:]MM:SS` as printed by `ps -o etime`. */
export function parseEtime(raw: string): number {
  const trimmed = raw.trim();
  const [days, rest] = trimmed.includes('-')
    ? [Number(trimmed.split('-')[0]), trimmed.split('-')[1] ?? '']
    : [0, trimmed];
  const parts = rest.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  const [h, m, s] =
    parts.length === 3
      ? [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
      : [0, parts[0] ?? 0, parts[1] ?? 0];
  return days * 86_400 + h * 3600 + m * 60 + s;
}

/** `ps -o pid=,%cpu=,rss=,etime=` — RSS is in KB on macOS. */
export function parsePsTable(text: string): Map<number, PsRow> {
  const out = new Map<number, PsRow>();
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const pid = Number(parts[0]);
    const cpu = Number(parts[1]);
    const rssKb = Number(parts[2]);
    if (!Number.isFinite(pid) || !Number.isFinite(cpu) || !Number.isFinite(rssKb)) continue;
    out.set(pid, {
      cpuPct: cpu,
      rssBytes: rssKb * 1024,
      uptimeSec: parseEtime(parts[3] ?? ''),
    });
  }
  return out;
}

export interface MemorySnapshot {
  totalBytes: number;
  /** Free + inactive + speculative + purgeable — what a render can actually take. */
  availableBytes: number;
  usedPct: number;
}

/**
 * `vm_stat`. Node's `os.freemem()` on macOS counts only genuinely free pages
 * and reads near-zero on a healthy machine, which would light this panel red
 * permanently. Inactive and purgeable pages are reclaimable, so they count as
 * available — the same definition Activity Monitor uses.
 */
export function parseVmStat(text: string, totalBytes: number): MemorySnapshot | null {
  const pageSizeMatch = text.match(/page size of (\d+) bytes/);
  if (!pageSizeMatch?.[1]) return null;
  const pageSize = Number(pageSizeMatch[1]);

  const pages = (name: string): number => {
    const m = text.match(new RegExp(`Pages ${name}:\\s+(\\d+)`));
    return m?.[1] ? Number(m[1]) : 0;
  };

  const available =
    (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * pageSize;
  if (!Number.isFinite(available) || totalBytes <= 0) return null;

  return {
    totalBytes,
    availableBytes: available,
    usedPct: Math.max(0, Math.min(100, ((totalBytes - available) / totalBytes) * 100)),
  };
}

export interface DiskSnapshot {
  totalBytes: number;
  freeBytes: number;
  usedPct: number;
}

/** `df -k <path>` — second line, 1K blocks. */
export function parseDf(text: string): DiskSnapshot | null {
  const line = text.trim().split('\n')[1];
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const total = Number(parts[1]);
  const avail = Number(parts[3]);
  if (!Number.isFinite(total) || !Number.isFinite(avail) || total <= 0) return null;
  return {
    totalBytes: total * 1024,
    freeBytes: avail * 1024,
    usedPct: ((total - avail) / total) * 100,
  };
}

export interface LogLine {
  n: number;
  text: string;
  level: 'error' | 'warn' | 'info';
  /** ISO timestamp when the line carries one. */
  ts: string | null;
}

/**
 * ffmpeg writes its progress to stderr, which launchd folds into the same
 * file as the worker's own output. It is ~99% of the render log by volume and
 * carries no state, so the viewer hides it by default rather than making the
 * owner scroll past `frame= 2736 fps=877 …` to find `[assembly …] ready`.
 */
export const NOISE_PATTERNS: RegExp[] = [
  /^\s*frame=\s*\d/,
  /^\s*size=\s*\d/,
  /^\[out#/,
  /^\s*(Stream|Metadata|Duration|Input|Output|encoder|handler_name|major_brand|minor_version|compatible_brands|creation_time|vendor_id)\b/,
  /^\s*(built with|configuration:|lib(av|sw|postproc)\w*\s+\d)/,
  /^ffmpeg version /,
  /^\[(aac|libx264|mp4|swscaler|Parsed_)/,
  /^\s*Press \[q\]/,
  /^\s*$/,
];

export function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(line));
}

const ERROR_RE = /\b(error|exception|traceback|failed|fatal|refused|denied)\b/i;
const WARN_RE = /\b(warn|warning|retry|retrying|skip(ped)?|stall)\b/i;
const TS_RE = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/;

export function classify(line: string): 'error' | 'warn' | 'info' {
  if (ERROR_RE.test(line)) return 'error';
  if (WARN_RE.test(line)) return 'warn';
  return 'info';
}

export interface ParseLogOptions {
  /** Case-insensitive substring filter. */
  query?: string;
  /** Drop ffmpeg progress spam. On by default. */
  hideNoise?: boolean;
  /** Keep only the last N matching lines. */
  limit?: number;
}

/**
 * Turn a raw tail into displayable lines, newest last. The first line of a
 * mid-file tail is usually a fragment, so it is dropped when the chunk did not
 * start at byte 0.
 */
export function parseLogChunk(
  raw: string,
  opts: ParseLogOptions & { partialFirstLine?: boolean } = {},
): LogLine[] {
  const { query, hideNoise = true, limit = 300, partialFirstLine = false } = opts;
  const q = query?.trim().toLowerCase();

  const lines = raw.split('\n');
  if (partialFirstLine) lines.shift();

  const kept: LogLine[] = [];
  for (const text of lines) {
    if (hideNoise && isNoise(text)) continue;
    if (q && !text.toLowerCase().includes(q)) continue;
    kept.push({
      n: 0,
      text: text.length > 2000 ? `${text.slice(0, 2000)}…` : text,
      level: classify(text),
      ts: text.match(TS_RE)?.[1] ?? null,
    });
  }

  return kept.slice(-limit).map((l, i) => ({ ...l, n: i + 1 }));
}
