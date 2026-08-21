import { describe, expect, it } from 'vitest';
import {
  classify,
  isNoise,
  parseDf,
  parseEtime,
  parseLaunchctlList,
  parseLogChunk,
  parsePsTable,
  parseVmStat,
} from './host-parsers';

const LAUNCHCTL = `PID\tStatus\tLabel
28408\t-15\tcom.percho.render-worker
-\t0\tcom.percho.seedance-worker
7265\t0\tcom.percho.litellm
`;

describe('parseLaunchctlList', () => {
  it('reads pid and last exit status', () => {
    expect(parseLaunchctlList(LAUNCHCTL, 'com.percho.render-worker')).toEqual({
      pid: 28408,
      lastExitCode: -15,
    });
  });

  it('reports a loaded-but-stopped agent as pidless', () => {
    expect(parseLaunchctlList(LAUNCHCTL, 'com.percho.seedance-worker')).toEqual({
      pid: null,
      lastExitCode: 0,
    });
  });

  it('returns null for a label that is not installed', () => {
    expect(parseLaunchctlList(LAUNCHCTL, 'com.percho.nope')).toBeNull();
  });

  it('does not match a label by prefix', () => {
    expect(parseLaunchctlList(LAUNCHCTL, 'com.percho.render')).toBeNull();
  });
});

describe('parseEtime', () => {
  it('parses MM:SS', () => expect(parseEtime('05:09')).toBe(309));
  it('parses HH:MM:SS', () => expect(parseEtime('2:05:09')).toBe(7509));
  it('parses DD-HH:MM:SS', () => expect(parseEtime('3-02:05:09')).toBe(266_709));
  it('is zero for junk', () => expect(parseEtime('what')).toBe(0));
});

describe('parsePsTable', () => {
  it('converts RSS from KB and etime to seconds', () => {
    const rows = parsePsTable('28408   0.4  105424 3-02:05:09\n61478  12.0   43968       05:09\n');
    expect(rows.get(28408)).toEqual({
      cpuPct: 0.4,
      rssBytes: 105_424 * 1024,
      uptimeSec: 266_709,
    });
    expect(rows.get(61478)?.uptimeSec).toBe(309);
  });

  it('skips lines that are not a process row', () => {
    expect(parsePsTable('\n  \nnot a row\n').size).toBe(0);
  });
});

describe('parseVmStat', () => {
  const VM = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               10000.
Pages active:                            500000.
Pages inactive:                           20000.
Pages speculative:                         5000.
Pages purgeable:                           1000.
`;

  it('counts reclaimable pages as available', () => {
    const total = 16 * 1024 ** 3;
    const mem = parseVmStat(VM, total);
    expect(mem?.availableBytes).toBe(36_000 * 16_384);
    expect(mem?.usedPct).toBeCloseTo(((total - 36_000 * 16_384) / total) * 100, 5);
  });

  it('returns null when the page size line is missing', () => {
    expect(parseVmStat('nonsense', 1024)).toBeNull();
  });
});

describe('parseDf', () => {
  it('reads total and available 1K blocks', () => {
    const df = `Filesystem 1024-blocks      Used Available Capacity iused ifree %iused  Mounted on
/dev/disk3s1s1  971350180 400000000 500000000    45%  1234 5678   18%   /
`;
    expect(parseDf(df)).toEqual({
      totalBytes: 971_350_180 * 1024,
      freeBytes: 500_000_000 * 1024,
      usedPct: ((971_350_180 - 500_000_000) / 971_350_180) * 100,
    });
  });

  it('returns null when df printed only a header', () => {
    expect(parseDf('Filesystem 1024-blocks\n')).toBeNull();
  });
});

describe('isNoise', () => {
  it('hides ffmpeg progress and banner lines', () => {
    for (const line of [
      'frame=  406 fps=0.0 q=-1.0 size=   11264KiB time=00:00:13.35',
      '[out#0/mp4 @ 0xc77045740] video:86969KiB audio:2173KiB',
      '  Stream #0:0(und): Video: h264 (High)',
      '    encoder         : Lavc62.28.102 libx264',
      '[aac @ 0xc7735d180] Qavg: 610.910',
      '',
    ]) {
      expect(isNoise(line), line).toBe(true);
    }
  });

  it('keeps the lines the worker itself writes', () => {
    for (const line of [
      '[worker] starting, polling every 5s',
      '[assembly c111b4ee] uploaded to CF: 7e11f289',
      '[seedance-worker 2026-08-21T05:44:00.452Z] tick done 257 ms 0 jobs',
    ]) {
      expect(isNoise(line), line).toBe(false);
    }
  });
});

describe('classify', () => {
  it('flags failures', () => {
    expect(classify('[job 12ab] failed: CF upload 500')).toBe('error');
    expect(classify('Traceback (most recent call last):')).toBe('error');
  });
  it('flags retries and skips', () => {
    expect(classify('[bgm] skipped 2 tracks')).toBe('warn');
  });
  it('leaves ordinary lines alone', () => {
    expect(classify('[worker] starting, polling every 5s')).toBe('info');
  });
});

describe('parseLogChunk', () => {
  const RAW = [
    'ed line from the middle of a write',
    '[worker] starting, polling every 5s',
    'frame=  406 fps=0.0 q=-1.0',
    '[assembly abc] failed: boom',
  ].join('\n');

  it('drops the partial first line of a mid-file tail', () => {
    const lines = parseLogChunk(RAW, { partialFirstLine: true });
    expect(lines.map((l) => l.text)).toEqual([
      '[worker] starting, polling every 5s',
      '[assembly abc] failed: boom',
    ]);
  });

  it('keeps the first line when the tail started at byte 0', () => {
    expect(parseLogChunk(RAW, { partialFirstLine: false })).toHaveLength(3);
  });

  it('can show the noise when asked', () => {
    expect(parseLogChunk(RAW, { hideNoise: false })).toHaveLength(4);
  });

  it('filters case-insensitively and levels what survives', () => {
    const lines = parseLogChunk(RAW, { query: 'ASSEMBLY' });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('error');
  });

  it('keeps the LAST n lines, renumbered from 1', () => {
    const many = Array.from({ length: 50 }, (_, i) => `[worker] line ${i}`).join('\n');
    const lines = parseLogChunk(many, { limit: 3 });
    expect(lines.map((l) => l.text)).toEqual([
      '[worker] line 47',
      '[worker] line 48',
      '[worker] line 49',
    ]);
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3]);
  });

  it('reads a timestamp when the line carries one', () => {
    const [line] = parseLogChunk('[seedance-worker 2026-08-21T05:44:00.452Z] tick done');
    expect(line?.ts).toBe('2026-08-21T05:44:00.452Z');
  });
});
