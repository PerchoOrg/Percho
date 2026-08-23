/**
 * `filter` step — reject what CANNOT be used, then open the review gate.
 *
 * The fourth of the four steps "Fetch & Tag" was split into (2026-08-23), and
 * the one that ends the automated half.
 *
 * NOTHING HERE APPROVES ANYTHING. Two different questions were sharing the
 * `status` column: "is this photo usable at all" is policy and measurable
 * quality, which the pipeline can answer before the owner looks; "does it go
 * in the film" is the shot list, which only exists after planning — so `plan`
 * is what writes 'approved', and approved therefore means exactly "in the
 * current cut" (owner 2026-08-19: "approved can not be 82!!"). Everything in
 * between stays 'pending': usable, not chosen, available for him to promote.
 *
 * Only rows still 'pending' are touched. A verdict the owner has already given
 * is his, and a re-run must not quietly overturn it.
 *
 * The gate at the end is the point. Automated filters cut the pile down; they
 * do not make the editorial call. Owner 2026-08-19, defining the workflow:
 * "for each community, you will do the heavy lift work, including agent
 * research and fetch photos, tagging, and initial filtering, then i will do
 * second manual review of approved and rejected ones, after that, you can
 * continue on the planning, clip generation and assembly."
 */
import { tourPoiIds } from '../tour-poi-set';
import { type RunRow, type TourDb, mustWrite, saveStep, setRunStatus } from './shared';
import { initialVerdict } from './shots';

export async function runFilter(sb: TourDb, run: RunRow) {
  const resolve = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string }> }
    | undefined;

  // The same set `tag` judged, derived the same way. Fetching, tagging and
  // judging have to cover one set or the difference shows up as rows that
  // contradict themselves — four photos once came back marked unusable by the
  // tagger and stayed 'pending', which the table renders as a red "rejected"
  // sitting in the Pending section (owner 2026-08-20: "i see some rejected
  // photos in the pending section").
  const poiIds = [...(await tourPoiIds(sb, run.community_id, resolve?.resolved))];
  if (poiIds.length === 0) {
    return { error: 'no_pois', message: 'Nothing to filter — run the fetch steps first.' };
  }

  type Judgeable = Record<string, unknown> & { id: string };
  const toJudge: Judgeable[] = [];
  for (let i = 0; i < poiIds.length; i += 100) {
    const { data } = (await sb
      .from('poi_photos')
      .select(
        'id, status, ai_tags, width_px, height_px, enhanced_status, enhanced_meta, storage_path',
      )
      .in('poi_id', poiIds.slice(i, i + 100))
      .eq('status', 'pending')) as { data: Judgeable[] | null };
    toJudge.push(...(data ?? []));
  }

  // An untagged photo has no `ai_tags`, so `initialVerdict` cannot see whether
  // it is a floor plan, a stock photo or a church — it only checks that the
  // file exists and has dimensions, and passes. Judging before tagging is
  // finished therefore does not reject too much, it rejects too LITTLE, and
  // then opens the gate on a pile the owner has to sort by hand. Say so
  // instead.
  const untagged = toJudge.filter((p) => !p.ai_tags).length;
  if (untagged > 0) {
    return {
      error: 'untagged',
      message: `${untagged} photo(s) are still untagged — run Tag until it reports none left, then filter.`,
    };
  }

  // Grouped by reason so the verdict is written WITH its justification. A bare
  // 'rejected' made an automated call indistinguishable from the owner's own,
  // which left the automated ones unauditable — and two turned out to be wrong
  // in one session (owner 2026-08-20: "we need to add reasons").
  const byReason = new Map<string, string[]>();
  for (const row of toJudge) {
    const v = initialVerdict(row as Parameters<typeof initialVerdict>[0]);
    if (v.ok) continue;
    const ids = byReason.get(v.reason) ?? [];
    ids.push(row.id);
    byReason.set(v.reason, ids);
  }

  let rejected = 0;
  const reasons: Record<string, number> = {};
  for (const [reason, ids] of byReason) {
    rejected += ids.length;
    reasons[reason] = ids.length;
    await mustWrite(
      `reject ${ids.length} photo(s): ${reason}`,
      sb.from('poi_photos').update({ status: 'rejected', rejection_reason: reason }).in('id', ids),
    );
  }

  await saveStep(sb, run, 'filter', {
    phase: 'review',
    judged: toJudge.length,
    rejected,
    kept: toJudge.length - rejected,
    reasons,
  });
  await setRunStatus(sb, run.id, 'review');

  return {
    ok: true,
    judged: toJudge.length,
    rejected,
    kept: toJudge.length - rejected,
    awaitingReview: true,
  };
}
