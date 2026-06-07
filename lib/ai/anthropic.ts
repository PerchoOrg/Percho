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

  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 3 || !parsed.every((p) => typeof p === 'string')) {
    throw new Error('Anthropic response was not a 3-string array');
  }
  return parsed as string[];
}

/** Social copy — Facebook + Instagram (no Xiaohongshu, no zh). */
export async function generateSocialCopy(input: {
  listingUrl: string;
  address: string;
  city: string;
  state: string;
  price?: number;
  beds?: number;
  baths?: number;
  highlights?: string[];
}): Promise<{ facebook: string; instagram: string }> {
  const text = await callMessages({
    system:
      'You write social media copy for real estate listings, US market, English. ' +
      'Output strict JSON: { "facebook": string, "instagram": string }. ' +
      'Facebook: 2-3 paragraphs, professional but warm, ends with the listing URL. ' +
      'Instagram: 1 short paragraph + 4-6 hashtags, casual tone.',
    messages: [{ role: 'user', content: JSON.stringify(input) }],
    maxTokens: 800,
  });
  const parsed = JSON.parse(text) as { facebook?: unknown; instagram?: unknown };
  if (typeof parsed.facebook !== 'string' || typeof parsed.instagram !== 'string') {
    throw new Error('Anthropic response missing facebook/instagram strings');
  }
  return { facebook: parsed.facebook, instagram: parsed.instagram };
}
