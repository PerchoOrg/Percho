/**
 * Phase 53 Phase B (2026-06-24): tiny timing helper for measuring server-side
 * latency on hot pages. Logs a single JSON line per request so the data is
 * grep-able in Vercel function logs.
 *
 * Usage:
 *   const t = startTimer('communities-page');
 *   t.mark('auth');
 *   ...
 *   t.mark('fetch');
 *   t.end();  // emits one JSON line
 *
 * Remove after Phase B once we've identified the bottleneck.
 */

export function startTimer(label: string) {
  const t0 = Date.now();
  let last = t0;
  const marks: Record<string, number> = {};

  return {
    mark(name: string) {
      const now = Date.now();
      marks[name] = now - last;
      last = now;
    },
    end(extra?: Record<string, unknown>) {
      const total = Date.now() - t0;
      // Single-line JSON so Vercel log search can filter by `perf:` prefix.
      console.log(`perf:${label} ${JSON.stringify({ total_ms: total, ...marks, ...(extra ?? {}) })}`);
    },
  };
}
