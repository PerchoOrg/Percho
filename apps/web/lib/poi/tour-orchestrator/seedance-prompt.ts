/**
 * Seedance prompt construction — TEMPLATE, not an LLM call.
 *
 * The mandatory clauses have to survive verbatim. Handing them to a model to
 * "work into" a prompt yields a sentence that means roughly the same thing
 * with an unknown constraint strength, and there is no way to test for that.
 * So the prompt is four concatenated parts and the clauses are string
 * constants:
 *
 *   scene       what is in the frame, POI proper nouns removed
 *   motion      the real motion, expanded into a sentence
 *   camera      looked up from the clip's move
 *   constraints injected by the Guard, verbatim
 */

import type { DominantSubject } from './types';

/** Mandatory clauses — verbatim, never paraphrased. */
export const CLAUSE_NO_PEOPLE = 'No people appear in the frame.';
export const CLAUSE_KEEP_PEOPLE =
  'Existing people remain in the background; do not change their appearance.';
export const CLAUSE_RIGID_GEOMETRY =
  'Straight lines and repeating structures stay straight and evenly spaced.';
export const CLAUSE_SIGNAGE = 'Storefront signage stays unchanged.';

export const MANDATORY_CLAUSES = [
  CLAUSE_NO_PEOPLE,
  CLAUSE_KEEP_PEOPLE,
  CLAUSE_RIGID_GEOMETRY,
  CLAUSE_SIGNAGE,
] as const;

/**
 * Banned in any Seedance prompt. In the training distribution these words are
 * bound tightly to a dolly-in, and they are a direct cause of "every clip
 * zooms in". Asserting beats remembering.
 */
export const BANNED_WORDS = ['fast', 'cinematic', 'epic', 'dramatic', 'dynamic'] as const;

const BANNED_RE = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\w*\\b`, 'gi');

/** Camera clause per move — the Scheduler picks the move, this names it. */
export const SEEDANCE_CAMERA: Record<string, string> = {
  camera_fixed: 'The camera holds a completely locked, static frame with no movement.',
  drift_in: 'Camera drifts forward very slowly and smoothly.',
  pull_back: 'Camera pulls back slowly and smoothly to reveal more of the scene.',
  tilt_up: 'Camera tilts up slowly and steadily, holding a level horizon.',
  handheld_in: 'Camera drifts forward very slowly with a subtle handheld feel.',
};

/** Fixed provider params. Audio is off: the timeline belongs to the tour. */
export const SEEDANCE_RESOLUTION = '720p';
export const SEEDANCE_GENERATE_AUDIO = false;

/** Stable per-photo seed so a re-render of a clip is the same clip. */
export function seedanceSeed(photoId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < photoId.length; i++) {
    h ^= photoId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 2_147_483_647;
}

/**
 * Turn the tagger's description into a generic scene line: the model is asked
 * to animate what is already in the frame, and a proper noun invites it to
 * render a brand instead. Residual proper nouns are tolerated — the clause set,
 * not the scene line, is what stops invention.
 */
export function genericScene(description: string, poiName: string): string {
  let out = description.trim();
  const name = poiName.trim();
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`${escaped}(['’]s)?`, 'gi'), '');
  }
  out = out
    .replace(BANNED_RE, '') // tagger prose occasionally carries a banned word
    .replace(/\s+([,.])/g, '$1')
    .replace(/([,.])\1+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.'’]+/, '')
    // Removing the name leaves danglers: "part of the.", "seating at,".
    .replace(
      /[,\s]*\b(?:part of|at|in|of|inside|near|on|by)\b(?:\s+(?:the|a|an))?\s*(?=[,.]|$)/gi,
      '',
    )
    .replace(/\s+([,.])/g, '$1')
    .replace(/[\s,]+$/, '')
    .trim();
  if (!out) return 'The scene in the frame.';
  const first = out.charAt(0).toUpperCase() + out.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

export interface SeedancePromptInput {
  photoId: string;
  poiName: string;
  description: string;
  motionHint: string;
  dominantSubject: DominantSubject;
  move: string;
  /** Verbatim clauses the Guard decided apply to this clip. */
  constraints: readonly string[];
}

export class SeedancePromptError extends Error {}

/**
 * Assemble and validate. Throws rather than rendering: a Seedance clip missing
 * a mandatory clause is a compliance defect, and $0.05 of provider spend is
 * cheaper to lose than a clip nobody can explain.
 */
export function buildSeedancePrompt(input: SeedancePromptInput): string {
  const camera = SEEDANCE_CAMERA[input.move];
  if (!camera) {
    throw new SeedancePromptError(`no camera clause for move "${input.move}"`);
  }
  const hint = input.motionHint.trim().replace(/[.]+$/, '');
  const motion = hint
    ? `The only movement is ${hint}; everything else stays completely still.`
    : 'Nothing in the frame moves except natural ambient light.';

  const constraints = [...input.constraints];
  for (const clause of constraints) {
    if (!(MANDATORY_CLAUSES as readonly string[]).includes(clause)) {
      throw new SeedancePromptError(`unknown constraint clause: ${clause}`);
    }
  }
  if (!constraints.includes(CLAUSE_SIGNAGE)) {
    // Every Google Places frame of a commercial area carries incidental
    // storefront text, so this one is not conditional.
    throw new SeedancePromptError('missing mandatory clause: signage');
  }
  const peopleClauses = constraints.filter(
    (c) => c === CLAUSE_NO_PEOPLE || c === CLAUSE_KEEP_PEOPLE,
  );
  if (peopleClauses.length !== 1) {
    throw new SeedancePromptError(
      `expected exactly one people clause, got ${peopleClauses.length}`,
    );
  }

  const prompt = [genericScene(input.description, input.poiName), motion, camera, ...constraints]
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const banned = prompt.match(BANNED_RE);
  if (banned) {
    throw new SeedancePromptError(`banned word in prompt: ${banned.join(', ')}`);
  }
  return prompt;
}
