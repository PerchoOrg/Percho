/**
 * Anthropic API wrapper for V1 listing copy generation.
 *
 * V2 seam: when the LLM workload grows (agent workflows, video understanding,
 * eval harness), extract this module into a separate Python service. The
 * callers in this app only depend on the function signatures here, so the
 * swap is local.
 *
 * Cost guards:
 *   - Pinned to the model in ANTHROPIC_MODEL env (default: claude-sonnet-4-5).
 *     Never call opus from V1 code paths.
 *   - max_tokens cap on every call.
 *   - All calls run async (never on the user's request path) — fire from a
 *     button click or a background job, return job ids if needed.
 */

const API_BASE = 'https://api.anthropic.com/v1/messages';

function model(): string {
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
}

function apiKey(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not set');
  return k;
}

type Message = { role: 'user' | 'assistant'; content: string };

async function callMessages(opts: {
  system?: string;
  messages: Message[];
  maxTokens: number;
}): Promise<string> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model(),
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('Anthropic API returned no text content');
  return text;
}

/**
 * Extract the first complete JSON object from a model response.
 *
 * Robust to: ```json fences (with or without closing fence), pre/post chatter
 * ("Here's the JSON: {...} hope this helps"), trailing whitespace, etc.
 * Scans for the first '{' and walks to the matching '}', respecting strings
 * and escapes. Returns null if no balanced object is found.
 */
export function extractJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function safeJsonParse(raw: string, label: string): unknown {
  const extracted = extractJsonObject(raw);
  const candidate = extracted ?? raw.trim();
  try {
    return JSON.parse(candidate);
  } catch (err) {
    // Surface the first ~500 chars of the raw response so we can see why
    // the model went off-format. Not PII — just listing copy.
    console.error(`[anthropic:${label}] JSON.parse failed; raw=`, raw.slice(0, 500));
    throw err;
  }
}

/**
 * Generate a 3-paragraph English description for a listing.
 *
 * @returns array of 3 paragraphs (no markdown, no headings).
 */
export async function generateListingCopy(input: {
  address: string;
  neighborhood?: string;
  city: string;
  state: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  style?: string;
}): Promise<string[]> {
  const text = await callMessages({
    system:
      'You write short, vivid US real estate listing descriptions. Three paragraphs, ' +
      '2-3 sentences each, plain prose, no markdown, no headings, no emojis. Output ' +
      'as a JSON array of three strings and nothing else.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify(input),
      },
    ],
    maxTokens: 1000,
  });

  const parsed = safeJsonParse(text, 'listing-copy') as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    !parsed.every((p) => typeof p === 'string')
  ) {
    throw new Error('Anthropic response was not a 3-string array');
  }
  return parsed as string[];
}

/**
 * Social copy — multi-platform, multi-language.
 *
 * Phase 48: replaces the Phase 8.4 fixed Facebook+Instagram+Email shape.
 * Now driven by the caller-supplied `platforms` and `languages` arrays so
 * the UI can offer a checkbox grid. Output is a 2-D map:
 *   { [platform]: { [language]: string } }
 *
 * Platforms supported (US homebuyer market — bilingual buyers are real):
 *   facebook, instagram, email, tiktok, x, linkedin, threads, rednote, wechat
 *
 * Languages supported (top US homebuyer languages by buyer-side share):
 *   en, zh, es, vi, ko
 *
 * Light grounding: takes the listing's full description paragraphs, photo
 * alt-text, and video titles so the model has actual content to reference
 * instead of hallucinating from address+price alone. Pure text — no vision
 * tokens. Cost is ~1.3× the old call for typical listings.
 */

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'email'
  | 'tiktok'
  | 'x'
  | 'linkedin'
  | 'threads'
  | 'rednote'
  | 'wechat';

export type SocialLanguage = 'en' | 'zh' | 'es' | 'vi' | 'ko';

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  'facebook',
  'instagram',
  'email',
  'tiktok',
  'x',
  'linkedin',
  'threads',
  'rednote',
  'wechat',
] as const;

export const SOCIAL_LANGUAGES: readonly SocialLanguage[] = [
  'en',
  'zh',
  'es',
  'vi',
  'ko',
] as const;

const PLATFORM_BRIEF: Record<SocialPlatform, string> = {
  facebook:
    'Facebook post: 2-3 short paragraphs, professional but warm, end with the listing URL on its own line.',
  instagram:
    'Instagram caption: 1 short paragraph + 4-6 relevant hashtags, casual tone, no URL (Instagram bio link convention).',
  email:
    'Buyer-database email body: no subject, no "Dear" greeting — open with a hook. 4-6 short paragraphs, 2-3 concrete listing details, invitation to schedule a showing, listing URL on its own line.',
  tiktok:
    'TikTok caption: 1-2 sentences max, hook-first, 3-5 hashtags. No URL — TikTok strips links from captions.',
  x:
    'X (Twitter) post: under 270 characters total, one strong hook line, listing URL at end, 1-2 hashtags max.',
  linkedin:
    'LinkedIn post: 2-3 paragraphs, agent-professional voice (third-person about the property is fine), ends with listing URL. No hashtag spam — 2-3 relevant tags max.',
  threads:
    'Threads post: 1-2 short paragraphs, conversational, listing URL at end. No hashtag stacking.',
  rednote:
    'Rednote (小红书 / Xiaohongshu) note: lifestyle/aspirational angle, 3-5 short paragraphs with line breaks, end with 5-8 hashtags using # prefix. Listing URL on its own line at the end.',
  wechat:
    'WeChat Moments (微信朋友圈) post: 2-3 short paragraphs, warm and personal (朋友圈 is a friends-only feed, not broadcast), listing URL on its own line. No hashtags — they are not used on Moments.',
};

const LANGUAGE_LABEL: Record<SocialLanguage, string> = {
  en: 'English',
  zh: 'Simplified Chinese (简体中文)',
  es: 'Spanish (Español, neutral US Latin American)',
  vi: 'Vietnamese (Tiếng Việt)',
  ko: 'Korean (한국어)',
};

export interface SocialCopyContext {
  listingUrl: string;
  address: string;
  city: string;
  state: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  /** Free-form selling points the agent typed in — capped upstream. */
  highlights?: string[];
  /** listings.description paragraphs. Trimmed upstream. */
  description?: string[];
  /** listing_photos.alt_text values, in sort_order. Empty strings dropped upstream. */
  photoAltText?: string[];
  /** listing_videos.title values, in sort_order. Empty strings dropped upstream. */
  videoTitles?: string[];
}

export type SocialCopyOutput = Partial<
  Record<SocialPlatform, Partial<Record<SocialLanguage, string>>>
>;

export async function generateSocialCopy(
  input: SocialCopyContext & {
    platforms: SocialPlatform[];
    languages: SocialLanguage[];
  },
): Promise<SocialCopyOutput> {
  const platforms = input.platforms.filter((p) =>
    SOCIAL_PLATFORMS.includes(p),
  );
  const languages = input.languages.filter((l) =>
    SOCIAL_LANGUAGES.includes(l),
  );
  if (platforms.length === 0 || languages.length === 0) {
    throw new Error('generateSocialCopy: need at least one platform and one language');
  }

  const platformBrief = platforms
    .map((p) => `- ${p}: ${PLATFORM_BRIEF[p]}`)
    .join('\n');
  const languageBrief = languages
    .map((l) => `- ${l}: ${LANGUAGE_LABEL[l]}`)
    .join('\n');

  const shapeExample =
    '{ ' +
    platforms
      .map(
        (p) =>
          `"${p}": { ${languages.map((l) => `"${l}": string`).join(', ')} }`,
      )
      .join(', ') +
    ' }';

  const system =
    'You write marketing copy for US real estate listings. The agent serves a ' +
    'multilingual US homebuyer audience (English plus the buyer-side languages ' +
    'requested below). Treat each language as fully native — translate the ' +
    'meaning, do not transliterate, and use idiomatic phrasing for that locale. ' +
    'Match the platform conventions exactly:\n' +
    platformBrief +
    '\n\nLanguages requested:\n' +
    languageBrief +
    '\n\nOutput strict JSON and nothing else (no markdown, no code fences, no commentary). ' +
    `Shape: ${shapeExample}. ` +
    'Each string is the post body for that (platform, language). Keep posts concise — total response under ' +
    `${Math.min(2400, 220 * platforms.length * languages.length)} words.`;

  // Compact context for the model — only fields with content.
  const userPayload: Record<string, unknown> = {
    listingUrl: input.listingUrl,
    address: input.address,
    city: input.city,
    state: input.state,
  };
  if (input.price != null) userPayload.price = input.price;
  if (input.beds != null) userPayload.beds = input.beds;
  if (input.baths != null) userPayload.baths = input.baths;
  if (input.sqft != null) userPayload.sqft = input.sqft;
  if (input.highlights && input.highlights.length > 0)
    userPayload.highlights = input.highlights;
  if (input.description && input.description.length > 0)
    userPayload.listing_description = input.description;
  if (input.photoAltText && input.photoAltText.length > 0)
    userPayload.photo_captions = input.photoAltText;
  if (input.videoTitles && input.videoTitles.length > 0)
    userPayload.video_titles = input.videoTitles;

  // Token budget: ~250 tokens per (platform, language) cell + system overhead.
  const cells = platforms.length * languages.length;
  const maxTokens = Math.min(8000, 800 + 350 * cells);

  const text = await callMessages({
    system,
    messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
    maxTokens,
  });

  const parsed = safeJsonParse(text, 'social-copy') as Record<string, unknown>;
  const out: SocialCopyOutput = {};
  for (const p of platforms) {
    const cell = parsed[p];
    if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
      const langMap: Partial<Record<SocialLanguage, string>> = {};
      for (const l of languages) {
        const v = (cell as Record<string, unknown>)[l];
        if (typeof v === 'string' && v.trim().length > 0) {
          langMap[l] = v;
        }
      }
      if (Object.keys(langMap).length > 0) out[p] = langMap;
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error('Anthropic response missing all requested platform/language strings');
  }
  return out;
}
