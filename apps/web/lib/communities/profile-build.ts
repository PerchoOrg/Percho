/**
 * A community's profile, computed (phase340).
 *
 * phase339 put the one-screen explore page on one community from a document
 * researched by hand. Owner, on seeing it: "可以 apply to all other
 * communities". Nobody researches 22,730 communities, so this builds the same
 * document from what Percho already holds for every one of them:
 *
 *   ranks      the nearest school at each level against every Georgia school;
 *              the city's home value and five-year growth against metro
 *              Atlanta's cities; the community's size against its city's
 *   homeValue  the city's typical home value, year by year, against the metro
 *   words      what residents call the place, by how rare each word is nearby
 *   verdict    the few of those findings strong enough to lead the page
 *   links      its own site (or its builder's), Nextdoor, Reddit, Google Maps,
 *              Zillow, and its nearby schools on GreatSchools (phase366)
 *
 * What only research finds — what the dues cover, a ZIP's own price line —
 * stays in `scripts/admin/community-profiles/<slug>.json` and is laid over the
 * computed blocks by `mergeProfile`, block by block.
 *
 * Pure: the caller (`scripts/admin/upsert-community-profile.ts`) does the
 * reading and the writing. Relative imports only, so that script can load this
 * without Next's path aliases.
 *
 * THREE THINGS THIS DOES NOT SAY, ON PURPOSE
 *
 * · A school here is a NEARBY one, never the assigned one. `attendance_zones`
 *   has no polygons (`lib/schools/map-pins.ts`), and the tour narration is
 *   already forbidden attendance phrasing (`school-language.ts`). The ranks
 *   block carries that sentence in its `note`.
 * · No verdict line is ever a low school score. A neighbourhood's page telling
 *   a buyer to think twice because of its schools is steering; the rank is
 *   drawn, neutrally, on the track, and that is all.
 * · The words block is about the PLACE. Residents also call their
 *   neighbourhoods "Family Friendly", "Safe", "Diversity", "Kids", "Young" —
 *   words about who lives there, which a page must not rank or lead with — and
 *   "Nice", "Pleasant", "Atmosphere", which say nothing. `PLACE_WORDS` is the
 *   list of what may be charted; everything else is left out.
 */

import type { StoredCommunityProfile } from '../zod/community-profile';
import { CITY_DISTRICTS, CITY_SITES, COUNTY_LINKS, REDFIN_CITIES } from './local-links';

// ─── inputs ─────────────────────────────────────────────────────────────────

export interface BuildCommunity {
  slug: string;
  /** For the search links (Maps, Zillow, Reddit); without it they are left out. */
  name?: string;
  /** A builder selling here: its name labels the website link. */
  builder?: string | null;
  city: string | null;
  county: string | null;
  lat: number | null;
  lng: number | null;
  residents_count: string | number | null;
  attributes: string[] | null;
  nextdoor_url: string | null;
  website: string | null;
  /**
   * Schools the community's own place list names (`community_pois`), which is
   * what its film visits. Preferred over the nearest, so the page and the film
   * name the same schools.
   */
  schoolNames?: readonly string[];
}

export type SchoolLevel = 'elementary' | 'middle' | 'high';

export interface BuildSchool {
  name: string;
  level: SchoolLevel;
  lat: number;
  lng: number;
  /** % proficient or above on Georgia Milestones. */
  pct: number;
}

/** `scripts/admin/data/zhvi-ga.json`, written by `import-zhvi.ts`. */
export interface ZhviExtract {
  /** The newest month in the file, YYYY-MM-DD. */
  asOf: string;
  metro: { name: string; series: ValuePoint[] };
  cities: Array<{ city: string; county: string; metroAtlanta: boolean; series: ValuePoint[] }>;
}
interface ValuePoint {
  year: number;
  value: number;
}

/** What a month of owning costs in a county, from `area_metrics`. */
export interface CountyCosts {
  taxRatePct?: { value: number; estimated: boolean };
  electric?: { value: number; estimated: boolean };
  water?: { value: number; estimated: boolean };
  trash?: { value: number; estimated: boolean };
}

type Events = NonNullable<StoredCommunityProfile['events']>;

/**
 * What `scripts/admin/import-community-safety.ts` looked up for one community:
 * facts about the place, from FEMA and OpenStreetMap. No crime figure — see
 * `packages/shared/src/community-profile.ts`.
 */
export interface SafetyFacts {
  /** The closest hospital that takes emergencies, straight-line. */
  hospital?: { name: string; miles: number };
  fire?: { name: string; miles: number };
  /** FEMA's flood zone at the community's map point. */
  flood?: { zone: string; subtype: string; sfha: boolean };
}

/**
 * What `scripts/admin/import-community-values.ts` read from a county's public
 * parcel records for one community: the homes whose lots sit inside its
 * boundary, and the median of what the county appraises them at.
 */
export interface ValueFacts {
  /** "Gwinnett" — whose appraisal it is. */
  county: string;
  /** Homes inside the boundary that the median is of. */
  homes: number;
  /** USD, the county's appraised value of the median home. */
  median: number;
  /** The tax year the county's file carries, where it says. */
  taxYear?: number;
}

/**
 * What `scripts/admin/import-community-highway.ts` measured for one community:
 * the drive from its point to the quickest highway on-ramp, without traffic.
 */
export interface HighwayFacts {
  /** "I-85", "GA-400" */
  road: string;
  minutes: number;
  /** By road. */
  miles: number;
}

export interface BuildInputs {
  communities: readonly BuildCommunity[];
  schools: readonly BuildSchool[];
  zhvi: ZhviExtract;
  /** Keyed by lower-case county name. */
  costs: ReadonlyMap<string, CountyCosts>;
  /** Keyed by lower-case city name. */
  events: ReadonlyMap<string, { source: string; events: Events }>;
  /** Keyed by slug. Only the communities someone ran the import for. */
  safety?: ReadonlyMap<string, SafetyFacts>;
  /** Keyed by slug. Only the communities someone ran the import for. */
  values?: ReadonlyMap<string, ValueFacts>;
  /** Keyed by slug. Only the communities someone ran the import for. */
  highways?: ReadonlyMap<string, HighwayFacts>;
  /** The day the figures were gathered, YYYY-MM-DD. */
  asOf: string;
}

// ─── limits ─────────────────────────────────────────────────────────────────

/** A school further than this is not "the nearest school" in any useful sense. */
const MAX_SCHOOL_MILES = 10;
/**
 * The words that describe a place — what is there, how it is kept, how it
 * sounds. Nextdoor's vocabulary, minus the words about the people who live
 * there and the words that say nothing (see the header).
 */
const PLACE_WORDS: ReadonlySet<string> = new Set([
  'Architecture',
  'Beautiful',
  'Birds',
  'Charm',
  'Clean',
  'Convenient',
  'Creek',
  'Dog Friendly',
  'Downtown',
  'Events',
  'Freeway Access',
  'Gardens',
  'Gated',
  'Golf',
  'Green',
  'Hiking',
  'Hills',
  'Historic',
  'Lake',
  'Landscaping',
  'Nature',
  'Parks',
  'Peaceful',
  'Privacy',
  'Quaint',
  'Quiet',
  'Restaurants',
  'River',
  'Running',
  'Rural',
  'Scenery',
  'Secluded',
  'Shopping',
  'Sidewalks',
  'Stores',
  'Tennis',
  'Trails',
  'Transportation',
  'Trees',
  'Urban',
  'View',
  'Walkability',
  'Walking',
  'Well Maintained',
  'Wildlife',
  'Woods',
  'Yards',
]);
/** A city with fewer communities than this is compared against the whole state instead. */
const MIN_SCOPE = 30;
/** Above this many members a community is big enough to say so (the 95th percentile). */
const BIG_COMMUNITY = 4000;
const LEVELS: readonly SchoolLevel[] = ['elementary', 'middle', 'high'];
const LEVEL_LABEL: Record<SchoolLevel, string> = {
  elementary: 'Elementary',
  middle: 'Middle',
  high: 'High',
};
/** Place words too slight to open a page with. They are charted; they do not lead. */
const SLIGHT_WORDS: ReadonlySet<string> = new Set([
  'Architecture',
  'Birds',
  'Clean',
  'Events',
  'Green',
  'Hills',
  'Landscaping',
  'Quaint',
  'Running',
  'Stores',
  'Transportation',
  'View',
  'Yards',
]);

// ─── small things ───────────────────────────────────────────────────────────

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const count = (n: number) => n.toLocaleString('en-US');

/** "$747K", "$1.2M" */
export function usdShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `$${Math.round(value / 1000)}K`;
}

/** "1,050" → 1050. The column is text. */
function number(v: string | number | null): number | null {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Great-circle miles between two points. */
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Where a value stands among `sorted` (largest first): its rank, and the share ranked below it. */
function standing(sorted: readonly number[], value: number) {
  const above = sorted.filter((v) => v > value).length;
  const below = sorted.filter((v) => v < value).length;
  return { rank: above + 1, of: sorted.length, percentile: (below / sorted.length) * 100 };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "Lake Windward Elementary School" → "Lake Windward", within a row's note. */
function shortSchool(name: string): string {
  const short = name.replace(/\s+(Elementary|Middle|High)?\s*School$/i, '').trim() || name;
  return short.length > 20 ? `${short.slice(0, 19)}…` : short;
}

// ─── context: everything that is the same for every community ───────────────

interface WordScope {
  /** "342 Alpharetta communities" */
  label: string;
  size: number;
  uses: ReadonlyMap<string, number>;
}

export interface BuildContext {
  inputs: BuildInputs;
  schools: Record<SchoolLevel, { all: BuildSchool[]; scores: number[] }>;
  words: { byCity: ReadonlyMap<string, WordScope>; all: WordScope };
  sizes: ReadonlyMap<string, number[]>;
  zhvi: {
    byCity: ReadonlyMap<string, ZhviExtract['cities'][number]>;
    /** Newest values of metro Atlanta's cities, largest first. */
    values: number[];
    /** Five-year growth of the same cities, as a ratio, largest first. */
    growth: number[];
  };
}

const newest = (s: readonly ValuePoint[]) => s[s.length - 1];
const yearsBack = (s: readonly ValuePoint[], n: number) => {
  const last = newest(s);
  return last ? s.find((p) => p.year === last.year - n) : undefined;
};
/** Growth over `n` years as a ratio (0.34 = +34%), or null without both ends. */
function growthOver(s: readonly ValuePoint[], n: number): number | null {
  const a = yearsBack(s, n);
  const b = newest(s);
  return a && b ? b.value / a.value - 1 : null;
}

function wordScope(label: string, lists: readonly string[][]): WordScope {
  const uses = new Map<string, number>();
  for (const list of lists) {
    for (const w of new Set(list)) uses.set(w, (uses.get(w) ?? 0) + 1);
  }
  return { label: `${count(lists.length)} ${label} communities`, size: lists.length, uses };
}

export function buildContext(inputs: BuildInputs): BuildContext {
  const schools = Object.fromEntries(
    LEVELS.map((level) => {
      const all = inputs.schools.filter((s) => s.level === level);
      return [level, { all, scores: all.map((s) => s.pct).sort((a, b) => b - a) }];
    }),
  ) as BuildContext['schools'];

  // A community counts toward a word's share when it stated anything at all —
  // "17% say Convenient" is of the communities that were asked.
  const lists = inputs.communities
    .map((c) => ({
      city: c.city,
      words: (c.attributes ?? []).map((w) => w.trim()).filter(Boolean),
    }))
    .filter((c) => c.words.length > 0);
  const everywhere = wordScope(
    'Georgia',
    lists.map((c) => c.words),
  );
  const cityLists = new Map<string, { name: string; lists: string[][] }>();
  for (const c of lists) {
    if (!key(c.city)) continue;
    const entry = cityLists.get(key(c.city)) ?? { name: (c.city ?? '').trim(), lists: [] };
    entry.lists.push(c.words);
    cityLists.set(key(c.city), entry);
  }
  const byCity = new Map<string, WordScope>();
  for (const [k, { name, lists: l }] of cityLists) {
    if (l.length >= MIN_SCOPE) byCity.set(k, wordScope(name, l));
  }

  const sizes = new Map<string, number[]>();
  for (const c of inputs.communities) {
    const n = number(c.residents_count);
    if (n === null || !key(c.city)) continue;
    sizes.set(key(c.city), [...(sizes.get(key(c.city)) ?? []), n]);
  }
  for (const list of sizes.values()) list.sort((a, b) => b - a);

  const metroCities = inputs.zhvi.cities.filter((c) => c.metroAtlanta);
  return {
    inputs,
    schools,
    words: { byCity, all: everywhere },
    sizes,
    zhvi: {
      byCity: new Map(inputs.zhvi.cities.map((c) => [key(c.city), c])),
      values: metroCities.map((c) => newest(c.series)?.value ?? 0).sort((a, b) => b - a),
      growth: metroCities
        .map((c) => growthOver(c.series, 5))
        .filter((g): g is number => g !== null)
        .sort((a, b) => b - a),
    },
  };
}

// ─── one community ──────────────────────────────────────────────────────────

type Profile = StoredCommunityProfile;
type RankRow = NonNullable<Profile['ranks']>['rows'][number];

/** "Matt Elementary" and "Matt Elementary School" are one school. */
const schoolKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+school$/, '')
    .trim();

/** The school the page names at each level, nearest first. */
function nearestSchools(
  c: BuildCommunity,
  ctx: BuildContext,
): Array<{ level: SchoolLevel; school: BuildSchool }> {
  if (c.lat === null || c.lng === null) return [];
  const named = new Set((c.schoolNames ?? []).map(schoolKey));
  const out: Array<{ level: SchoolLevel; school: BuildSchool }> = [];
  for (const level of LEVELS) {
    // The nearest of the schools the community's own list names, else the
    // nearest of all.
    const all = ctx.schools[level].all;
    const listed = all.filter((s) => named.has(schoolKey(s.name)));
    let near: BuildSchool | undefined;
    let nearMiles = MAX_SCHOOL_MILES;
    for (const s of listed.length > 0 ? listed : all) {
      const miles = milesBetween(c.lat, c.lng, s.lat, s.lng);
      if (miles < nearMiles) {
        near = s;
        nearMiles = miles;
      }
    }
    if (near) out.push({ level, school: near });
  }
  return out;
}

function schoolRows(c: BuildCommunity, ctx: BuildContext): RankRow[] {
  const rows: RankRow[] = [];
  for (const { level, school: near } of nearestSchools(c, ctx)) {
    const at = standing(ctx.schools[level].scores, near.pct);
    rows.push({
      group: 'Schools',
      label: LEVEL_LABEL[level],
      note: shortSchool(near.name),
      // `nearestSchools` only returns a school for a community with a point.
      ...(c.lat !== null && c.lng !== null
        ? { distance: `${round1(milesBetween(c.lat, c.lng, near.lat, near.lng))} mi` }
        : {}),
      rank: `#${count(at.rank)}`,
      of: `of ${count(at.of)} in GA`,
      percentile: round1(at.percentile),
      tile: `#${count(at.rank)}`,
    });
  }
  return rows;
}

function homeRows(c: BuildCommunity, ctx: BuildContext): RankRow[] {
  const city = ctx.zhvi.byCity.get(key(c.city));
  const value = city && newest(city.series)?.value;
  // Ranked against metro Atlanta's cities, so only a city that is one of them.
  if (!city?.metroAtlanta || !value) return [];
  const at = standing(ctx.zhvi.values, value);
  const rows: RankRow[] = [
    {
      group: 'Homes',
      label: 'Home value',
      note: usdShort(value),
      rank: `#${at.rank}`,
      of: `of ${at.of} metro cities`,
      percentile: round1(at.percentile),
      tile: `#${at.rank}`,
    },
  ];
  const growth = growthOver(city.series, 5);
  if (growth !== null) {
    const g = standing(ctx.zhvi.growth, growth);
    rows.push({
      group: 'Homes',
      label: '5-year growth',
      note: `${growth >= 0 ? '+' : ''}${Math.round(growth * 100)}%`,
      rank: `#${g.rank}`,
      of: `of ${g.of} metro cities`,
      percentile: round1(g.percentile),
    });
  }
  return rows;
}

function sizeRow(c: BuildCommunity, ctx: BuildContext): RankRow[] {
  const members = number(c.residents_count);
  const peers = ctx.sizes.get(key(c.city));
  if (members === null || !peers || peers.length < MIN_SCOPE) return [];
  const at = standing(peers, members);
  return [
    {
      group: 'People',
      label: 'Size',
      note: `${count(members)} on Nextdoor`,
      rank: `#${at.rank}`,
      of: `of ${count(at.of)} in city`,
      percentile: round1(at.percentile),
    },
  ];
}

/** "Up 60% since 2020. Flat since 2024." */
function moved(growth: number, since: number): string {
  const pct = Math.round(Math.abs(growth) * 100);
  if (pct < 2) return `Flat since ${since}.`;
  return `${growth > 0 ? 'Up' : 'Down'} ${pct}% since ${since}.`;
}

function homeValue(c: BuildCommunity, ctx: BuildContext): Profile['homeValue'] {
  const city = ctx.zhvi.byCity.get(key(c.city));
  const last = city && newest(city.series);
  if (!city || !last) return undefined;
  const metro = new Map(ctx.inputs.zhvi.metro.series.map((p) => [p.year, p.value]));
  const series = city.series
    .filter((p) => metro.has(p.year))
    .map((p) => ({ year: p.year, value: p.value, baseline: metro.get(p.year) ?? p.value }));
  const long = growthOver(city.series, 6);
  const recent = growthOver(city.series, 2);
  if (series.length < 3 || long === null || recent === null) return undefined;

  const costs = ctx.inputs.costs.get(key(c.county));
  const rows: NonNullable<NonNullable<Profile['homeValue']>['holding']>['rows'] = [];
  if (costs?.taxRatePct) {
    rows.push({
      label: 'Property tax',
      usd: Math.round((last.value * costs.taxRatePct.value) / 100 / 12),
      note: `${costs.taxRatePct.estimated ? 'est. ' : ''}${costs.taxRatePct.value}%`,
    });
  }
  for (const [label, cost] of [
    ['Electricity', costs?.electric],
    ['Water', costs?.water],
    ['Trash', costs?.trash],
  ] as const) {
    if (cost)
      rows.push({
        label,
        usd: Math.round(cost.value),
        ...(cost.estimated ? { note: 'est.' } : {}),
      });
  }
  const total = rows.reduce((a, r) => a + r.usd, 0);

  return {
    area: city.city,
    display: usdShort(last.value),
    change: `${long >= 0 ? '+' : '−'}${Math.round(Math.abs(long) * 100)}% since ${last.year - 6}`,
    headline: `${moved(long, last.year - 6)} ${moved(recent, last.year - 2)}`,
    baseline: ctx.inputs.zhvi.metro.name,
    series,
    // Tax is most of it; without the tax row the total would mislead.
    ...(costs?.taxRatePct && rows.length > 1
      ? {
          holding: {
            display: `≈ $${count(Math.round(total / 10) * 10)}`,
            basis: `a month to hold the typical ${city.city} home, before mortgage and HOA`,
            rows,
          },
        }
      : {}),
  };
}

function words(c: BuildCommunity, ctx: BuildContext): Profile['words'] {
  const mine = [...new Set((c.attributes ?? []).map((w) => w.trim()))].filter((w) =>
    PLACE_WORDS.has(w),
  );
  if (mine.length === 0) return undefined;
  const scope = ctx.words.byCity.get(key(c.city)) ?? ctx.words.all;
  const rows = mine
    .map((word) => ({ word, share: (scope.uses.get(word) ?? 1) / scope.size }))
    .sort((a, b) => a.share - b.share || a.word.localeCompare(b.word))
    .slice(0, 5);
  const lead = rows[0];
  if (!lead) return undefined;
  const oneIn = Math.round(1 / lead.share);
  return {
    lead: lead.word,
    leadNote:
      oneIn >= 3
        ? `1 in ${oneIn} communities say it`
        : `${Math.round(lead.share * 100)}% of communities say it`,
    scope: scope.label,
    rows: rows.map((r) => ({ word: r.word, pct: Math.max(1, Math.round(r.share * 100)) })),
  };
}

function verdict(
  c: BuildCommunity,
  ctx: BuildContext,
  parts: { words: Profile['words'] },
): Profile['verdict'] {
  const good: string[] = [];
  const watch: string[] = [];

  // No line about schools. It used to lead with the best nearby school when
  // that was in the state's top tenth ("Top-5% middle school nearby"); the
  // schools tile directly under it says the same thing with the school's name
  // (owner 2026-11-22: "去掉 … top school绿色标记文字 和下面的内容重复了").

  // A word few of the city's communities use.
  const lead = parts.words?.rows[0];
  const inCity = ctx.words.byCity.has(key(c.city));
  if (lead && inCity && lead.pct <= 25 && lead.word.length <= 14 && !SLIGHT_WORDS.has(lead.word)) {
    good.push(`Residents say “${lead.word}”`);
  }

  // Nothing about the city's home values: every community in a city would say
  // the same line, and the verdict is about this one. That is the tile's job.

  const members = number(c.residents_count);
  if (members !== null && members >= BIG_COMMUNITY) watch.push(`Big: ${count(members)} neighbours`);

  return { good, watch };
}

/** The computed profile, or null when there is nothing to draw. */
/** The links pill row's labels stop at 18 characters (`lib/zod/community-profile.ts`). */
const linkLabel = (text: string) => (text.length > 18 ? `${text.slice(0, 17).trimEnd()}…` : text);
const LEVEL_ABBR: Record<SchoolLevel, string> = { elementary: 'ES', middle: 'MS', high: 'HS' };

/**
 * Places a buyer can go on from the page (owner 2026-11-21: "多加一些link
 * 类似Nextdoor的 可以让人去explore"; Zillow included on his "都加").
 *
 * Search links, not guessed pages: Maps, Zillow, Reddit and GreatSchools each
 * take a free-text query, so a link resolves to whatever that site holds for
 * the name rather than to a URL that may not exist. Redfin has no such URL —
 * its pages need an id — so it is linked by city, from the ids in
 * `local-links.ts` (owner 2026-11-22: "链接里没看到redfin啥的 … 尽量全"), as are
 * Trulia and Homes.com, whose city pages follow the city's name.
 * School links go to GreatSchools because the stored school websites (NCES)
 * are http and often dead.
 */
function profileLinks(
  c: BuildCommunity,
  schools: ReadonlyArray<{ level: SchoolLevel; school: BuildSchool }>,
): NonNullable<Profile['links']> {
  const links: NonNullable<Profile['links']> = [];
  const county = COUNTY_LINKS[key(c.county)];
  if (c.website?.startsWith('https://'))
    links.push({
      group: 'Community',
      // "The Providence Group" → "Providence Group": the article is what
      // pushed it past the pill's 18 characters.
      label: linkLabel(c.builder?.trim().replace(/^the\s+/i, '') || 'Website'),
      url: c.website,
    });
  if (c.nextdoor_url?.startsWith('https://'))
    links.push({ group: 'Community', label: 'Nextdoor', url: c.nextdoor_url });
  const name = c.name?.trim();
  if (name) {
    const where = [name, c.city, 'GA'].filter(Boolean).join(', ');
    const q = encodeURIComponent;
    links.push({
      group: 'Community',
      label: 'Reddit',
      url: `https://www.reddit.com/search/?q=${q(`"${name}" ${c.city ?? 'Georgia'}`)}`,
    });
    links.push({
      group: 'Community',
      label: 'Google Maps',
      url: `https://www.google.com/maps/search/?api=1&query=${q(where)}`,
    });
    links.push({
      group: 'Community',
      label: 'YouTube',
      url: `https://www.youtube.com/results?search_query=${q(`${name} ${c.city ?? ''} GA`.replace(/\s+/g, ' '))}`,
    });
    const zillowSlug = `${name} ${c.city ?? ''} GA`
      .replace(/[^A-Za-z0-9 ]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-');
    links.push({
      group: 'Homes',
      label: 'Homes on Zillow',
      url: `https://www.zillow.com/homes/${zillowSlug}_rb/`,
    });
  }
  // By city, and only for a city whose pages were looked at: these three are
  // addressed by the city's name or id, not by a search.
  const redfin = REDFIN_CITIES[key(c.city)];
  if (redfin && c.city) {
    links.push({ group: 'Homes', label: 'Redfin', url: redfin });
    links.push({
      group: 'Homes',
      label: 'Trulia',
      url: `https://www.trulia.com/GA/${c.city.trim().replace(/\s+/g, '_')}/`,
    });
    links.push({
      group: 'Homes',
      label: 'Homes.com',
      url: `https://www.homes.com/${c.city.trim().toLowerCase().replace(/\s+/g, '-')}-ga/`,
    });
  }
  if (county) links.push({ group: 'Homes', label: 'Property records', url: county.assessor });
  for (const { level, school } of schools) {
    const short = school.name.replace(/\s+(Elementary|Middle|High)?\s*School$/i, '').trim();
    links.push({
      group: 'Schools',
      label: linkLabel(`${short} ${LEVEL_ABBR[level]}`),
      url: `https://www.greatschools.org/search/search.page?q=${encodeURIComponent(school.name)}&state=GA`,
    });
  }
  const district = CITY_DISTRICTS[key(c.city)] ?? county?.district;
  if (district) links.push({ group: 'Schools', label: 'School district', url: district });
  // Crime figures are not on the page; the agencies' own map is one tap away
  // (owner 2026-11-22). LexisNexis' Community Crime Map is where Georgia's
  // police departments and sheriffs publish theirs, searched by place.
  if (c.city)
    links.push({
      group: 'Safety',
      label: 'Crime map',
      url: `https://communitycrimemap.com/?address=${encodeURIComponent(`${c.city}, GA`)}`,
    });
  // FEMA's own viewer, opened on the community's point: the zone the safety
  // block names is this map's, and a lot's own zone is read off it.
  if (c.lat !== null && c.lng !== null)
    links.push({
      group: 'Safety',
      label: 'FEMA flood map',
      url: `https://hazards-fema.maps.arcgis.com/apps/webappviewer/index.html?id=8b0adb51996444d4879338b5529aa9cd&center=${c.lng},${c.lat}&level=15`,
    });
  const site = CITY_SITES[key(c.city)];
  if (site && c.city) {
    // "City of Peachtree Corners" is past the pill's 18 characters.
    const full = `City of ${c.city}`;
    links.push({ group: 'City', label: full.length <= 18 ? full : linkLabel(c.city), url: site });
  }
  if (county && c.county)
    links.push({ group: 'City', label: linkLabel(`${c.county} County`), url: county.site });
  // Walk Score reads a point, so it scores this community rather than its city.
  if (c.lat !== null && c.lng !== null)
    links.push({
      group: 'City',
      label: 'Walk Score',
      url: `https://www.walkscore.com/score/loc/lat=${c.lat}/lng=${c.lng}`,
    });
  return links;
}

const FLOOD_NOTE = (zone: string) => `Zone ${zone}`.slice(0, 12);

/**
 * The safety block: how far help is, and FEMA's flood zone at the community's
 * point. Facts about the place; nothing here is a crime figure.
 */
function safety(c: BuildCommunity, ctx: BuildContext): Profile['safety'] | undefined {
  const facts = ctx.inputs.safety?.get(c.slug);
  if (!facts) return undefined;
  const rows: NonNullable<Profile['safety']>['rows'] = [];
  if (facts.hospital)
    rows.push({
      label: 'Hospital',
      name: facts.hospital.name.slice(0, 48),
      note: `${round1(facts.hospital.miles)} mi`,
    });
  if (facts.fire)
    rows.push({
      label: 'Fire station',
      name: facts.fire.name.slice(0, 48),
      note: `${round1(facts.fire.miles)} mi`,
    });
  if (facts.flood) {
    // FEMA's own three readings: inside the 1%-a-year floodplain (insurance is
    // required on a federally backed loan), the 0.2% band, or neither. It is
    // read at ONE point, so inside the floodplain is said of a part, never of
    // the whole: Windermere's point sits by a creek in Zone AE and most of its
    // lots do not.
    const name = facts.flood.sfha
      ? 'Part is in a flood zone'
      : /0\.2 PCT/i.test(facts.flood.subtype)
        ? 'Moderate flood hazard'
        : /MINIMAL/i.test(facts.flood.subtype)
          ? 'Minimal flood hazard'
          : 'Flood hazard not mapped';
    rows.push({ label: 'Flood zone', name, note: FLOOD_NOTE(facts.flood.zone) });
  }
  return rows.length > 0 ? { rows } : undefined;
}

/** Fewer homes than this inside a boundary is a sample, not a community. */
const MIN_VALUED_HOMES = 20;
/**
 * What a county's appraisal has to be multiplied by to stand for a sale price.
 * Gwinnett's and Forsyth's current files already sit within a few percent of
 * what homes sell for (Edinburgh: $1.215M appraised, $1.19M median sale;
 * St Marlo: $1.31M against $1.39M), so they are printed as they are. Fulton's
 * open parcel file is tax year 2023 and well under the market: Windward's
 * median appraisal is $545K against a $900K median sale, Medlock Bridge's
 * $532K against $906K (Redfin, August–October 2026) — 1.65 and 1.70.
 */
const APPRAISAL_TO_MARKET: Record<string, number> = { fulton: 1.67 };

/**
 * What a home in this community is worth, from the county's own records —
 * an estimate until the listing feed brings sold prices, and rounded like
 * one: to $10K, never to the dollar.
 */
function estimate(c: BuildCommunity, ctx: BuildContext): Profile['estimate'] | undefined {
  const facts = ctx.inputs.values?.get(c.slug);
  if (!facts || facts.homes < MIN_VALUED_HOMES || !(facts.median > 0)) return undefined;
  const scale = APPRAISAL_TO_MARKET[key(facts.county)];
  const value = Math.round((facts.median * (scale ?? 1)) / 10_000) * 10_000;
  const year = facts.taxYear ? ` ${facts.taxYear}` : '';
  const count = facts.homes.toLocaleString('en-US');
  return {
    display: usdShort(value),
    label: 'est. home value',
    basis: scale
      ? `Median${year} county appraisal of ${count} homes, scaled to recent sale prices`
      : `Median${year} county appraisal of ${count} homes`,
  };
}

/**
 * How long the drive to the highway is — never under a minute, and the miles
 * and "without traffic" beside it on the page, since the figure is a quiet
 * road's.
 */
function highway(c: BuildCommunity, ctx: BuildContext): Profile['highway'] | undefined {
  const facts = ctx.inputs.highways?.get(c.slug);
  if (!facts || !(facts.minutes > 0)) return undefined;
  return {
    display: `${Math.max(1, Math.round(facts.minutes))} min`,
    label: `to ${facts.road}`,
    basis: `Drive to the nearest ${facts.road} on-ramp, ${round1(facts.miles)} mi, without traffic`,
  };
}

export function buildProfile(c: BuildCommunity, ctx: BuildContext): Profile | null {
  const schools = schoolRows(c, ctx);
  const homes = homeRows(c, ctx);
  const rankRows = [...schools, ...homes, ...sizeRow(c, ctx)];
  const value = homeValue(c, ctx);
  const said = words(c, ctx);
  if (rankRows.length === 0 && !value && !said) return null;

  const cityEvents = ctx.inputs.events.get(key(c.city));
  const links = profileLinks(c, nearestSchools(c, ctx));
  const safe = safety(c, ctx);
  const worth = estimate(c, ctx);
  const ramp = highway(c, ctx);

  const sources: Profile['sources'] = [];
  if (schools.length > 0) sources.push({ name: 'Georgia Milestones' });
  if (said || c.nextdoor_url || number(c.residents_count) !== null)
    sources.push({ name: 'Nextdoor' });
  if (value || homes.length > 0) sources.push({ name: 'Zillow Home Value Index' });
  if (value?.holding) sources.push({ name: 'Percho county estimates' });
  if (cityEvents) sources.push({ name: cityEvents.source });
  if (safe) sources.push({ name: 'FEMA National Flood Hazard Layer' });
  if (safe || ramp) sources.push({ name: 'OpenStreetMap' });
  if (worth)
    sources.push({ name: `${ctx.inputs.values?.get(c.slug)?.county} County tax assessor` });

  return {
    asOf: ctx.inputs.asOf,
    verdict: verdict(c, ctx, { words: said }),
    ...(rankRows.length > 0
      ? {
          ranks: {
            rows: rankRows,
            ...(schools.length > 0
              ? { note: 'Nearby schools at each level — not an attendance zone.' }
              : {}),
          },
        }
      : {}),
    ...(value ? { homeValue: value } : {}),
    ...(worth ? { estimate: worth } : {}),
    ...(ramp ? { highway: ramp } : {}),
    ...(said ? { words: said } : {}),
    ...(cityEvents ? { events: cityEvents.events } : {}),
    ...(safe ? { safety: safe } : {}),
    ...(links.length > 0 ? { links } : {}),
    sources,
  };
}

/**
 * Research laid over computation, block by block.
 *
 * A researched block replaces the computed one whole — a hand-written ranks
 * block knows things (two elementary schools, a ZIP's own value) that a merge
 * row by row would dilute. Sources are the union: the page names everyone it
 * drew from.
 */
export function mergeProfile(
  computed: Profile | null,
  researched: Partial<Profile> | null,
): Profile | null {
  if (!researched) return computed;
  const base: Partial<Profile> = computed ?? {};
  const names = new Set<string>();
  const sources = [...(researched.sources ?? []), ...(base.sources ?? [])].filter((s) => {
    if (names.has(s.name)) return false;
    names.add(s.name);
    return true;
  });
  // Links are the one block that adds up rather than replaces: a researched
  // page (Windward's dues rules) sits beside the computed search links, not
  // instead of them (phase366). Researched first; a repeat by url or label,
  // and anything past the schema's twenty-four, is left out.
  const seen = new Set<string>();
  const links = [...(researched.links ?? []), ...(base.links ?? [])]
    .filter((l) => {
      if (seen.has(l.url) || seen.has(l.label)) return false;
      seen.add(l.url);
      seen.add(l.label);
      return true;
    })
    .slice(0, 24);
  const merged = { ...base, ...researched, sources, ...(links.length > 0 ? { links } : {}) };
  if (!merged.asOf || !merged.verdict || sources.length === 0) return null;
  return { ...merged, asOf: merged.asOf, verdict: merged.verdict, sources };
}
