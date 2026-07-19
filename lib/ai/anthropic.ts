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
 * replaces the Phase 8.4 fixed Facebook+Instagram+Email shape.
 * Now driven by the caller-supplied `platforms` and `languages` arrays so
 * the UI can offer a checkbox grid. Output is a 2-D map:
 *   { [platform]: { [language]: string } }
 *
 * Platforms supported (US homebuyer market):
 *   facebook, instagram, email, tiktok, x, linkedin, threads
 *
 * Languages supported (top US homebuyer languages by buyer-side share):
 *   en, es, vi, ko
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
  | 'threads';

export type SocialLanguage = 'en' | 'es' | 'vi' | 'ko';

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  'facebook',
  'instagram',
  'email',
  'tiktok',
  'x',
  'linkedin',
  'threads',
] as const;

export const SOCIAL_LANGUAGES: readonly SocialLanguage[] = ['en', 'es', 'vi', 'ko'] as const;

const PLATFORM_BRIEF: Record<SocialPlatform, string> = {
  facebook:
    'Facebook post: 2-3 short paragraphs, professional but warm, end with the listing URL on its own line.',
  instagram:
    'Instagram caption: 1 short paragraph + 4-6 relevant hashtags, casual tone, no URL (Instagram bio link convention).',
  email:
    'Buyer-database email body: no subject, no "Dear" greeting — open with a hook. 4-6 short paragraphs, 2-3 concrete listing details, invitation to schedule a showing, listing URL on its own line.',
  tiktok:
    'TikTok caption: 1-2 sentences max, hook-first, 3-5 hashtags. No URL — TikTok strips links from captions.',
  x: 'X (Twitter) post: under 270 characters total, one strong hook line, listing URL at end, 1-2 hashtags max.',
  linkedin:
    'LinkedIn post: 2-3 paragraphs, agent-professional voice (third-person about the property is fine), ends with listing URL. No hashtag spam — 2-3 relevant tags max.',
  threads:
    'Threads post: 1-2 short paragraphs, conversational, listing URL at end. No hashtag stacking.',
};

const LANGUAGE_LABEL: Record<SocialLanguage, string> = {
  en: 'English',
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
  /**
   * Previous user-edited draft for a (platform, language) cell. When present
   * the model treats it as the seed to refine — preserve the agent's voice,
   * tighten/extend per the platform brief, don't throw it away. Only the
   * cells the agent actually edited should be passed; everything else gets
   * generated fresh. Map shape mirrors SocialCopyOutput.
   */
  previousDrafts?: Partial<Record<SocialPlatform, Partial<Record<SocialLanguage, string>>>>;
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
  const platforms = input.platforms.filter((p) => SOCIAL_PLATFORMS.includes(p));
  const languages = input.languages.filter((l) => SOCIAL_LANGUAGES.includes(l));
  if (platforms.length === 0 || languages.length === 0) {
    throw new Error('generateSocialCopy: need at least one platform and one language');
  }

  const platformBrief = platforms.map((p) => `- ${p}: ${PLATFORM_BRIEF[p]}`).join('\n');
  const languageBrief = languages.map((l) => `- ${l}: ${LANGUAGE_LABEL[l]}`).join('\n');

  const shapeExample =
    '{ ' +
    platforms
      .map((p) => `"${p}": { ${languages.map((l) => `"${l}": string`).join(', ')} }`)
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
  if (input.highlights && input.highlights.length > 0) userPayload.highlights = input.highlights;
  if (input.description && input.description.length > 0)
    userPayload.listing_description = input.description;
  if (input.photoAltText && input.photoAltText.length > 0)
    userPayload.photo_captions = input.photoAltText;
  if (input.videoTitles && input.videoTitles.length > 0)
    userPayload.video_titles = input.videoTitles;

  // Forward only the cells that match the requested platforms/languages,
  // and only non-empty bodies. Cap each at 8 KB defensively (matches
  // the saved_social_drafts column constraint).
  if (input.previousDrafts) {
    const seeds: Record<string, Record<string, string>> = {};
    for (const p of platforms) {
      const cell = input.previousDrafts[p];
      if (!cell) continue;
      const langMap: Record<string, string> = {};
      for (const l of languages) {
        const v = cell[l];
        if (typeof v === 'string' && v.trim().length > 0) {
          langMap[l] = v.length > 8192 ? v.slice(0, 8192) : v;
        }
      }
      if (Object.keys(langMap).length > 0) seeds[p] = langMap;
    }
    if (Object.keys(seeds).length > 0) {
      userPayload.previous_drafts = seeds;
      userPayload.previous_drafts_note =
        "For any (platform, language) present in previous_drafts, treat that string as the agent-edited seed. Preserve the agent's voice, phrasing, and any specific facts they added; refine only to better match the platform brief and the requested language. Do not regress edits back to a generic listing summary.";
    }
  }

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

// ─── Community marketing copy ─────────────────────────────────────
//
// . Communities are a different shape from
// listings — there is no platform axis (a community is browsed on
// percho.co, not posted to TikTok). Agents want one general-
// purpose marketing blurb per language they speak, suitable for
// pasting into a buyer email, a WeChat message, or a printed
// handout. Hence: language-only, no platform brief.
//
// The video-evidence axis is what makes this generation honest. The
// agent has filmed 0..N category videos for the community (see
// `references/community-video-categories.md` — 12 categories, two
// buckets). The prompt receives ONLY those category labels + blurbs
// the agent actually filmed and is told, in hard terms, not to
// fabricate categories the agent has not covered. This keeps
// marketing claims grounded in evidence the buyer can verify by
// scrolling the public `/c/<slug>` page.

export type CommunityMarketingLanguage = SocialLanguage;
export const COMMUNITY_MARKETING_LANGUAGES = SOCIAL_LANGUAGES;

export interface CommunityMarketingVideo {
  /** Stable category id (matches DB enum + COMMUNITY_VIDEO_CATEGORIES). */
  category: string;
  /** UI label for the category, e.g. "Walk the Block". */
  categoryLabel: string;
  /** One-liner for the category, used as evidence flavor. */
  categoryBlurb: string;
  /** Optional agent-supplied title for this specific clip. */
  title?: string;
}

export interface CommunityMarketingContext {
  communityUrl: string;
  name: string;
  city?: string;
  state?: string;
  /** Anything the agent typed in the community detail form. */
  description?: string;
  /** Filmed category videos, in order. Empty = generate a generic
   *  blurb that does not promise category content. */
  videos?: CommunityMarketingVideo[];
  /** Schools associated with the community, name only. */
  schools?: string[];
  /** Points of interest, name only. */
  pois?: string[];
  /** Agent-edited prior body per language; the model treats these as
   *  the seed to refine instead of regenerating from scratch. */
  previousDrafts?: Partial<Record<CommunityMarketingLanguage, string>>;
}

export type CommunityMarketingOutput = Partial<Record<CommunityMarketingLanguage, string>>;

// Single source of truth for the category vocabulary the model is
// allowed to reference. We keep it inline (rather than re-importing
// from `lib/zod/community-video-categories.ts`) so that:
//   - this file stays usable in edge runtime / non-zod contexts;
//   - the prompt vocabulary is auditable in one place next to the
//     generation logic.
// If the canonical category list changes, update both sides.
const COMMUNITY_CATEGORY_VOCABULARY: ReadonlyArray<{
  bucket: 'a' | 'b';
  id: string;
  label: string;
  blurb: string;
}> = [
  // Bucket A — Only on Percho
  {
    bucket: 'a',
    id: 'walk_the_block',
    label: 'Walk the Block',
    blurb: 'A real, unedited walk through the streets',
  },
  { bucket: 'a', id: 'listen_here', label: 'Listen Here', blurb: 'What this place sounds like' },
  {
    bucket: 'a',
    id: 'morning_rush',
    label: 'Morning Rush',
    blurb: 'The commute, on a real weekday',
  },
  { bucket: 'a', id: 'after_dark', label: 'After Dark', blurb: 'How the area feels at night' },
  {
    bucket: 'a',
    id: 'hidden_spot',
    label: 'Hidden Spot',
    blurb: 'Locals-only places worth knowing',
  },
  {
    bucket: 'a',
    id: 'local_pick',
    label: 'Local Pick',
    blurb: 'A non-chain place residents actually go',
  },
  // Bucket B — Real look at the data
  {
    bucket: 'b',
    id: 'school_run',
    label: 'School Run',
    blurb: 'The drive to the assigned schools',
  },
  {
    bucket: 'b',
    id: 'daily_errands',
    label: 'Daily Errands',
    blurb: 'Grocery, pharmacy, the boring real stuff',
  },
  { bucket: 'b', id: 'the_park', label: 'The Park', blurb: 'The neighborhood park, on the ground' },
  { bucket: 'b', id: 'eating_out', label: 'Eating Out', blurb: 'Where you actually go for dinner' },
  { bucket: 'b', id: 'get_active', label: 'Get Active', blurb: 'Trails, gyms, courts, fields' },
  {
    bucket: 'b',
    id: 'transit_reality',
    label: 'Transit Reality',
    blurb: 'Bus stop, train, ride share — what actually works',
  },
];

function communityMarketingSystemPrompt(languages: SocialLanguage[]): string {
  const languageBrief = languages.map((l) => `- ${l}: ${LANGUAGE_LABEL[l]}`).join('\n');
  const bucketA = COMMUNITY_CATEGORY_VOCABULARY.filter((c) => c.bucket === 'a')
    .map((c) => `  - ${c.label} — ${c.blurb}`)
    .join('\n');
  const bucketB = COMMUNITY_CATEGORY_VOCABULARY.filter((c) => c.bucket === 'b')
    .map((c) => `  - ${c.label} — ${c.blurb}`)
    .join('\n');
  const shape = `{ ${languages.map((l) => `"${l}": string`).join(', ')} }`;
  return [
    'You are writing community-level marketing copy for a US neighborhood,',
    'voiced by a knowledgeable local real estate agent. Tone: warm but factual,',
    'a guide who has walked the streets — not a brochure. The audience is',
    'multilingual US homebuyers researching neighborhoods.',
    '',
    'Each language must read fully native — translate meaning, never transliterate;',
    'use idiomatic phrasing for that locale. Do not hedge ("seems", "may be") —',
    'state what the agent has shown evidence for, and skip claims you cannot ground.',
    '',
    'Languages requested:',
    languageBrief,
    '',
    'Length: 150–250 words per language. Plain paragraphs (2–3), no markdown,',
    'no headings, no hashtags, no emoji.',
    '',
    'CTA at the end: a short invitation along the lines of "explore homes in this',
    'neighborhood" plus the community URL on its own line. Adapt phrasing per',
    'language but keep it warm, not pushy.',
    '',
    'EVIDENCE GROUNDING — strict:',
    'The agent has filmed videos in some of the categories below. The user',
    'message includes the exact list of categories filmed (`videos[].category`).',
    '- You MAY reference the categories present in `videos`.',
    '- You MUST NOT fabricate or hint at categories the agent has not filmed.',
    '  If `videos` is empty or missing a bucket, the copy must not promise that',
    '  evidence exists. Speak generally about the neighborhood instead.',
    '- Do not invent specific facts (school ratings, crime stats, commute times).',
    '  Use only what the user payload provides.',
    '',
    'CATEGORY VOCABULARY (Bucket A — only on Percho):',
    bucketA,
    'CATEGORY VOCABULARY (Bucket B — real look at the data):',
    bucketB,
    '',
    'FAIR HOUSING — strict:',
    'Do not steer by race, color, religion, sex, disability, familial status,',
    'national origin, sexual orientation, gender identity, or source of income.',
    'Talk about places, amenities, walkability, transit, schools as institutions —',
    'not the people who live there. No "good area" / "safe neighborhood" /',
    '"family-friendly" / "diverse community" framing. Describe what the',
    'neighborhood IS, not who SHOULD live there.',
    '',
    'OUTPUT — strict JSON, nothing else (no markdown, no fences, no commentary).',
    `Shape: ${shape}. Each value is the full marketing body for that language,`,
    'including the closing CTA and the URL on its own line.',
  ].join('\n');
}

export async function generateCommunityMarketing(
  input: CommunityMarketingContext & {
    languages: CommunityMarketingLanguage[];
  },
): Promise<CommunityMarketingOutput> {
  const languages = input.languages.filter((l) => SOCIAL_LANGUAGES.includes(l));
  if (languages.length === 0) {
    throw new Error('generateCommunityMarketing: need at least one language');
  }

  const system = communityMarketingSystemPrompt(languages);

  // Whitelist categories sent to the model. The model is told it MAY
  // reference these and MUST NOT invent others — defense in depth.
  const allowedIds = new Set(COMMUNITY_CATEGORY_VOCABULARY.map((c) => c.id));
  const videos = (input.videos ?? [])
    .filter((v) => allowedIds.has(v.category))
    .slice(0, 60) // cap on extreme cases
    .map((v) => ({
      category: v.category,
      categoryLabel: v.categoryLabel,
      categoryBlurb: v.categoryBlurb,
      ...(v.title ? { title: v.title.slice(0, 200) } : {}),
    }));

  const userPayload: Record<string, unknown> = {
    communityUrl: input.communityUrl,
    name: input.name,
    videos,
  };
  if (input.city) userPayload.city = input.city;
  if (input.state) userPayload.state = input.state;
  if (input.description && input.description.trim().length > 0) {
    userPayload.description = input.description.slice(0, 4000);
  }
  if (input.schools && input.schools.length > 0) {
    userPayload.schools = input.schools.slice(0, 20);
  }
  if (input.pois && input.pois.length > 0) {
    userPayload.points_of_interest = input.pois.slice(0, 30);
  }

  if (input.previousDrafts) {
    const seeds: Record<string, string> = {};
    for (const l of languages) {
      const v = input.previousDrafts[l];
      if (typeof v === 'string' && v.trim().length > 0) {
        seeds[l] = v.length > 8192 ? v.slice(0, 8192) : v;
      }
    }
    if (Object.keys(seeds).length > 0) {
      userPayload.previous_drafts = seeds;
      userPayload.previous_drafts_note =
        "For any language present in previous_drafts, treat that string as the agent-edited seed. Preserve the agent's voice, phrasing, and any specific facts they added; refine only to better fit the brief above and the requested language. Do not regress edits back to a generic neighborhood summary.";
    }
  }

  // ~280 tokens per language body + overhead for the long system.
  const maxTokens = Math.min(8000, 1200 + 450 * languages.length);

  const text = await callMessages({
    system,
    messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
    maxTokens,
  });

  const parsed = safeJsonParse(text, 'community-marketing') as Record<string, unknown>;
  const out: CommunityMarketingOutput = {};
  for (const l of languages) {
    const v = parsed[l];
    if (typeof v === 'string' && v.trim().length > 0) {
      out[l] = v;
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error('Anthropic response missing all requested languages');
  }
  return out;
}
