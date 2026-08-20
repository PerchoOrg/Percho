/**
 * The spoken script, as the plan step wrote it.
 *
 * Narration is produced during `plan` and not spoken until the worker renders,
 * so without this the only way to find out what the film says is to watch it
 * after paying to assemble it. Every other decision on this page is reviewable
 * before it costs anything; this one should be too.
 *
 * Read-only. Editing a line would put it out of step with the section's word
 * budget, and there is no re-synthesis path from here yet — if a line is wrong,
 * re-running plan rewrites the whole script against the same cut.
 */

export interface NarrationSegmentView {
  index: number;
  startClip: number;
  endClip: number;
  startS: number;
  endS: number;
  text: string;
  words: number;
}

export function NarrationPanel({
  voice,
  segments,
  error,
}: {
  voice?: string;
  segments: NarrationSegmentView[];
  error?: string;
}) {
  if (segments.length === 0 && !error) return null;

  const words = segments.reduce((n, s) => n + s.words, 0);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold text-lg">Narration</h2>
        {segments.length > 0 && (
          <span className="text-muted text-sm">
            {segments.length} lines · {words} words · voice{' '}
            <span className="font-medium text-fg">{voice ?? '—'}</span>
          </span>
        )}
      </div>

      {error ? (
        <p className="text-sm text-warn">
          No script written: {error}. The tour still renders with music alone.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {segments.map((s) => (
            <li key={s.index} className="flex gap-3 text-sm">
              {/* Clips, not seconds: the clip range is the actual anchor, and
                  the times are the plan's estimate of where it lands. */}
              <span className="w-28 shrink-0 tabular-nums text-muted text-xs leading-5">
                {s.startClip === s.endClip
                  ? `clip ${s.startClip + 1}`
                  : `clips ${s.startClip + 1}–${s.endClip + 1}`}
                <br />~{s.startS.toFixed(0)}–{s.endS.toFixed(0)}s
              </span>
              <span className="leading-5">{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
