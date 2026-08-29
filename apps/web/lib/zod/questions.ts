/**
 * Shape of what the move-in question generator is allowed to emit
 * (`lib/questions/generate.ts`). A model's output is an untrusted input like
 * any other, so it is parsed here before a row is built from it.
 *
 * The bank-level rules — is this id askable, are these basis types allowed
 * for this question, does a sourced basis carry a URL — are checked after
 * this schema, in the generator, because they need the bank.
 */
import { ANSWER_FORMS, BASIS_TYPES } from '@percho/shared/questions';
import { z } from 'zod';

export const QuestionBasis = z.object({
  type: z.enum(BASIS_TYPES),
  note: z.string().trim().min(1).max(300),
  url: z.string().trim().url().optional(),
});
export type QuestionBasis = z.infer<typeof QuestionBasis>;

export const QuestionAnswer = z.object({
  id: z.string().trim().min(1).max(60),
  answer: z.string().trim().min(1).max(1200),
  basis: z.array(QuestionBasis).max(8),
  verify: z.string().trim().min(1).max(200).optional(),
  decisiveness: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  form: z.enum(ANSWER_FORMS),
});
export type QuestionAnswer = z.infer<typeof QuestionAnswer>;

/**
 * The envelope only. Items are validated one at a time by the generator so a
 * single malformed answer (a missing id, say) rejects itself, not the batch.
 */
export const QuestionAnswerBatch = z.object({
  answers: z.array(z.unknown()).max(120),
});
export type QuestionAnswerBatch = z.infer<typeof QuestionAnswerBatch>;
