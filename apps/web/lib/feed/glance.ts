/**
 * The place line and three figures the phone prints above a feed card
 * (phase378) — what a film cannot show: what homes cost, how the schools
 * stand, how far Atlanta is.
 *
 * Owner 2026-11-23, of the header that used to sit above the card: "感觉还是以
 * 填充为主 信息本身也和卡片有重合". It repeated the card's name; this says what the
 * card does not. Every figure is one the place's Explore page already shows,
 * read from the same stored profile, so the card and the page cannot disagree.
 *
 * Worded here rather than on the phone so a figure can be swapped or reworded
 * without an app release. Real or absent: a place with no value for a slot
 * gets fewer cells.
 *
 * One number a figure, never a range (owner, 2026-11-26: 「卡片上三个数字不要
 * 区间 给一个数字平均值就行」): where the page has several values — a school
 * at each level, a drive off-peak and at rush — the figure is their mean.
 * The page itself still shows each one.
 *
 * Pure — the callers hand in rows they have already read.
 */

import type { CityFundamentals } from '@percho/shared/city';
import type { CommunityProfile } from '@percho/shared/community-profile';
import type { GlanceCell, PlaceGlance } from '@percho/shared/glance';
import { rankShare } from '@percho/shared/rank-share';

/** Five Points — where "downtown Atlanta" is measured from. */
const DOWNTOWN = { lat: 33.7537, lng: -84.3901 };
const EARTH_MILES = 3958.8;
const COMPASS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Straight-line miles from downtown and the compass point the place lies on. */
export function fromDowntown(at: { lat: number; lng: number }): { miles: number; side: string } {
  const dLat = rad(at.lat - DOWNTOWN.lat);
  const dLng = rad(at.lng - DOWNTOWN.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(DOWNTOWN.lat)) * Math.cos(rad(at.lat)) * Math.sin(dLng / 2) ** 2;
  const miles = 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
  const y = Math.sin(dLng) * Math.cos(rad(at.lat));
  const x =
    Math.cos(rad(DOWNTOWN.lat)) * Math.sin(rad(at.lat)) -
    Math.sin(rad(DOWNTOWN.lat)) * Math.cos(rad(at.lat)) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  const side = COMPASS[Math.round(((bearing + 360) % 360) / 45) % 8] ?? 'north';
  return { miles, side };
}

type Point = { lat?: number | null; lng?: number | null };

const pointOf = (p: Point) => (p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null);

const SCHOOLS_GROUP = 'Schools';

const mean = (values: readonly number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/** "$747K" over the area it is the typical value of. */
function homesCell(homeValue: CommunityProfile['homeValue'] | undefined): GlanceCell | null {
  if (!homeValue) return null;
  return { value: homeValue.display, label: `${homeValue.area} homes`, topic: 'potential' };
}

/**
 * Where the nearby schools stand among Georgia's, as the Explore tile words
 * each one — "Top 1%", "Top 2%", "Top 7%" — averaged across the levels:
 * "Top 3%". Never better than 1%, as no share is.
 */
function schoolsCell(ranks: CommunityProfile['ranks'] | undefined): GlanceCell | null {
  const rows = (ranks?.rows ?? []).filter((r) => r.group === SCHOOLS_GROUP).slice(0, 3);
  if (rows.length === 0) return null;
  const share = Math.max(1, Math.round(mean(rows.map(rankShare))));
  return {
    value: `Top ${share}%`,
    label: rows.length === 1 ? 'school nearby' : 'schools nearby',
    topic: 'schools',
  };
}

/** Nothing for a place in downtown itself: "0 mi north" says nothing. */
function distanceCell(at: { lat: number; lng: number } | null): GlanceCell | null {
  if (!at) return null;
  const { miles, side } = fromDowntown(at);
  if (miles < 1.5) return null;
  return { value: `${Math.round(miles)} mi`, label: `${side} of Atlanta`, topic: 'convenience' };
}

/** "$649K", "$1.2M" — a community profile's own `display` form (`profile-build.ts`). */
function usdShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `$${Math.round(value / 1000)}K`;
}

const present = (cells: Array<GlanceCell | null>): GlanceCell[] =>
  cells.filter((c): c is GlanceCell => c !== null);

export function communityGlance(
  c: Point & { city: string; county?: string | null; profile: CommunityProfile | null },
): PlaceGlance | undefined {
  if (!c.city) return undefined;
  return {
    place: { lead: c.city, ...(c.county ? { rest: `${c.county} County` } : {}) },
    cells: present([
      homesCell(c.profile?.homeValue),
      schoolsCell(c.profile?.ranks),
      distanceCell(pointOf(c)),
    ]),
  };
}

/**
 * What a home is worth in the city, as the city's own page prints it under
 * Cost: the first "Median home value" row of its comparison with the state,
 * "$649,000" shortened to the figure's width. A row for a wider area keeps
 * its qualifier ("· county").
 *
 * Not the typical value its communities' cards carry: that is Zillow's and
 * this is the Census Bureau's, and a card's figure has to be the one its own
 * page shows.
 */
function medianHomeCell(compare: CityFundamentals['compare']): GlanceCell | null {
  const row = compare.rows.find((r) => /median home value/i.test(r.label));
  if (!row) return null;
  const scope = row.label.split('·')[1]?.trim();
  return {
    value: usdShort(row.city.value),
    label: scope ? `median home · ${scope}` : 'median home value',
    topic: 'cost',
  };
}

/** "Graduate in 4 years · class of 2025" → "graduate in 4 years". */
function measureLabel(measure: string): string {
  const head = (measure.split('·')[0] ?? '').trim();
  return head.charAt(0).toLowerCase() + head.slice(1);
}

/**
 * The city's own schools by its page's headline measure — the district and
 * state rows it is drawn against are left out. One school prints as the page
 * prints it; several print as their mean, so the figure is not the best
 * school's alone.
 */
function graduationCell(education: CityFundamentals['education']): GlanceCell | null {
  const own = education.rows.filter((r) => !r.baseline);
  const label = measureLabel(education.measure);
  const [only] = own;
  if (!only || !label) return null;
  if (own.length === 1) return { value: only.display, label, topic: 'schools' };
  return { value: `${Math.round(mean(own.map((r) => r.pct)))}%`, label, topic: 'schools' };
}

/**
 * The drive to downtown, between off-peak and rush hour as the city's
 * Convenience tile prints them. The off-peak figure alone would be the
 * flattering half.
 */
function driveCell(gettingAround: CityFundamentals['gettingAround']): GlanceCell | null {
  const row = gettingAround.find((g) => /^downtown atlanta/i.test(g.label));
  if (!row?.minutes) return null;
  const { min, max } = row.minutes;
  const miles = row.label.match(/(\d+)\s*mi\b/)?.[1];
  return {
    value: `${Math.round(mean([min, max]))} min`,
    label: miles ? `${miles} mi to downtown` : 'to downtown Atlanta',
    topic: 'convenience',
  };
}

export function cityGlance(
  c: Point & {
    name: string;
    county?: string | null;
    profile: Pick<
      CityFundamentals,
      'compare' | 'education' | 'gettingAround' | 'locationNote'
    > | null;
  },
): PlaceGlance | undefined {
  // The side the city's own page gives ("39 mi north of downtown Atlanta"), so
  // the card and the page say the same; measured only when that does not read.
  const at = pointOf(c);
  const noted = c.profile?.locationNote.match(/\bmi\s+(.+?)\s+of downtown Atlanta$/i)?.[1];
  const side = noted
    ? `${noted} of Atlanta`
    : at
      ? `${fromDowntown(at).side} of Atlanta`
      : undefined;
  const place = c.county
    ? { lead: `${c.county} County`, ...(side ? { rest: side } : {}) }
    : side
      ? { lead: `${side.charAt(0).toUpperCase()}${side.slice(1)}` }
      : null;
  if (!place) return undefined;
  return {
    place,
    cells: c.profile
      ? present([
          medianHomeCell(c.profile.compare),
          graduationCell(c.profile.education),
          driveCell(c.profile.gettingAround),
        ])
      : [],
  };
}
