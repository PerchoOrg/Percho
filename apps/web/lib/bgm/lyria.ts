/**
 * Background music, generated.
 *
 * Owner 2026-08-20: "we need to have a way to use ai generated background
 * music… good background music with different types for different vibe,
 * license is fine, ai generation, review and approve/reject process."
 *
 * WHY LYRIA and not Suno/Udio, which sound better: Suno and Udio have no public
 * API, and their pre-2026 training catalogues were the subject of the label
 * suits. This music goes into commercial real-estate marketing, so provenance
 * matters more than the last increment of quality. Lyria trained on licensed
 * data, and — decisively for us — it is the same `generativelanguage` host and
 * the same GEMINI_API_KEY already used for research, tagging, TTS and photo
 * outpainting. No new vendor, no new billing relationship, so CLAUDE.md §8
 * ("ask before adding a new third-party service") is not even engaged.
 *
 * Two things measured on the first live call, both of which shape the code
 * below: generation takes ~30s, and the safety filter rejects prompts for
 * "unspecified policy reason" without being reproducible — the same prompt
 * minus its timestamp block was blocked, the original passed. So this retries,
 * and the caller must tolerate partial success.
 *
 * Output is 44.1kHz stereo MP3 carrying an inaudible SynthID watermark.
 */

import type { BgmVibe } from './storage';

export const LYRIA_MODEL = process.env.GEMINI_MUSIC_MODEL ?? 'lyria-3-pro-preview';
const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** Roughly $0.08 a track at the published rate — shown in the admin before generating. */
export const LYRIA_COST_USD = 0.08;

/**
 * The half of the prompt that never changes.
 *
 * Every clause here is a failure this library has actually had. "No vocals"
 * because one imported track had a singer in it. The whole no-swells paragraph
 * because `13-take-a-chance` — the loudest track in the bucket and among the
 * most dynamic — was picked at random for the first narrated Aberdeen cut and
 * the owner heard music that was "too big". A bed that surges fights the voice,
 * and the ducking compressor rides the voice, not the swell.
 */
const BED_RULES = `Instrumental only, no vocals, no singing, no spoken word, no choir, no vocal samples.
This is BACKGROUND music for a short property video. A voice speaks over it for most of its length.
Keep the energy constant from beginning to end: no dramatic swells, no build-ups, no drops,
no key changes, no big finish. Nothing should ever pull attention away from a speaker.
Leave the mid-range uncluttered so a voice sits above it.`;

interface VibePreset {
  /** What this vibe sounds like. Joined with BED_RULES. */
  brief: string;
  /** Filename stem for generated tracks, before the date and id. */
  slug: string;
}

export const LYRIA_PRESETS: Record<BgmVibe, VibePreset> = {
  'warm-acoustic': {
    slug: 'warm',
    brief: `Warm acoustic. Fingerpicked acoustic guitar, soft ukulele, light hand percussion,
gentle upright bass. Major key, unhurried, around 90 BPM. Friendly and settled — the feeling of
a familiar neighbourhood on a weekend morning. Never triumphant, never sentimental.`,
  },
  'modern-corporate': {
    slug: 'modern',
    brief: `Clean and modern. Simple piano figure over soft synth pads, light muted percussion,
occasional plucked synth. Major key, around 100 BPM. Optimistic but restrained and professional.
No orchestral hits, no cinematic risers, no motivational-video clichés.`,
  },
  'luxury-ambient': {
    slug: 'luxury',
    brief: `Spacious and quiet. Sparse felt piano, soft sustained strings, generous reverb, very
little percussion. Slow, around 70 BPM. Calm, expensive, unhurried. Restraint is the point — long
notes and space rather than melody. Not sad, not somber.`,
  },
  'chill-electronic': {
    slug: 'chill',
    brief: `Organic electronic. Mellow analog-sounding synths, soft filtered beat, warm sub bass,
light textural noise. Around 95 BPM. Relaxed and urban. Not lo-fi jazz, no vinyl crackle,
no trap hats, no EDM.`,
  },
};

/** Seconds to `m:ss`. Anything past 0:59 is a different minute, not "0:82". */
function mmss(total: number): string {
  return `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}`;
}

export function buildLyriaPrompt(vibe: BgmVibe, seconds: number, extra?: string): string {
  const preset = LYRIA_PRESETS[vibe];
  // A timestamped structure block was present on the call that succeeded and
  // absent on the one the filter blocked. That is one observation, not a
  // finding — but it also genuinely helps, because it is what makes the track
  // open and resolve rather than fade mid-phrase.
  const outroAt = Math.max(16, seconds - 8);
  return `${BED_RULES}

${preset.brief}

Total length about ${seconds} seconds.
[0:00 - 0:08] Intro: sparse, one or two instruments
[0:08 - ${mmss(outroAt)}] Body: full but restrained, constant energy
[${mmss(outroAt)} - ${mmss(seconds)}] Outro: settle and resolve gently${
    extra?.trim() ? `\n\n${extra.trim()}` : ''
  }`;
}

export interface LyriaTrack {
  bytes: Buffer;
  mimeType: string;
}

/**
 * One track. Retries the blocked-by-policy case, which is not reproducible.
 *
 * Throws on give-up; the route reports per-track outcomes so a batch of four
 * that yields three is still three tracks the owner can review.
 */
export async function generateLyriaTrack(
  prompt: string,
  { attempts = 3, signal }: { attempts?: number; signal?: AbortSignal } = {},
): Promise<LyriaTrack> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(INTERACTIONS_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: LYRIA_MODEL,
        input: prompt,
        response_format: { type: 'audio' },
      }),
      signal,
    });

    const json = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
      steps?: Array<{ content?: Array<{ type?: string; data?: string; mime_type?: string }> }>;
    } | null;

    if (!res.ok || json?.error) {
      lastError = json?.error?.message ?? `HTTP ${res.status}`;
      // Anything other than the flaky content filter is not worth retrying.
      if (json?.error?.code !== 'content_blocked' && res.status < 500) break;
      continue;
    }

    const audio = (json?.steps ?? [])
      .flatMap((s) => s.content ?? [])
      .find((c) => c.type === 'audio' && c.data);
    if (audio?.data) {
      return {
        bytes: Buffer.from(audio.data, 'base64'),
        mimeType: audio.mime_type ?? 'audio/mpeg',
      };
    }
    lastError = 'response carried no audio';
  }
  throw new Error(lastError);
}

/** `ai-warm-20260820-4f2a.mp3` — sorts by date, says where it came from. */
export function lyriaFilename(vibe: BgmVibe, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const id = Math.random().toString(16).slice(2, 6);
  return `ai-${LYRIA_PRESETS[vibe].slug}-${stamp}-${id}.mp3`;
}
