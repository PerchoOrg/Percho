/**
 * /admin/pipeline/city-tours — the City Tour index (phase318). Rows link to
 * /admin/pipeline/city-tours/[id].
 *
 * The same table as the Community Tour index (`CommunityNearbyTable`, owner:
 * "start with table following the pattern from others, dont show the title
 * again" — the tab already names the page). Its counters come from the city
 * tables, folded by the same `foldTourActivity`; the city id rides in the
 * `community_id` slot those row types name.
 *
 * Cities are few, so everything is read and searched in the browser.
 */

import { foldTourActivity, newerTimestamp, sortByLastActivity } from '@/lib/communities/tour-index';
import { createServiceClient } from '@/lib/supabase/server';
import { formatAge } from '@/lib/worker-hub/format';
import CommunityNearbyTable, {
  type CommunityNearbyRow,
} from '../community-nearby/CommunityNearbyTable';

export const dynamic = 'force-dynamic';

export default async function AdminCityToursPage() {
  const sb = createServiceClient();
  const [cities, runs, assemblies, pois] = await Promise.all([
    sb.from('cities').select('id, name, state, updated_at').order('name'),
    sb.from('city_tour_runs').select('city_id, status, updated_at'),
    sb.from('city_tour_assemblies').select('city_id, status, updated_at'),
    sb.from('city_pois').select('city_id, status'),
  ]);
  for (const r of [cities, runs, assemblies, pois]) {
    if (r.error) throw new Error(`city tour index query failed: ${r.error.message}`);
  }

  const asCommunity = <T extends { city_id: string }>(rows: T[] | null) =>
    (rows ?? []).map(({ city_id, ...rest }) => ({ ...rest, community_id: city_id }));
  const activity = foldTourActivity({
    runs: asCommunity(runs.data),
    assemblies: asCommunity(assemblies.data),
    pois: asCommunity(pois.data),
  });

  const now = Date.now();
  const rows: CommunityNearbyRow[] = (cities.data ?? []).map((c) => {
    const a = activity.get(c.id);
    const lastActivityAt = newerTimestamp(a?.lastActivityAt ?? null, c.updated_at);
    return {
      id: c.id,
      name: c.name,
      city: null,
      state: c.state,
      stage: a?.stage ?? null,
      runCount: a?.runCount ?? 0,
      poiCount: a?.poiCount ?? 0,
      poiApproved: a?.poiApproved ?? 0,
      videosReady: a?.videosReady ?? 0,
      videosFailed: a?.videosFailed ?? 0,
      lastActivityAt,
      lastActivityLabel: formatAge(lastActivityAt, now),
    };
  });

  const withFilm = rows.filter((r) => r.videosReady > 0).length;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink2">
        {`${rows.length} cit${rows.length === 1 ? 'y' : 'ies'} · ${withFilm} with a finished film.`}
      </p>
      <CommunityNearbyTable rows={sortByLastActivity(rows)} kind="city" />
    </div>
  );
}
