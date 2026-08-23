/**
 * Remove photos a community's website should never have handed us.
 *
 * Written for Bellmoore Park (2026-08-23), whose "community site" turned out
 * to be one page on The Providence Group's CORPORATE site. A depth-1 crawl of
 * that host produced 221 photos: 92 interior and exterior shots of two houses
 * for sale, 53 award trophies / mortgage diagrams / careers stock, and 76 from
 * the community page itself. It also left fifteen synthetic POIs behind —
 * "Bellmoore Park Careers", "Bellmoore Park Warranty" — every one of them
 * `approved`, which is what puts them in front of `runPlan`.
 *
 * `tour-steps/ingest.ts` no longer follows those pages. This is for the rows
 * already written.
 *
 * The rule here is the PAGE, not the picture: a photo is pruned when the page
 * it came from would not be followed today (`classifyPageLink` says 'skip' or
 * 'offer'). Whether an individual photograph is a listing shot is the vision
 * tagger's job, not this script's — see `residential_scope` in
 * `lib/poi/vision-tagger.ts`.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/prune-community-site-photos.ts <communityId>
 *   …                                                                       <communityId> --apply
 *
 * DRY RUN BY DEFAULT. Nothing is deleted without --apply.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { POI_PHOTO_BUCKET } from '../../apps/web/lib/poi/entity-scope.js';
import { classifyPageLink } from '../../apps/web/lib/poi/site-map.js';

const [communityId, ...flags] = process.argv.slice(2);
const APPLY = flags.includes('--apply');
if (!communityId) {
  console.error('usage: prune-community-site-photos <communityId> [--apply]');
  process.exit(1);
}

/**
 * The keys live in the reference worktree's `.env.local`, which the agent
 * worktrees share rather than each holding a copy. PERCHO_ENV_FILE overrides.
 */
function envPath(): string {
  const explicit = process.env.PERCHO_ENV_FILE;
  if (explicit) return explicit;
  for (const c of [
    new URL('../../.env.local', import.meta.url).pathname,
    `${process.env.HOME}/Workspace/Percho/.env.local`,
  ]) {
    if (existsSync(c)) return c;
  }
  throw new Error('no .env.local found; set PERCHO_ENV_FILE');
}

const env = Object.fromEntries(
  readFileSync(envPath(), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

// biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: community } = await sb
    .from('communities')
    .select('name, website')
    .eq('id', communityId)
    .maybeSingle();
  if (!community) {
    console.error(`no community ${communityId}`);
      process.exit(1);
    }
  // The same yardstick the crawl uses: the community page's own path.
  const sitePrefix = community.website ? new URL(community.website).pathname : '/';
  console.log(`${community.name} — site ${community.website ?? '(none)'} — prefix ${sitePrefix}\n`);

  const { data: links } = await sb
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', communityId);
  const poiIds: string[] = [...new Set((links ?? []).map((l: { poi_id: string }) => l.poi_id))];

  interface Photo {
    id: string;
    poi_id: string;
    source: string | null;
    storage_path: string | null;
    attribution: { source_page?: string } | null;
  }
  const photos: Photo[] = [];
  for (let i = 0; i < poiIds.length; i += 100) {
    const { data } = await sb
      .from('poi_photos')
      .select('id, poi_id, source, storage_path, attribution')
      .in('poi_id', poiIds.slice(i, i + 100));
    photos.push(...((data ?? []) as Photo[]));
  }

  const { data: pois } = await sb.from('pois').select('id, display_name').in('id', poiIds);
  const nameOf = new Map(
    ((pois ?? []) as Array<{ id: string; display_name: string }>).map((p) => [p.id, p.display_name]),
  );

  // Only photos that came from the website ingest. A Places photo has no
  // source_page and is none of this script's business.
  const doomed = photos.filter((p) => {
    if (p.source !== 'community_site') return false;
    const page = p.attribution?.source_page;
    if (!page) return false;
    return classifyPageLink(page, sitePrefix) !== 'follow';
  });

  const byPage = new Map<string, Photo[]>();
  for (const p of doomed) {
    const k = p.attribution?.source_page ?? '?';
    byPage.set(k, [...(byPage.get(k) ?? []), p]);
  }
  console.log(`${photos.length} photos, ${doomed.length} from pages the crawl would no longer follow\n`);
  for (const [page, ps] of [...byPage].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ps.length).padStart(3)}  ${classifyPageLink(page, sitePrefix)}  ${page}`);
  }

  // A POI is removed only when EVERY photo it has is going. One that also holds
  // a Places photo, or a photo from a page still worth following, keeps its row.
  const doomedIds = new Set(doomed.map((p) => p.id));
  const emptied = poiIds.filter((id) => {
    const mine = photos.filter((p) => p.poi_id === id);
    return mine.length > 0 && mine.every((p) => doomedIds.has(p.id));
  });
  console.log(`\n${emptied.length} POI(s) left with nothing:`);
  for (const id of emptied) {
    const n = photos.filter((p) => p.poi_id === id).length;
    console.log(`  ${String(n).padStart(3)} photos  ${nameOf.get(id)}`);
  }

    const { data: srcRows } = await sb
    .from('community_photo_sources')
    .select('url, enabled')
    .eq('community_id', communityId)
    .eq('origin', 'community_site');
  const srcSkip = ((srcRows ?? []) as Array<{ url: string; enabled: boolean }>).filter(
    (r) => classifyPageLink(r.url, sitePrefix) === 'skip',
  );
  const srcOffer = ((srcRows ?? []) as Array<{ url: string; enabled: boolean }>).filter(
    (r) => r.enabled && classifyPageLink(r.url, sitePrefix) === 'offer',
  );
  console.log(
    `\nsource rows: ${srcRows?.length ?? 0} — ${srcSkip.length} to drop, ${srcOffer.length} to untick`,
  );
  for (const r of srcOffer) console.log(`  untick  ${r.url}`);

  const keptPois = poiIds.length - emptied.length;
  console.log(
    `\n${APPLY ? 'APPLYING' : 'DRY RUN'} — would delete ${doomed.length} photo(s) and ${emptied.length} POI link(s); ${photos.length - doomed.length} photos and ${keptPois} POIs remain.`,
  );
  if (!APPLY) {
    console.log('re-run with --apply to carry it out.');
    process.exit(0);
  }

  // Storage first: a deleted row whose file remains is a leak nobody will ever
  // find again, whereas a deleted file whose row remains shows up as a broken
  // thumbnail — visible, and fixable.
  const paths = doomed.map((p) => p.storage_path).filter((s): s is string => !!s);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await sb.storage.from(POI_PHOTO_BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error('  storage remove failed:', error.message);
  }
  console.log(`removed ${paths.length} file(s) from storage`);

  const ids = [...doomedIds];
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await sb.from('poi_photos').delete().in('id', ids.slice(i, i + 100));
    if (error) throw new Error(`photo delete failed: ${error.message}`);
  }
  console.log(`deleted ${ids.length} poi_photos row(s)`);

  // The link, not the POI. `pois` is shared across communities and a synthetic
  // amenity POI is keyed by (community, label) — dropping the link is what takes
  // it out of this tour; the row itself is harmless and may be referenced.
  for (let i = 0; i < emptied.length; i += 100) {
    const { error } = await sb
      .from('community_pois')
      .delete()
      .eq('community_id', communityId)
      .in('poi_id', emptied.slice(i, i + 100));
    if (error) throw new Error(`link delete failed: ${error.message}`);
  }
  console.log(`unlinked ${emptied.length} POI(s) from the community`);

  // And the source rows, re-judged under the current rules.
  //
  // The rules only run at DISCOVERY, so every page the old crawl recorded is
  // still sitting there ticked — including twenty-six it never got round to
  // fetching. Without this pass, the next click on Fetch Sites would go and
  // get exactly the pages this script just deleted the photos of.
  const { data: allSources } = await sb
    .from('community_photo_sources')
    .select('id, url, origin, enabled, last_ingested_at')
    .eq('community_id', communityId)
    .eq('origin', 'community_site');

  const toDrop: string[] = [];
  const toUntick: string[] = [];
  for (const row of (allSources ?? []) as Array<{
    id: string;
    url: string;
    enabled: boolean;
    last_ingested_at: string | null;
  }>) {
    const verdict = classifyPageLink(row.url, sitePrefix);
    if (verdict === 'skip') toDrop.push(row.id);
    else if (verdict === 'offer' && row.enabled) toUntick.push(row.id);
  }

  for (let i = 0; i < toDrop.length; i += 100) {
    await sb.from('community_photo_sources').delete().in('id', toDrop.slice(i, i + 100));
  }
  for (let i = 0; i < toUntick.length; i += 100) {
    await sb
      .from('community_photo_sources')
      .update({ enabled: false })
      .in('id', toUntick.slice(i, i + 100));
  }
  console.log(`sources: dropped ${toDrop.length}, unticked ${toUntick.length}`);

}

main().catch((err) => {
  console.error('[prune-community-site-photos] failed:', err);
  process.exit(1);
});
