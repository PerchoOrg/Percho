/**
 * `ingest` step — photos from the community's own website.
 *
 * The second of the four steps "Fetch & Tag" was split into (2026-08-23).
 * Google Places has no photograph of an HOA pool, a clubhouse or an amenity
 * centre — they are not listed businesses — so for a subdivision the imagery
 * worth having lives on the community's own site. That path existed already,
 * but only as a text box an admin pasted one URL into at a time
 * (`PhotoSourcePanel`); it was never part of the pipeline, so a community's
 * best photos depended on somebody remembering to go and get them.
 *
 * The owner's rule, 2026-08-23: "the default main website for the community if
 * it exists, should always be selected as default, and its sibling and child
 * subpages. other webpages are optional unless I manually selected them for
 * fetching."
 *
 * So this step:
 *   1. records the community site the research agent found, enabled;
 *   2. records every POI site it found, NOT enabled — those are the optional
 *      ones, and photo licensing outside the community's own site is
 *      unresolved;
 *   3. expands each community-site page ONCE into the same-origin pages one
 *      click away (`sameOriginPageLinks`), which is what "sibling and child"
 *      means on a real site — the nav bar and the in-page links;
 *   4. reads the enabled pages it has not read yet, until the clock runs out.
 *
 * Nothing here approves a photo. Every image lands `pending`, exactly as the
 * manual box always did, and the owner's review is still the gate.
 */
import { fetchPageHtml, ingestPagePhotos } from '@/lib/poi/ingest-page-photos';
import { labelForPath, sameOriginPageLinks } from '@/lib/poi/site-map';
import { type RunRow, type TourDb, asJson, saveStep, setRunStatus } from './shared';

/**
 * How long the page loop may run before it stops and asks to be clicked again.
 *
 * The step route is `maxDuration = 300` on Vercel. The budget is checked
 * BEFORE a page starts, not during it, so the real worst case is this plus one
 * whole page — and one page is up to 80 images downloaded, uploaded to storage
 * and inserted, which has been measured at well under a minute but is not
 * bounded by anything here. 180s + a slow page still lands inside 300s.
 *
 * A platform kill at `maxDuration` skips the route's catch, so the run would
 * be left claiming to be working with nothing recorded — which is the failure
 * this budget exists to avoid, not merely a slow response.
 */
const INGEST_BUDGET_MS = 180_000;

/** A row of `community_photo_sources`. */
interface SourceRow {
  id: string;
  url: string;
  label: string | null;
  origin: string;
  enabled: boolean;
  expanded_at: string | null;
  last_ingested_at: string | null;
}

/** What one page yielded, for the strip and the panel. */
interface PageOutcome {
  url: string;
  label: string;
  found?: number;
  added?: number;
  skipped?: number;
  error?: string;
}

/**
 * The sites the research step named, split into the community's own and
 * everyone else's. PURE.
 *
 * `community_site` is what the research prompt asks each agent for; a POI's
 * `source` is the page the agent cited for that place — a school district
 * page, a county parks page. The first is the subject of the film and is
 * enabled without being asked; the second is someone else's photography.
 */
export function sourcesFromResearch(research: unknown): Array<{
  url: string;
  label: string;
  origin: 'community_site' | 'research';
}> {
  const raw = research as
    | {
        agents?: Record<
          string,
          {
            parsed?: {
              community_site?: string;
              pois?: Array<{ name?: string; source?: string }>;
            } | null;
          }
        >;
      }
    | undefined;
  const agents = Object.values(raw?.agents ?? {});
  const out = new Map<
    string,
    { url: string; label: string; origin: 'community_site' | 'research' }
  >();

  for (const a of agents) {
    const site = a?.parsed?.community_site;
    if (site?.startsWith('http')) {
      out.set(site, { url: site, label: labelForPath(site), origin: 'community_site' });
    }
  }
  for (const a of agents) {
    for (const poi of a?.parsed?.pois ?? []) {
      const src = poi.source;
      // A community-site row already claimed is never demoted to 'research' —
      // both agents cite the community's own page for its own amenities.
      if (!src?.startsWith('http') || out.has(src)) continue;
      out.set(src, { url: src, label: poi.name ?? labelForPath(src), origin: 'research' });
    }
  }
  return [...out.values()];
}

/**
 * Write the research-found pages into `community_photo_sources`.
 *
 * Called from THREE places, and the reason is the ordering problem this step
 * shipped with (owner 2026-08-23: "can you give me the candidate website urls
 * that we got from agent research? so i can select"). Seeding used to happen
 * inside `runIngest`, so the candidate list appeared only AFTER Fetch Sites had
 * run — and choosing what to fetch is the thing you want to do BEFORE it runs.
 * So it is seeded when research finishes, and again when the panel is opened,
 * which is what makes the list appear for the runs that were researched before
 * any of this existed. Re-running research to populate a list would cost real
 * tokens for data already sitting in the run blob.
 *
 * Idempotent by construction. `ignoreDuplicates` matters more than it looks:
 * without it, each call would reset `enabled` on every row, so the owner's
 * ticks would survive exactly until the next time anything called this.
 */
export async function seedPhotoSources(
  sb: TourDb,
  communityId: string,
  research: unknown,
): Promise<number> {
  const discovered = sourcesFromResearch(research);

  // The community's own site, preferring the COMMUNITY's record over the run
  // blob. `runResearch` writes `communities.website` and only fills a blank, so
  // a URL a person entered outranks the model's guess — and this is the one
  // place that difference decides which page is fetched by default.
  const { data: community } = (await sb
    .from('communities')
    .select('website')
    .eq('id', communityId)
    .maybeSingle()) as { data: { website: string | null } | null };
  const website = community?.website;
  if (website && /^https?:\/\//.test(website) && !discovered.some((d) => d.url === website)) {
    discovered.unshift({ url: website, label: labelForPath(website), origin: 'community_site' });
  }

  if (discovered.length === 0) return 0;

  await sb.from('community_photo_sources').upsert(
    discovered.map((d) => ({
      community_id: communityId,
      url: d.url,
      label: d.label,
      origin: d.origin,
      enabled: d.origin === 'community_site',
    })),
    { onConflict: 'community_id,url', ignoreDuplicates: true },
  );

  // `origin` is a FACT and is corrected on every call; `enabled` is a CHOICE
  // and is only ever set at insert. The case that needs this: the owner pastes
  // the community's own URL into the panel's box before any of this runs, which
  // files it as 'manual' — and the subpage expansion keys on origin, so that
  // site's pages would never be harvested. Writing `enabled` here too would
  // undo an untick every time the panel was opened.
  const siteUrls = discovered.filter((d) => d.origin === 'community_site').map((d) => d.url);
  if (siteUrls.length > 0) {
    await sb
      .from('community_photo_sources')
      .update({ origin: 'community_site' })
      .eq('community_id', communityId)
      .in('url', siteUrls);
  }
  return discovered.length;
}

export async function runIngest(sb: TourDb, run: RunRow) {
  const communityId = run.community_id;

  // Seeded here too, not only at research time: a run researched before
  // 2026-08-23 has candidates in its blob and no rows to show for them.
  await seedPhotoSources(sb, communityId, run.step_results.agent_research);

  const readSources = async (): Promise<SourceRow[]> => {
    const { data } = (await sb
      .from('community_photo_sources')
      .select('id, url, label, origin, enabled, expanded_at, last_ingested_at')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true })) as { data: SourceRow[] | null };
    return data ?? [];
  };

  let sources = await readSources();
  if (sources.length === 0) {
    // Not an error. A community whose research turned up no website has
    // nothing to ingest, and the Places photos from the previous step stand on
    // their own — saying so is more useful than failing the run.
    await saveStep(sb, run, 'ingest', {
      phase: 'done',
      pages_total: 0,
      pages_done: 0,
      added: 0,
      pages: [],
      note: 'no website on file for this community — add one in the panel below',
    });
    return { ok: true, added: 0, pagesDone: 0, pagesLeft: 0 };
  }

  const startedAt = Date.now();

  // ─── 3. Sibling and child pages, once per community-site page. ──────────
  let discoveredPages = 0;
  for (const row of sources) {
    if (row.origin !== 'community_site' || !row.enabled || row.expanded_at) continue;
    if (Date.now() - startedAt > INGEST_BUDGET_MS) break;
    const html = await fetchPageHtml(row.url);
    // Stamped either way. A site that will not answer must not be re-fetched
    // on every click — the manual box is how a person retries it.
    const expandedAt = new Date().toISOString();
    if (html) {
      const links = sameOriginPageLinks(html, row.url);
      if (links.length > 0) {
        await sb.from('community_photo_sources').upsert(
          links.map((l) => ({
            community_id: communityId,
            url: l.url,
            label: l.label,
            origin: 'community_site',
            enabled: true,
            // Born expanded. THIS is what holds the crawl at depth 1 — a child
            // that could expand would walk the whole site, and a site is a few
            // hundred pages of floor plans and press releases.
            expanded_at: expandedAt,
          })),
          { onConflict: 'community_id,url', ignoreDuplicates: true },
        );
        discoveredPages += links.length;
      }
    }
    await sb.from('community_photo_sources').update({ expanded_at: expandedAt }).eq('id', row.id);
  }
  if (discoveredPages > 0) sources = await readSources();

  // ─── 4. Read the enabled pages nobody has read yet. ─────────────────────
  //
  // `last_ingested_at is null` is the queue. A page already read is skipped
  // rather than re-downloaded: content-hash dedupe would make a re-read
  // harmless but not free, and this is what lets a second click CONTINUE a
  // batch instead of repeating it. Deliberately re-fetching a page is what the
  // panel's manual box is for.
  const queue = sources.filter((s) => s.enabled && !s.last_ingested_at);
  const pages: PageOutcome[] = [];
  let added = 0;
  let stoppedOnBudget = false;

  for (const row of queue) {
    if (Date.now() - startedAt > INGEST_BUDGET_MS) {
      stoppedOnBudget = true;
      break;
    }
    const label = row.label ?? labelForPath(row.url);
    const result = await ingestPagePhotos(communityId, row.url, label);
    const outcome: PageOutcome =
      'error' in result
        ? { url: row.url, label, error: result.message }
        : {
            url: row.url,
            label,
            found: result.found,
            added: result.added,
            skipped: result.skipped.length,
          };
    pages.push(outcome);
    if (!('error' in result)) added += result.added;

    // Stamped even on failure, for the same reason `expanded_at` is: a page
    // that 404s must not be retried on every click for ever. The reason is
    // kept in `last_result` so the panel can show why it yielded nothing.
    await sb
      .from('community_photo_sources')
      .update({ last_ingested_at: new Date().toISOString(), last_result: asJson(outcome) })
      .eq('id', row.id);
  }

  const pagesLeft = queue.length - pages.length;
  await saveStep(sb, run, 'ingest', {
    phase: pagesLeft > 0 ? 'partial' : 'done',
    pages_total: queue.length,
    pages_done: pages.length,
    pages_left: pagesLeft,
    added,
    pages,
    ...(stoppedOnBudget ? { stopped_on: 'time_budget' } : {}),
  });
  if (pagesLeft > 0) await setRunStatus(sb, run.id, 'fetching_photos');

  return {
    ok: true,
    added,
    pagesDone: pages.length,
    pagesLeft,
    ...(pagesLeft > 0
      ? {
          message: `${added} photo(s) from ${pages.length} page(s). ${pagesLeft} page(s) left — run Fetch Sites again.`,
        }
      : {}),
  };
}
