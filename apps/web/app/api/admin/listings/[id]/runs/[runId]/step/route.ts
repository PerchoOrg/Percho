/**
 * POST /api/admin/listings/[id]/runs/[runId]/step
 *   Execute one home-tour step, persist its output into step_results.
 *
 * Steps (owner-fixed 2026-08-20):
 *   tag       — photo_tagger over the listing's photos. QUEUED to the render
 *               worker: the tagger is Python and stays there.
 *   ——— the owner reviews approved AND rejected photos in the table ———
 *   plan      — build_plan over what survived. Also queued, also Python.
 *               Renders nothing and spends nothing.
 *   generate  — one clip PER PHOTO in listing_photo_clips. A database write;
 *               the render worker picks the rows up.
 *   assemble  — concat the ready clips for one surface into a
 *               listing_tour_assemblies row.
 *
 * Dispatch only. Each step lives in `lib/poi/listing-tour-steps/`.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { runAssemble, runAssembleAllSurfaces } from '@/lib/poi/listing-tour-steps/assemble';
import { runGenerate, runGenerateAllSurfaces } from '@/lib/poi/listing-tour-steps/generate';
import { runPlan } from '@/lib/poi/listing-tour-steps/plan';
import {
  type ListingRunRow,
  type Surface,
  type TourDb,
  getListingRun,
  setListingRunStatus,
} from '@/lib/poi/listing-tour-steps/shared';
import { runTag } from '@/lib/poi/listing-tour-steps/tag';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const STEP_HANDLERS: Record<
  string,
  (
    sb: TourDb,
    run: ListingRunRow,
    photoIds?: string[],
    engine?: string,
    approve?: boolean,
    surface?: Surface,
  ) => Promise<unknown>
> = {
  // Wrapped, not passed bare: `runTag` and `runPlan` take (sb, run) only, and
  // handing them the registry's extra arguments would be silently ignored
  // today and silently meaningful the day either grows a third parameter.
  tag: (sb, run) => runTag(sb, run),
  plan: (sb, run) => runPlan(sb, run),
  // A per-row click names its photo and stays on one surface. The Render chip
  // names neither and means the whole film, which is both.
  generate: (sb, run, photoIds, engine, _approve, surface) =>
    photoIds && photoIds.length > 0
      ? runGenerate(sb, run, photoIds, engine, surface ?? 'ios')
      : runGenerateAllSurfaces(sb, run),
  assemble: (sb, run, _photoIds, _engine, approve, surface) =>
    surface
      ? runAssemble(sb, run, undefined, undefined, approve, surface)
      : runAssembleAllSurfaces(sb, run, approve),
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: listingId, runId } = await params;
  const sb = createServiceClient();

  const body = (await req.json().catch(() => ({}))) as {
    step?: string;
    photoIds?: string[];
    engine?: string;
    approve?: boolean;
    surface?: string;
  };
  const step = body.step;
  const handler = step ? STEP_HANDLERS[step] : undefined;
  if (!step || !handler) {
    return NextResponse.json(
      { error: 'invalid_step', message: `Unknown step: ${step}` },
      { status: 400 },
    );
  }
  // Narrowed rather than cast: `surface` is part of a unique key and a typo
  // would write clips nobody reads. Absent means "every surface" — that is
  // what the Render and Assemble chips send.
  const surface: Surface | undefined =
    body.surface === 'web' ? 'web' : body.surface === 'ios' ? 'ios' : undefined;

  const run = await getListingRun(sb, runId);
  if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
  if (run.listing_id !== listingId) {
    return NextResponse.json({ error: 'run_mismatch' }, { status: 400 });
  }

  try {
    const result = await handler(sb, run, body.photoIds, body.engine, body.approve, surface);
    return NextResponse.json({ ok: true, step, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setListingRunStatus(sb, run.id, 'failed');
    return NextResponse.json({ ok: false, step, error: message }, { status: 500 });
  }
}
