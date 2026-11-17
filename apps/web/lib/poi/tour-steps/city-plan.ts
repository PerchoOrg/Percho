/**
 * The city half of the `plan` step (phase326): read the script in the city's
 * profile and the photos it names, and hand both to `lib/cities/film.ts`,
 * which is pure and does the cutting.
 *
 * Nothing of the community plan runs for a city. That plan CHOOSES photos —
 * budgets, curator, scheduler — and a city film's photos are chosen by whoever
 * wrote each line of its script.
 *
 * What it shares with the community plan is the meaning of `approved`: in the
 * current cut. For a city that verdict is the city's own (`city_poi_photos`,
 * phase343), so the review page and the film cannot disagree.
 */
import { type CityFilm, type FilmPhoto, type FilmShot, buildCityFilm } from '@/lib/cities/film';
import { directCityFilm } from '@/lib/cities/motion';
import { type Verdict, approvalChanges, cityVerdict } from '@/lib/cities/photo-verdict';
import { readCityVerdictRows, writeCityVerdicts } from '@/lib/cities/photo-verdict-store';
import { readAllPages } from '@/lib/supabase/paginate';
import { parseCityProfile } from '@/lib/zod/city-profile';
import { CURATOR_VERSION, type CuratorPhoto, curateBatch } from '../tour-orchestrator/curator';
import { voiceForCommunity } from '../tour-orchestrator/narration';
import { type PhotoAnnotation, type PhotoMeta, annotationSchema } from '../tour-orchestrator/types';
import { type RunRow, type TourDb, mustWrite } from './shared';

export interface CityPlan {
  shots: CityFilm['shots'];
  /** The places the film visits, in film order. */
  cutPoiIds: string[];
  seconds: number;
  /** Photos newly approved for this city, and approvals withdrawn. */
  approved: number;
  unapproved: number;
  narration: {
    ok: true;
    voice: string;
    segments: CityFilm['segments'];
    sections: [];
    angles: [];
    warnings: string[];
    error?: undefined;
  };
}

export async function planCityFilm(sb: TourDb, run: RunRow): Promise<CityPlan> {
  const { data: city } = await sb
    .from('cities')
    .select('name, profile')
    .eq('id', run.entity_id)
    .maybeSingle();
  const profile = parseCityProfile(city?.profile);
  if (!city || !profile) {
    throw new Error(
      'this city has no film script — write its profile with scripts/admin/upsert-city-profile.ts, then plan again',
    );
  }

  // Every photo behind a place linked to the city. Rejected ones stay in the
  // list, flagged, so a script that names one is told why it cannot have it.
  const { data: links } = (await sb
    .from('city_pois')
    .select('poi_id, intent_bucket, pois!inner(display_name)')
    .eq('city_id', run.entity_id)
    .neq('status', 'rejected')) as {
    data: Array<{
      poi_id: string;
      intent_bucket: string | null;
      pois: { display_name: string | null } | null;
    }> | null;
  };
  const placeById = new Map((links ?? []).map((l) => [l.poi_id, l]));
  const poiIds = [...placeById.keys()];

  type PhotoRow = {
    id: string;
    poi_id: string;
    width_px: number | null;
    height_px: number | null;
    status: string | null;
    rejection_reason: string | null;
  };
  const rows: PhotoRow[] = [];
  // Chunked for the URL, paged for PostgREST's 1,000-row cap: a city's places
  // hold ten photos each from Google and up to eighty from an ingested page.
  for (let i = 0; i < poiIds.length; i += 100) {
    const chunk = poiIds.slice(i, i + 100);
    rows.push(
      ...(await readAllPages<PhotoRow>((from, to) =>
        sb
          .from('poi_photos')
          .select('id, poi_id, width_px, height_px, status, rejection_reason')
          .in('poi_id', chunk)
          .order('id')
          .range(from, to),
      )),
    );
  }

  // Only the photos the script names can have a clip worth knowing about.
  const refs = profile.film.lines.flatMap((l) => l.shots.map((s) => s.photo));
  const named = rows.filter((r) => refs.some((ref) => r.id === ref || r.id.startsWith(ref)));
  const { data: ready } = (await sb
    .from('photo_clips')
    .select('photo_id')
    .in(
      'photo_id',
      named.map((r) => r.id),
    )
    .eq('engine', 'seedance')
    .eq('status', 'ready')) as { data: Array<{ photo_id: string }> | null };
  const seedanceReady = new Set((ready ?? []).map((r) => r.photo_id));

  const verdictRows = await readCityVerdictRows(sb, run.entity_id);
  const verdictOf = (r: PhotoRow) => cityVerdict(r, verdictRows.get(r.id));

  const photos: FilmPhoto[] = rows.map((r) => ({
    id: r.id,
    poiId: r.poi_id,
    poiName: placeById.get(r.poi_id)?.pois?.display_name ?? city.name,
    bucket: placeById.get(r.poi_id)?.intent_bucket ?? 'other',
    width: r.width_px,
    height: r.height_px,
    seedanceReady: seedanceReady.has(r.id),
    rejected: (() => {
      const v = verdictOf(r);
      if (v.status !== 'rejected') return undefined;
      return `${v.everywhere ? 'rejected everywhere' : 'rejected for this city'}${v.reason ? ` (${v.reason})` : ''}`;
    })(),
  }));

  const film = buildCityFilm({ profile, photos });
  if (film.problems.length > 0) {
    // Owner 2026-11-15: "最好是全部都有对应的照片". A line without its photo is
    // fixed in the script or in the photo table, never by planning around it.
    throw new Error(
      `the script cannot be cut as written — ${film.problems.length} line(s) lack their photo:\n  ${film.problems.join('\n  ')}`,
    );
  }

  // Direct it: engine and move per shot, by the code that directs a community
  // tour, and a Seedance prompt for the shots the script spends one on.
  const { annotations, metas } = await readShots(sb, film.shots);
  const directed = directCityFilm({ shots: film.shots, annotations, metas, seedanceReady });
  if (directed.problems.length > 0) {
    throw new Error(
      `the script cannot be directed as written:\n  ${directed.problems.join('\n  ')}`,
    );
  }
  film.shots = directed.shots;
  film.warnings.push(...directed.warnings);

  // `approved` = in this city's cut, exactly as a community plan stamps its
  // own — but on the city's row, never the shared photo.
  const current = new Map<string, Verdict>(
    [...verdictRows].map(([id, row]) => [id, row.status === 'approved' ? 'approved' : 'pending']),
  );
  const { approve, unapprove } = approvalChanges(
    current,
    new Set(film.shots.map((s) => s.photo_id)),
  );
  await writeCityVerdicts(sb, run.entity_id, approve, { status: 'approved' });
  await writeCityVerdicts(sb, run.entity_id, unapprove, { status: 'pending' });

  return {
    shots: film.shots,
    cutPoiIds: [...new Set(film.shots.map((s) => s.poi_id))],
    seconds: film.seconds,
    approved: approve.length,
    unapproved: unapprove.length,
    narration: {
      ok: true,
      voice: voiceForCommunity(run.entity_id),
      segments: film.segments,
      sections: [],
      angles: [],
      warnings: film.warnings,
    },
  };
}

/** The Curator sends ~230 tokens a photo back; this keeps a batch well inside its limit. */
const CURATOR_BATCH = 16;

/**
 * The Curator's annotation and the pixel facts for each of the film's photos.
 *
 * Annotations are cached on the photo (`poi_photos.curator_tags`), as they are
 * for a community tour: a photo is uploaded to the model once, ever. A photo
 * the Curator returns nothing for is simply absent — `directCityFilm` gives it
 * a plain move and says so.
 */
async function readShots(
  sb: TourDb,
  shots: readonly FilmShot[],
): Promise<{ annotations: Map<string, PhotoAnnotation>; metas: Map<string, PhotoMeta> }> {
  const annotations = new Map<string, PhotoAnnotation>();
  const metas = new Map<string, PhotoMeta>();
  if (shots.length === 0) return { annotations, metas };

  const { data: rows } = (await sb
    .from('poi_photos')
    .select('id, storage_path, width_px, height_px, ai_tags, curator_tags, curator_version')
    .in(
      'id',
      shots.map((s) => s.photo_id),
    )) as {
    data: Array<{
      id: string;
      storage_path: string | null;
      width_px: number | null;
      height_px: number | null;
      ai_tags: { description?: string } | null;
      curator_tags: Record<string, unknown> | null;
      curator_version: number | null;
    }> | null;
  };
  const rowById = new Map((rows ?? []).map((r) => [r.id, r]));

  const uncached: CuratorPhoto[] = [];
  for (const shot of shots) {
    const row = rowById.get(shot.photo_id);
    const width = row?.width_px ?? 0;
    const height = row?.height_px ?? 0;
    if (!row || width <= 0 || height <= 0) continue;
    metas.set(row.id, {
      photo_id: row.id,
      poi_id: shot.poi_id,
      poi_name: shot.poi_name,
      bucket: shot.bucket,
      width_px: width,
      height_px: height,
      description: row.ai_tags?.description ?? '',
    });
    const cached =
      row.curator_version === CURATOR_VERSION && row.curator_tags
        ? annotationSchema.safeParse(row.curator_tags)
        : null;
    if (cached?.success) {
      annotations.set(row.id, cached.data);
      continue;
    }
    if (!row.storage_path) continue;
    // The ORIGINAL file, as on the community side: enhancement changes the
    // light, and the Curator judges time of day from the light.
    const { data: blob } = await sb.storage.from('listing-photos').download(row.storage_path);
    if (!blob) continue;
    uncached.push({
      photo_id: row.id,
      poi_name: shot.poi_name,
      bucket: shot.bucket,
      width_px: width,
      height_px: height,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime_type: 'image/jpeg',
    });
  }

  for (let i = 0; i < uncached.length; i += CURATOR_BATCH) {
    const { annotations: fresh } = await curateBatch(uncached.slice(i, i + CURATOR_BATCH));
    for (const annotation of fresh) {
      annotations.set(annotation.photo_id, annotation);
      // Losing this silently means paying the Curator again on every plan.
      await mustWrite(
        `cache curator_tags(${annotation.photo_id})`,
        sb
          .from('poi_photos')
          .update({
            curator_tags: annotation,
            curator_version: CURATOR_VERSION,
            curated_at: new Date().toISOString(),
          })
          .eq('id', annotation.photo_id),
      );
    }
  }
  return { annotations, metas };
}
