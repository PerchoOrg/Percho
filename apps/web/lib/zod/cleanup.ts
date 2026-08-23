import { z } from 'zod';

/** Cloudflare Stream uids are 32 lowercase hex characters. */
const streamUid = z.string().regex(/^[0-9a-f]{32}$/, 'not a Stream uid');

export const StreamCleanupBody = z.object({
  // Bounded so one click cannot fire a thousand sequential DELETEs at
  // Cloudflare and time the route out halfway through.
  uids: z.array(streamUid).min(1).max(250),
});

export const RunCleanupBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
