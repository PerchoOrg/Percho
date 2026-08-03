/**
 * Community detail — what backs the card's "Why people love it →" CTA.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * The community card has drawn that CTA since the 2026-07-30 redline, and the
 * feed screen deliberately did NOT pass an `onExplore` handler, on this comment:
 *
 *   "There is no community destination in this app to send it to. Passing a
 *    handler would ship a button that lands on an empty screen, so none is
 *    passed and the CTA is not rendered."
 *
 * That was the right call then and the owner closed it on 2026-08-02:
 * 「最后还有why people love it的跳转button」. So this is the destination, and it is
 * scoped to exactly what the button promises — WHY residents love this place —
 * not to spec-v3 §3.3's full six-section explore page.
 *
 * ── Why not the §3.3 explore page ──────────────────────────────────────────
 *
 * §3.3 wants Vibe + 四柱 (safety / schools / convenience / potential) + Homes.
 * Measured against the live DB on 2026-08-02, none of the four pillars has data:
 *
 *   crime / school ratings / commute times   no column, no table
 *   `community_pois` (the 便 pillar's POIs)   175 rows for **1** of 8,679
 *                                            communities (Ashley Crossing)
 *   `median_home_value`                      **0** of 8,679 populated
 *   listings with a `community_id`            **3** of 260 active
 *
 * §3.4's own rule is 「缺数据显示 "–" 不编造」 — a page of four "not enough data"
 * grades is not a destination. What we DO have, at 90.7% / 97.5% / 91.0%, is the
 * resident-stated `attributes`, `interests` and the demographic figures, which is
 * precisely the material the CTA's own words point at. So this page renders the
 * card's three reason tiles in full, PLUS every other reason the community stated
 * that the card had no room for, each with its evidence.
 *
 * §3.3 remains the target once a pillar has data behind it. This is not a
 * placeholder for it: it is the honest page for the button the card actually has.
 */

import { publicCoverImageUrl } from '@/lib/communities/cover';
import { createAnonClient } from '@/lib/supabase/server';
import {
  type CommunityReason,
  communityReasons,
  communityReasonsAll,
} from '../feed/community-reasons';

/** One demographic figure, with the label the screen prints. */
export interface CommunityStatDTO {
  label: string;
  value: string;
}

export interface CommunityDetailDTO {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  heroUrl: string;
  /** `communities.description` — authored prose. Omitted when absent. */
  blurb?: string;
  /**
   * The three the CARD shows, in the same rarity-first order, so the page opens
   * on what the user just tapped rather than on a different three.
   */
  topReasons: CommunityReason[];
  /**
   * Every OTHER reason this community stated, same ranking, same evidence rule.
   * This is the page's reason to exist — the card can only hold three.
   */
  moreReasons: CommunityReason[];
  /**
   * Demographic figures, only the ones this row actually has. Never zero-filled:
   * `median_home_value` is NULL on all 8,679 rows and so is never in this list.
   */
  stats: CommunityStatDTO[];
  /**
   * Nextdoor's per-neighbourhood interest ranking, verbatim and in order. This is
   * the evidence behind every "#N resident interest" sub-line on the reasons
   * above, so the page shows the source rather than asking to be believed.
   */
  interests: string[];
}

type DetailRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  description: string | null;
  cover_storage_path: string | null;
  attributes: string[] | null;
  interests: string[] | null;
  residents_count: string | number | null;
  homeowners_pct: string | number | null;
  avg_age: string | number | null;
};

const COLUMNS =
  'id, slug, name, city, state, description, cover_storage_path, attributes, interests, residents_count, homeowners_pct, avg_age';

/**
 * One community by id or slug, or `null`.
 *
 * Accepts both for the same reason the listing endpoint does: the feed card
 * carries an id, a shared link carries a slug.
 */
export async function fetchCommunityDetail(idOrSlug: string): Promise<CommunityDetailDTO | null> {
  const supabase = createAnonClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const { data, error } = await supabase
    .from('communities')
    .select(COLUMNS)
    .eq('status', 'active')
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .maybeSingle();

  if (error) throw new Error(`community detail fetch failed: ${error.message}`);
  if (!data) return null;
  return projectCommunityDetail(data as DetailRow);
}

/** Pure projection, exported for direct testing. */
export function projectCommunityDetail(r: DetailRow): CommunityDetailDTO | null {
  if (!r.cover_storage_path || !r.slug || !r.name) return null;

  const facts = {
    residentsCount: r.residents_count,
    homeownersPct: r.homeowners_pct,
    // Must match the card's fact sources exactly, or tapping the CTA shows
    // FEWER facts than the tile the user just tapped.
    avgAge: r.avg_age,
    interests: r.interests,
  };
  // The SAME picker the card uses, so the first three here are byte-identical to
  // the three the user tapped. Re-ranking on this page would read as the app
  // disagreeing with itself.
  const topReasons = communityReasons({ attributes: r.attributes, facts });
  const topLabels = new Set(topReasons.map((x) => x.label));
  const moreReasons = communityReasonsAll({
    attributes: r.attributes,
    facts,
  }).filter((x) => !topLabels.has(x.label));

  const stats: CommunityStatDTO[] = [];
  // Each figure is printed VERBATIM from the column (they are text: "1,050",
  // "35%", "42"), so the page cannot round a number the seed did not round.
  if (r.residents_count) {
    stats.push({
      label: 'Residents on Nextdoor',
      value: String(r.residents_count),
    });
  }
  if (r.homeowners_pct) {
    stats.push({ label: 'Owner-occupied', value: String(r.homeowners_pct) });
  }
  if (r.avg_age) {
    stats.push({ label: 'Median adult age', value: String(r.avg_age) });
  }
  /*
   * `avg_income` is NOT here, deliberately and permanently. It is the same
   * fair-housing problem `community-reasons.ts` refuses it for: household income
   * on a neighbourhood page steers buyers by proxy. The column exists; it does
   * not ship.
   *
   * `median_home_value` is absent because it is NULL on all 8,679 rows, not
   * because of a rule. If a future seed populates it, it belongs here.
   */

  return {
    id: r.id,
    slug: r.slug,
    name: r.name.trim(),
    city: r.city ?? '',
    state: r.state ?? '',
    heroUrl: publicCoverImageUrl(r.cover_storage_path),
    ...(r.description ? { blurb: r.description } : {}),
    topReasons,
    moreReasons,
    stats,
    interests: (r.interests ?? []).filter((x: unknown): x is string => typeof x === 'string'),
  };
}
