/** Body of POST /api/admin/reviews — one moderation verdict. */
import { z } from 'zod';

export const adminReviewVerdictSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['approved', 'rejected', 'pending']),
});

export type AdminReviewVerdict = z.infer<typeof adminReviewVerdictSchema>;
