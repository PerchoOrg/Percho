/**
 * The research job's reply → storable rows. This is where "a card with no
 * source does not exist" is enforced: a card whose basis is empty, or whose
 * kind/theme is outside the shared vocabulary, or whose text overruns the
 * card, is rejected with a reason and never repaired. The reasons are printed
 * by the script; they are the prompt's feedback loop.
 *
 * Pure. No network, no model, no database.
 */

import { extractJsonObject } from '@/lib/utils/extract-json';
import { InsightBatch, InsightCard } from '@/lib/zod/insights';

/** A row ready for `listing_insights`, minus listing_id / status / model. */
export interface InsightRow {
  headline: string;
  detail: string;
  kind: string;
  theme: string;
  verify: string | null;
  basis: { note: string; url: string }[];
  decisiveness: number;
}

export interface ParseResult {
  accepted: InsightRow[];
  rejected: { headline: string; reason: string }[];
}

export function parseInsightBatch(raw: string): ParseResult {
  const extracted = extractJsonObject(raw);
  if (!extracted) {
    return { accepted: [], rejected: [{ headline: '*', reason: 'no JSON object in reply' }] };
  }
  let json: unknown;
  try {
    json = JSON.parse(extracted);
  } catch {
    return { accepted: [], rejected: [{ headline: '*', reason: 'reply is not valid JSON' }] };
  }
  const batch = InsightBatch.safeParse(json);
  if (!batch.success) {
    return {
      accepted: [],
      rejected: [
        { headline: '*', reason: `envelope: ${batch.error.issues[0]?.message ?? 'invalid'}` },
      ],
    };
  }

  const accepted: InsightRow[] = [];
  const rejected: ParseResult['rejected'] = [];
  const seen = new Set<string>();
  for (const item of batch.data.cards) {
    const headline =
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { headline?: unknown }).headline === 'string'
        ? (item as { headline: string }).headline
        : '?';
    const one = InsightCard.safeParse(item);
    if (!one.success) {
      const issue = one.error.issues[0];
      rejected.push({
        headline,
        reason: `schema: ${issue ? `${issue.path.join('.') || 'card'} ${issue.message}` : 'invalid'}`,
      });
      continue;
    }
    const c = one.data;
    if (c.basis.length === 0) {
      rejected.push({ headline, reason: 'no source' });
      continue;
    }
    const key = c.headline.toLowerCase();
    if (seen.has(key)) {
      rejected.push({ headline, reason: 'duplicate headline' });
      continue;
    }
    seen.add(key);
    accepted.push({
      headline: c.headline,
      detail: c.detail,
      kind: c.kind,
      theme: c.theme,
      verify: c.verify ?? null,
      basis: c.basis.map((b) => ({ note: b.note, url: b.url })),
      decisiveness: c.decisiveness,
    });
  }
  return { accepted, rejected };
}
