/**
 * What the film will SOUND like, as the plan step decided it: the script and
 * the music under it.
 *
 * Both are chosen during `plan` and neither is heard until the worker renders,
 * so without this the only way to find out is to watch the finished film. Every
 * other decision on this page is reviewable before it costs anything; these
 * should be too — and the music especially, since the whole reason the planner
 * chooses it rather than the worker rolling dice was a film whose music was
 * "too big" and which nobody could have caught beforehand.
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

export interface BgmChoiceView {
  path: string;
  title?: string | null;
  vibe?: string;
  role?: string;
}

export function NarrationPanel({
  voice,
  segments,
  bgm,
  bgmUrl,
  error,
}: {
  voice?: string;
  segments: NarrationSegmentView[];
  /** The track `plan` picked, if it picked one. */
  bgm?: BgmChoiceView;
  /** Public stream URL for that track, so it can be heard here. */
  bgmUrl?: string;
  error?: string;
}) {
  if (segments.length === 0 && !bgm && !error) return null;

  const words = segments.reduce((n, s) => n + s.words, 0);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold text-lg">Soundtrack</h2>
        {segments.length > 0 && (
          <span className="text-muted text-sm">
            {segments.length} lines · {words} words · voice{' '}
            <span className="font-medium text-fg">{voice ?? '—'}</span>
          </span>
        )}
      </div>

      {/* The music, above the script — it plays under all of it. */}
      {bgm ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-bg px-3 py-2">
          <span className="font-medium text-sm">{bgm.title ?? bgm.path.split('/').pop()}</span>
          <span className="text-muted text-xs">
            {[bgm.vibe, bgm.role].filter(Boolean).join(' · ')}
          </span>
          {bgmUrl ? (
            <audio controls preload="none" src={bgmUrl} className="h-8 w-full sm:ml-auto sm:w-64">
              <track kind="captions" />
            </audio>
          ) : null}
        </div>
      ) : segments.length > 0 ? (
        <p className="mb-4 text-muted text-xs">
          No track chosen — the worker will pick one from the approved library at render time.
        </p>
      ) : null}

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
