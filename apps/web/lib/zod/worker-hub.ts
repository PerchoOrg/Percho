/**
 * Request schemas for the /admin worker hub endpoints.
 *
 * The log and restart routes take an agent id that ends up selecting a file to
 * read and a launchd label to kick. Both are constrained to `MANAGED` ids here
 * rather than in the route, so neither a path nor a label can be shaped by the
 * request (CLAUDE.md §4).
 */

import { MANAGED } from '@/lib/worker-hub/host';
import { z } from 'zod';

const AGENT_IDS = MANAGED.map((m) => m.id);

const AgentId = z.string().refine((id) => AGENT_IDS.includes(id), {
  message: `unknown agent (expected one of: ${AGENT_IDS.join(', ')})`,
});

export const WorkerLogQuery = z.object({
  source: AgentId,
  /** Substring filter, applied server-side so the browser never holds 12 MB. */
  q: z.string().max(200).optional(),
  /** '0' shows ffmpeg progress spam; anything else hides it. */
  noise: z.enum(['0', '1']).default('1'),
  limit: z.coerce.number().int().min(50).max(1000).default(300),
});

export type WorkerLogQuery = z.infer<typeof WorkerLogQuery>;

export const WorkerRestartBody = z.object({ id: AgentId });

export type WorkerRestartBody = z.infer<typeof WorkerRestartBody>;
