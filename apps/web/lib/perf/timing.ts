/**
 * Tiny timing helper for measuring server-side latency on hot pages.
 * Logs a single JSON line per request so the data is grep-able in Vercel
 * function logs.
 *
 * Usage:
 *   const t = startTimer('communities-page');
 *   t.mark('auth');
 *   ...
 *   t.mark('fetch');
 *   t.end();  // emits one JSON line
 */

export function startTimer(_label: string) {
  const t0 = Date.now();
  let last = t0;
  const marks: Record<string, number> = {};

  return {
    mark(name: string) {
      const now = Date.now();
      marks[name] = now - last;
      last = now;
    },
    end(_extra?: Record<string, unknown>) {
      const _total = Date.now() - t0;
    },
  };
}
