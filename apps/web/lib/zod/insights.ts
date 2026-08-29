/**
 * Shape of what the move-in insight research job is allowed to emit
 * (`lib/insights/parse.ts`). A model's output is an untrusted input like any
 * other, so it is parsed here before a row is built from it.
 */
import { INSIGHT_KINDS, INSIGHT_THEMES } from '@percho/shared/insights';
import { z } from 'zod';

export const InsightBasis = z.object({
  note: z.string().trim().min(1).max(200),
  url: z.string().trim().url(),
});
export type InsightBasis = z.infer<typeof InsightBasis>;

export const InsightCard = z.object({
  headline: z.string().trim().min(1).max(90),
  detail: z.string().trim().min(1).max(260),
  kind: z.enum(INSIGHT_KINDS),
  theme: z.enum(INSIGHT_THEMES),
  verify: z.string().trim().min(1).max(120).optional(),
  basis: z.array(InsightBasis).max(8),
  decisiveness: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type InsightCard = z.infer<typeof InsightCard>;

/**
 * The envelope only. Items are validated one at a time by the parser so a
 * single malformed card rejects itself, not the batch.
 */
export const InsightBatch = z.object({
  cards: z.array(z.unknown()).max(40),
});
export type InsightBatch = z.infer<typeof InsightBatch>;
