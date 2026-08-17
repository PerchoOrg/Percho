/**
 * VO Pass — narration continuity (Phase 3).
 *
 * Runs AFTER the Scheduler and the Guard, when the order and the durations are
 * already fixed. The Curator writes each line looking at one photo, so a batch
 * reads as a set of captions; this pass rewrites them into one script without
 * being allowed to touch the shot list.
 *
 * Two rules make it safe to let a model near finished copy:
 *   - it may blank a line but never add one to a clip that had none, so it
 *     cannot put narration on a clip the Curator judged silent;
 *   - the school-assignment regex runs again on its output. The Guard already
 *     cleaned the drafts, and a rewrite can reintroduce exactly what was
 *     stripped.
 *
 * No TTS: the tour is scored with BGM (worker.py mux) until a voice provider
 * is chosen, so the word-rate check below is what stands in for "does this fit
 * the timeline".
 */

import type { GuardedClip } from './guard';
import { findSchoolAssignment, stripSchoolAssignment } from './school-language';

export const VO_MODEL = process.env.GEMINI_VO_MODEL ?? 'gemini-3.5-flash';
const GENERATE_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Spoken pace bounds for the whole script (spec §7). */
export const WORDS_PER_SECOND_MIN = 2.1;
export const WORDS_PER_SECOND_MAX = 2.6;
/** The rate a single line must fit its own clip at. */
export const WORDS_PER_SECOND_FIT = 2.4;

export const VO_PROMPT = `You are polishing the narration for a real-estate community tour video.
The shot order, durations, and engines are already fixed and must not change.

Below is the final ordered clip list with a draft narration line for each.
Rewrite the lines so they read as one continuous script rather than a set of
independent captions.

Rules:
- Keep or drop lines. You may set a line to "" but you may NOT add a line to a
  clip that currently has "".
- Total spoken length must stay between 2.1 and 2.6 words per second of the
  summed duration of clips that carry narration.
- Each line must still fit within its own clip duration at 2.4 words/sec.
- Vary sentence openings. Do not start consecutive lines with the same word.
- Plain declarative English. No hype adjectives. No second-person imperatives.
- The first line must work with zero prior context. The last line must land as
  an ending.
- HARD CONSTRAINT - schools: never state or imply school assignment. Forbidden:
  "zoned for", "your kids", "will attend", "assigned to", "feeds into".
  Location phrasing only.

Return ONLY a JSON array of {"index": int, "vo_line": string}.
No preamble, no markdown fences.

Clips:
{{ORDERED_CLIPS}}`;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function renderOrderedClips(clips: GuardedClip[]): string {
  return clips
    .map((c, i) => {
      // The per-clip word budget is arithmetic the model should not have to do
      // in its head — spelling it out is what makes "fits its own clip"
      // checkable rather than aspirational.
      const maxWords = Math.floor(c.duration_s * WORDS_PER_SECOND_FIT);
      return (
        `${i}. ${c.poi_name} | ${c.duration_s.toFixed(1)}s | max ${maxWords} words | ` +
        `vo_line: ${JSON.stringify(c.vo_line)}`
      );
    })
    .join('\n');
}

export function buildVoPrompt(clips: GuardedClip[]): string {
  return VO_PROMPT.replace('{{ORDERED_CLIPS}}', renderOrderedClips(clips));
}

export interface NarrationStats {
  /** Words across every clip that carries a line. */
  words: number;
  /** Summed duration of the clips that carry narration. */
  spokenSeconds: number;
  /** Whole-film pace, words per second of narrated time. 0 when silent. */
  rate: number;
  withinRange: boolean;
  /** Clips whose line cannot be read inside its own duration at 2.4 w/s. */
  overlong: Array<{ sort_order: number; words: number; maxWords: number }>;
}

export function narrationStats(clips: GuardedClip[]): NarrationStats {
  let words = 0;
  let spokenSeconds = 0;
  const overlong: NarrationStats['overlong'] = [];
  for (const c of clips) {
    const n = countWords(c.vo_line);
    if (n === 0) continue;
    words += n;
    spokenSeconds += c.duration_s;
    const maxWords = Math.floor(c.duration_s * WORDS_PER_SECOND_FIT);
    if (n > maxWords) overlong.push({ sort_order: c.sort_order, words: n, maxWords });
  }
  const rate = spokenSeconds > 0 ? words / spokenSeconds : 0;
  return {
    words,
    spokenSeconds,
    rate,
    withinRange: rate >= WORDS_PER_SECOND_MIN && rate <= WORDS_PER_SECOND_MAX,
    overlong,
  };
}

export interface VoViolation {
  code: 'vo_added_to_silent_clip' | 'vo_school_assignment_stripped' | 'vo_rate_out_of_range';
  detail: string;
  sort_order?: number;
}

export interface VoRewrite {
  index: number;
  vo_line: string;
}

/**
 * Apply the rewrites. Pure, and the place every VO Pass rule is enforced —
 * the model's compliance is checked here rather than trusted from the prompt.
 */
export function applyVoRewrites(
  clips: GuardedClip[],
  rewrites: VoRewrite[],
): { clips: GuardedClip[]; violations: VoViolation[] } {
  const violations: VoViolation[] = [];
  const byIndex = new Map(rewrites.map((r) => [r.index, r.vo_line]));
  const out = clips.map((clip, i) => {
    const proposed = byIndex.get(i);
    if (typeof proposed !== 'string') return clip;
    if (clip.vo_line === '' && proposed.trim() !== '') {
      violations.push({
        code: 'vo_added_to_silent_clip',
        sort_order: clip.sort_order,
        detail: 'VO Pass tried to narrate a clip the Curator left silent — kept silent',
      });
      return clip;
    }
    const { text, codes } = stripSchoolAssignment(proposed.trim());
    if (codes.length > 0) {
      violations.push({
        code: 'vo_school_assignment_stripped',
        sort_order: clip.sort_order,
        detail: `VO Pass reintroduced school assignment phrasing (${codes.join(', ')}) — stripped`,
      });
    }
    return { ...clip, vo_line: text };
  });

  const stats = narrationStats(out);
  if (stats.words > 0 && !stats.withinRange) {
    violations.push({
      code: 'vo_rate_out_of_range',
      detail: `${stats.rate.toFixed(2)} words/sec outside [${WORDS_PER_SECOND_MIN}, ${WORDS_PER_SECOND_MAX}]`,
    });
  }
  return { clips: out, violations };
}

export function parseVoResponse(raw: string): VoRewrite[] {
  const unfenced = raw.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('[');
  const end = unfenced.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: VoRewrite[] = [];
  for (const item of parsed) {
    const index = (item as { index?: unknown })?.index;
    const line = (item as { vo_line?: unknown })?.vo_line;
    if (typeof index === 'number' && Number.isInteger(index) && typeof line === 'string') {
      out.push({ index, vo_line: line });
    }
  }
  return out;
}

/**
 * Rewrite the narration. A failed call or an unparseable reply leaves the
 * Curator's draft lines in place: they are already compliant, just choppier,
 * and losing a tour to a polish step would be the wrong trade.
 */
export async function runVoPass(
  clips: GuardedClip[],
): Promise<{ clips: GuardedClip[]; violations: VoViolation[]; ok: boolean; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { clips, violations: [], ok: false, error: 'GEMINI_API_KEY not set' };
  if (clips.every((c) => c.vo_line === '')) return { clips, violations: [], ok: true };

  let raw: string;
  try {
    const res = await fetch(GENERATE_URL(VO_MODEL), {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildVoPrompt(clips) }] }],
        generationConfig: {
          // Generous, because this is a thinking model and its reasoning tokens
          // count against the same budget: at 2048 the whole allowance went to
          // thinking and the reply came back with no text part at all
          // (curator-eval, 2026-08-17).
          maxOutputTokens: 8192,
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      return {
        clips,
        violations: [],
        ok: false,
        error: `vo ${res.status}: ${(await res.text()).slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const candidate = data.candidates?.[0];
    raw = candidate?.content?.parts?.find((p) => p.text)?.text ?? '';
    if (!raw) {
      return {
        clips,
        violations: [],
        ok: false,
        error: `vo returned no text (finishReason=${candidate?.finishReason ?? 'unknown'})`,
      };
    }
  } catch (err) {
    return { clips, violations: [], ok: false, error: (err as Error).message };
  }

  const rewrites = parseVoResponse(raw);
  if (rewrites.length === 0) {
    return { clips, violations: [], ok: false, error: 'no usable rewrites in reply' };
  }
  const applied = applyVoRewrites(clips, rewrites);
  return { ...applied, ok: true };
}

/** Belt and braces: nothing leaves the pipeline carrying assignment phrasing. */
export function assertNoSchoolAssignment(clips: GuardedClip[]): void {
  for (const c of clips) {
    const codes = findSchoolAssignment(c.vo_line);
    if (codes.length > 0) {
      throw new Error(
        `school assignment phrasing survived into clip ${c.sort_order}: ${codes.join(', ')}`,
      );
    }
  }
}
