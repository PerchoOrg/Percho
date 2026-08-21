/**
 * /admin/pipeline/worker-health — the worker hub.
 *
 * What this replaced: four counters over `generated_videos` and five rows of
 * `render_jobs`, which covered two of the eight queues the render worker
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
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-semibold text-xl">Worker</h1>
        <p className="text-ink2 text-sm">
          The render and Seedance workers run on this Mac as launchd agents — not on Vercel. This is
          their console.
        </p>
      </header>
      <WorkerHub />
    </div>
  );
}
