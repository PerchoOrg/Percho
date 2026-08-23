'use client';

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
 *
 * The VOICE is the exception — it is chosen here, because changing it costs
 * nothing: the worker synthesises narration at assemble time, so a new voice
 * needs a re-assemble and not a re-plan.
 */

import { useEffect, useState } from 'react';

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

interface VoiceOption {
  id: string;
  character: string;
  /** In the pool automatic selection draws from. */
  auto: boolean;
}

export function NarrationPanel({
  communityId,
  voice,
  segments,
  warnings = [],
  bgm,
  bgmUrl,
  error,
}: {
  communityId: string;
  voice?: string;
  segments: NarrationSegmentView[];
  /**
   * What the generator noticed about its own output — a trimmed line, a
   * script that leans too hard on distances. Not errors: the film is fine,
   * these are the things worth re-running Plan over if they bother you.
   */
  warnings?: string[];
  /** The track `plan` picked, if it picked one. */
  bgm?: BgmChoiceView;
  /** Public stream URL for that track, so it can be heard here. */
  bgmUrl?: string;
  error?: string;
}) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/community-tour/${communityId}/voice`);
      if (!res.ok) return;
      const body = (await res.json()) as { voices: VoiceOption[]; selected: string | null };
      setVoices(body.voices);
      setSelected(body.selected ?? '');
    })();
  }, [communityId]);

  async function pick(next: string) {
    setSelected(next);
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/community-tour/${communityId}/voice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        appliedToRun?: boolean;
      };
      if (!res.ok) {
        setNote(body.message ?? `HTTP ${res.status}`);
        return;
      }
      // The worker synthesises narration at assemble time, so the script does
      // not need rewriting — but nothing is re-heard until it does.
      setNote(
        next === ''
          ? 'Back to the automatic pick. It applies the next time Plan runs.'
          : body.appliedToRun
            ? 'Saved. Re-run Assemble to hear it — the script is unchanged.'
            : 'Saved. It applies the next time Plan runs.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (segments.length === 0 && !bgm && !error) return null;

  const words = segments.reduce((n, s) => n + s.words, 0);
  // What is actually being spoken: the owner's pick if he made one, otherwise
  // whatever `plan` chose and stored on the run.
  const spoken = selected || voice;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold text-lg">Soundtrack</h2>
        {segments.length > 0 && (
          <span className="text-muted text-sm">
            {segments.length} lines · {words} words
          </span>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          <label htmlFor="narration-voice" className="text-muted text-xs">
            Voice
          </label>
          <select
            id="narration-voice"
            value={selected}
            onChange={(e) => void pick(e.target.value)}
            disabled={saving || voices.length === 0}
            className="rounded-lg border border-line bg-bg px-2 py-1 text-ink text-xs disabled:text-muted"
          >
            <option value="">Automatic{voice && !selected ? ` — ${voice}` : ''}</option>
            {/* The ones automatic selection uses first, then the rest. A voice
                we would not choose for a property film is still a voice he may
                want for one community. */}
            <optgroup label="Suited to narration">
              {voices
                .filter((v) => v.auto)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} — {v.character}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Also available">
              {voices
                .filter((v) => !v.auto)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} — {v.character}
                  </option>
                ))}
            </optgroup>
          </select>
          {spoken && (
            <span className="text-muted text-xs">
              reading in <span className="font-medium text-fg">{spoken}</span>
            </span>
          )}
        </div>
      </div>
      {note && <div className="mb-3 text-muted text-xs">{note}</div>}

      {warnings.length > 0 && (
        <ul className="mb-3 space-y-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-ink text-xs">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

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
