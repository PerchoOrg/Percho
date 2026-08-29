import { z } from 'zod';

/**
 * A submitted customer-study questionnaire (phase135).
 *
 * `answers` is kept loose on purpose — one object keyed by question id, each
 * value a single choice, a list of choices, or a 1–5 rating — so the form can
 * change between study versions without a code change. `study` pins which
 * version the answers belong to, and is an enum so a stray client cannot
 * invent one. `website` is a honeypot: real browsers leave it empty.
 */

export const RESEARCH_STUDIES = ['atlanta-remote-buyer-v4'] as const;

const choice = z.string().trim().min(1).max(200);

export const researchAnswerSchema = z.union([
  choice,
  z.array(choice).min(1).max(20),
  z.number().int().min(1).max(5),
]);

export const researchResponseSchema = z.object({
  study: z.enum(RESEARCH_STUDIES),
  lang: z.enum(['zh', 'en']).default('zh'),
  answers: z
    .record(z.string().regex(/^q\d{1,2}(_[a-z]+)*$/), researchAnswerSchema)
    .refine((a) => Object.keys(a).length >= 1 && Object.keys(a).length <= 40, {
      message: 'between 1 and 40 answers',
    }),
  contact: z.string().trim().max(120).optional(),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  website: z.string().max(0).optional(),
});

export type ResearchResponseInput = z.infer<typeof researchResponseSchema>;
