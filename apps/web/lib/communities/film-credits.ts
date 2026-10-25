/**
 * Who took the photos a community film is cut from (phase308).
 *
 * Google's Places policies: "You must always credit the author when
 * displaying photos" — and a film made of Places photos displays them. The
 * feed card has no room, which the policy allows as long as a larger view
 * carries the full credit; the community page is that view.
 *
 * The film is found the way `fetchVerticalVideos` / `fetchCommunityDetail`
 * pick it, by the stream uid that won: an assembled tour (`tour_assemblies`,
 * photo ids in `ordered_clips`), else a bucket video (`generated_videos.
 * input_photo_ids`); with no stream uid, the AI tour (`ai_tour_videos`).
 * Every one of those ids is a `poi_photos.id`.
 *
 * Service role, as in `vertical-videos.ts`: RLS lets only admins read
 * `tour_assemblies` and only agents read `poi_photos`. What leaves this
 * module is the authors' public display names and nothing else.
 */

import { createServiceClient } from '@/lib/supabase/server';

interface PhotoRow {
  id: string;
  source: string;
  attribution: unknown;
}

/**
 * Display names of the Google authors among `rows`, in the order the film
 * shows their photos (`ids`), without repeats. `community_site` photos carry
 * no author and add nothing.
 */
export function googleAuthorNames(rows: readonly PhotoRow[], ids: readonly string[]): string[] {
  const at = (id: string) => {
    const i = ids.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of [...rows].sort((a, b) => at(a.id) - at(b.id))) {
    if (row.source !== 'google_places') continue;
    const authors = (row.attribution as { authorAttributions?: unknown } | null)
      ?.authorAttributions;
    if (!Array.isArray(authors)) continue;
    for (const a of authors as { displayName?: unknown }[]) {
      const name = typeof a?.displayName === 'string' ? a.displayName.trim() : '';
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

/** `ordered_clips[].photo_id`, in film order, without repeats. */
export function clipPhotoIds(orderedClips: unknown): string[] {
  if (!Array.isArray(orderedClips)) return [];
  const ids: string[] = [];
  for (const clip of orderedClips) {
    const id = (clip as { photo_id?: unknown } | null)?.photo_id;
    if (typeof id === 'string' && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function filmPhotoIds(communityId: string, streamUid: string | undefined): Promise<string[]> {
  const supabase = createServiceClient();
  if (streamUid) {
    const { data: assembly } = await supabase
      .from('tour_assemblies')
      .select('ordered_clips')
      .eq('cf_stream_uid', streamUid)
      .limit(1)
      .maybeSingle();
    if (assembly) return clipPhotoIds(assembly.ordered_clips);
    const { data: bucket } = await supabase
      .from('generated_videos')
      .select('input_photo_ids')
      .eq('cf_stream_uid', streamUid)
      .limit(1)
      .maybeSingle();
    return bucket?.input_photo_ids ?? [];
  }
  const { data: ai } = await supabase
    .from('ai_tour_videos')
    .select('input_photo_ids')
    .eq('community_id', communityId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return ai?.input_photo_ids ?? [];
}

/**
 * The Google authors of the film this community shows. Empty when there is
 * no film, or none of its photos came from Google. Never throws: a credit
 * line must not take the page down.
 */
export async function fetchFilmPhotoCredits(
  communityId: string,
  streamUid: string | undefined,
): Promise<string[]> {
  try {
    const ids = await filmPhotoIds(communityId, streamUid);
    if (ids.length === 0) return [];
    const { data } = await createServiceClient()
      .from('poi_photos')
      .select('id, source, attribution')
      .in('id', ids);
    return googleAuthorNames((data ?? []) as PhotoRow[], ids);
  } catch (err) {
    console.warn('[community] film photo credits unavailable', err);
    return [];
  }
}
