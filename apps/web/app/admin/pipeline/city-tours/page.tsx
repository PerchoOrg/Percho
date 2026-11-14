/**
 * /admin/pipeline/city-tours — every city and where its film stands (phase318).
 *
 * Cities have their own tables (`cities`, `city_tour_runs`, …), so this is a
 * short list rather than the community tour's search over ~22k rows. A city is
 * added by a seeded row (slug, town-centre lat/lng, `geo_unit_id`); its film
 * runs from the detail page or `pnpm tour <slug> --city`.
 */

import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminCityToursPage() {
  const sb = createServiceClient();
  const [{ data: cities }, { data: runs }, { data: films }] = await Promise.all([
    sb.from('cities').select('id, slug, name, state, status').order('name'),
    sb.from('city_tour_runs').select('city_id, status, created_at').order('created_at', {
      ascending: false,
    }),
    sb.from('city_tour_assemblies').select('city_id, status').eq('status', 'ready'),
  ]);

  const latestRun = new Map<string, string>();
  for (const r of runs ?? []) if (!latestRun.has(r.city_id)) latestRun.set(r.city_id, r.status);
  const filmed = new Set((films ?? []).map((f) => f.city_id));

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h1 className="font-semibold text-ink text-lg">City Tour</h1>
      <p className="mt-1 text-ink2 text-sm">
        A city film: the town's highlights and what is unique about it.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-ink2 text-xs">
          <tr>
            <th className="py-2">City</th>
            <th>Latest run</th>
            <th>Film</th>
          </tr>
        </thead>
        <tbody>
          {(cities ?? []).map((c) => (
            <tr key={c.id} className="border-line border-t">
              <td className="py-2">
                <Link href={`/admin/pipeline/city-tours/${c.id}`} className="text-ink underline">
                  {c.name}, {c.state}
                </Link>
                {c.status !== 'active' ? <span className="ml-2 text-muted">inactive</span> : null}
              </td>
              <td className="text-ink2">{latestRun.get(c.id) ?? '—'}</td>
              <td className="text-ink2">{filmed.has(c.id) ? 'ready' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
