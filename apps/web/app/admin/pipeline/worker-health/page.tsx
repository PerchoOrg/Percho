/**
 * /admin/pipeline/worker-health — the worker hub.
 *
 * What this replaced: four counters over `generated_videos` and five rows of
 * `render_jobs`, which covered two of the thirteen queues the render worker
 * drains and could not tell a busy worker from a dead one.
 *
 * The page itself is deliberately empty. Everything here is a live reading —
 * PIDs, load, a log tail, queue depth — and a server render would be stale
 * before it painted, so the whole hub polls from the client against
 * `/api/admin/worker/*`. Admin gating happens twice: once in `admin/layout.tsx`
 * for the route, and again inside every endpoint the hub calls.
 */

import { WorkerHub } from './WorkerHub';

export const dynamic = 'force-dynamic';

export default function WorkerHealthPage() {
  // No page header: the ask was everything on one screen, and a title plus a
  // paragraph is two rows of the table's worth of vertical space. The tab bar
  // above already says which page this is, and the status line says which host.
  return <WorkerHub />;
}
