'use client';

/**
 * Live tail of one agent's log.
 *
 * Separate from `WorkerHub` because it has its own cadence and its own state
 * (which agent, what filter, whether ffmpeg noise is shown) and because it is
 * the one panel that costs real bytes to refresh — the render log is ~12 MB
 * and grows by megabytes per render. The server reads only the last 256 KB and
 * filters there, so this component never holds more than a few hundred lines.
 */

import { formatBytes } from '@/lib/worker-hub/format';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Level = 'error' | 'warn' | 'info';

interface LogLine {
  n: number;
  text: string;
  level: Level;
  ts: string | null;
}

interface LogResponse {
  available?: boolean;
  reason?: string;
  path?: string;
  totalBytes?: number;
  modifiedAt?: string | null;
  lines?: LogLine[];
  truncated?: boolean;
  error?: string;
}

export interface LogSource {
  id: string;
  name: string;
  logPath: string | null;
}

const POLL_MS = 5_000;

const LEVEL_CLASS: Record<Level, string> = {
  error: 'text-red-400',
  warn: 'text-amber-400',
  info: 'text-ink2',
};

export function LogViewer({ sources }: { sources: LogSource[] }) {
  const withLogs = sources.filter((s) => s.logPath);
  const [source, setSource] = useState<string>(withLogs[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [showNoise, setShowNoise] = useState(false);
  const [live, setLive] = useState(true);
  const [data, setData] = useState<LogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // First render has no processes yet; adopt the first source once it arrives.
  useEffect(() => {
    if (!source && withLogs[0]) setSource(withLogs[0].id);
  }, [source, withLogs[0]]);

  const load = useCallback(async () => {
    if (!source) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ source, noise: showNoise ? '0' : '1', limit: '300' });
      if (query.trim()) params.set('q', query.trim());
      const res = await fetch(`/api/admin/worker/logs?${params}`, { cache: 'no-store' });
      setData((await res.json()) as LogResponse);
    } catch (e) {
      setData({ available: false, reason: e instanceof Error ? e.message : 'fetch failed' });
    } finally {
      setLoading(false);
    }
  }, [source, query, showNoise]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  // Follow the tail only while live — scrolling back to read is the reason to pause.
  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [live]);

  const lines = data?.lines ?? [];

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-line border-b px-3 py-2">
        <h2 className="font-semibold text-[11.5px]">Worker log</h2>
        <div className="flex gap-1">
          {withLogs.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              className={`rounded-lg px-2.5 py-1 text-xs transition ${
                s.id === source
                  ? 'bg-ink font-semibold text-bg'
                  : 'text-ink2 hover:bg-bg/60 hover:text-ink'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter lines…"
          className="ml-auto w-40 rounded-lg border border-line bg-bg px-2.5 py-1 text-xs sm:w-56"
        />

        <label className="flex items-center gap-1.5 text-ink2 text-xs">
          <input
            type="checkbox"
            checked={showNoise}
            onChange={(e) => setShowNoise(e.target.checked)}
            className="accent-ink"
          />
          ffmpeg noise
        </label>

        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink2 transition hover:text-ink"
        >
          {live ? <Pause size={12} /> : <Play size={12} />}
          {live ? 'Live' : 'Paused'}
        </button>

        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-line p-1.5 text-ink2 transition hover:text-ink"
          aria-label="Refresh log"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {data?.available === false ? (
        <div className="px-3 py-6 text-[11px] text-ink2">
          <p>{data.reason ?? data.error ?? 'unavailable'}</p>
          <p className="mt-1 text-[10px]">
            This panel tails the render and Seedance workers' log files. They are launchd agents on
            the Mac mini, so their logs only exist there — a deployed build has no file to read.
          </p>
        </div>
      ) : (
        <>
          <div className="max-h-[26rem] overflow-auto bg-bg/40 px-4 py-3 font-mono text-[11.5px] leading-relaxed">
            {lines.length === 0 ? (
              <p className="text-ink2">
                {loading ? 'reading…' : 'nothing matched — try clearing the filter'}
              </p>
            ) : (
              lines.map((l) => (
                <div key={l.n} className={`whitespace-pre-wrap break-all ${LEVEL_CLASS[l.level]}`}>
                  {l.text}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          <footer className="flex flex-wrap gap-x-4 gap-y-1 border-line border-t px-4 py-2 text-[11px] text-ink2">
            <span className="font-mono">{data?.path ?? '—'}</span>
            <span>{formatBytes(data?.totalBytes)} on disk</span>
            {data?.truncated && <span>showing the last 256 KB</span>}
            <span className="ml-auto">{lines.length} lines</span>
          </footer>
        </>
      )}
    </section>
  );
}
