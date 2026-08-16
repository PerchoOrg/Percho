/**
 * POST /api/admin/listings/[id]/generate-nearby
 *   Admin-only. Spawns the nearby_generate.py pipeline in the background
 *   for the given listing. Returns 202 with the child PID and log path so
 *   the UI can start polling `generated_videos` for per-bucket status.
 *
 * Body (JSON, all optional):
 *   {
 *     "buckets": ["dining", "schools", ...],  // omit for all 14
 *     "force":   false                          // regenerate live buckets
 *   }
 *
 * The child's stdout+stderr is streamed to /tmp/nearby-gen-<listing_id>.log.
 * The HTTP response returns immediately — polling is UI-driven.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

// nearby_generate expects to run from repo root — /app/scripts/pipelines/...
const REPO_ROOT = path.resolve(process.cwd());
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'pipelines', 'nearby_generate.py');

const KNOWN_BUCKETS = new Set([
  'schools',
  'dining',
  'nightlife',
  'shopping',
  'outdoor',
  'fitness',
  'kids',
  'asian_community',
  'daily_errands',
  'faith',
  'work_hubs',
  'healthcare',
  'pets',
  'transit',
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;

  // Basic UUID sanity check — id ends up on argv, don't want funny characters.
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: 'bad_listing_id' }, { status: 400 });
  }

  let body: { buckets?: unknown; force?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body ok */
  }

  const buckets = Array.isArray(body.buckets)
    ? (body.buckets as unknown[]).filter((b): b is string => typeof b === 'string')
    : [];
  const unknown = buckets.filter((b) => !KNOWN_BUCKETS.has(b));
  if (unknown.length > 0) {
    return NextResponse.json({ error: 'unknown_buckets', unknown }, { status: 400 });
  }

  const force = body.force === true;

  const args = ['-u', SCRIPT_PATH, '--listing-id', id];
  if (buckets.length > 0) args.push('--buckets', buckets.join(','));
  if (force) args.push('--force');

  const logPath = `/tmp/nearby-gen-${id}.log`;
  const logFd = openSync(logPath, 'a');

  const child = spawn('python3', args, {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  // Let the child outlive this request handler.
  child.unref();

  const pid = child.pid ?? null;
  if (!pid) {
    return NextResponse.json({ error: 'spawn_failed' }, { status: 500 });
  }

  return NextResponse.json(
    {
      status: 'queued',
      job_id: `nearby-${id}-${pid}`,
      pid,
      log_path: logPath,
      listing_id: id,
      buckets: buckets.length > 0 ? buckets : 'all',
      force,
    },
    { status: 202 },
  );
}
