/**
 * /admin/pipeline/city-tours/[id] — one city's film (phase318).
 *
 * The community tour's workspace, pointed at the city tables: same strip,
 * same photo table, same review gate between tag and plan. What a city lacks
 * is hidden by `placeKind="city"` — website ingest and the voice override.
 */

import { loadNearbyPhotos } from '@/lib/poi/admin-nearby-photos';
import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CommunityTourSection } from '../../../_components/CommunityTourSection';

export const dynamic = 'force-dynamic';

export default async function AdminCityTourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createServiceClient();

  const { data: city } = await sb
    .from('cities')
    .select('id, name, state, lat, lng')
    .eq('id', id)
    .maybeSingle();
  if (!city) notFound();

  const [{ count: poiCount }, photos] = await Promise.all([
    sb.from('city_pois').select('poi_id', { count: 'exact', head: true }).eq('city_id', city.id),
    loadNearbyPhotos({ kind: 'city', id: city.id }).catch(() => []),
  ]);

  return (
    <div className="space-y-4">
      <CommunityTourSection
        placeKind="city"
        communityId={city.id}
        communityName={city.name}
        city={city.name}
        state={city.state}
        zip={null}
        lat={city.lat}
        lng={city.lng}
        kind="city"
        poiCount={poiCount ?? 0}
        storageBase={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
        bucket="listing-photos"
        photos={photos}
      />
    </div>
  );
}
