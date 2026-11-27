/**
 * The place line and three figures the phone prints above a feed card
 * (phase378) — what a film cannot show: what homes cost, how the schools
 * stand, how far Atlanta is from a city and the highway from a community.
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
 * 区间 给一个数字平均值就行」). A community's schools are the range's top end,
 * not the mean (the same day: 「学校给区间上段 top 不要平均」): the best-standing
 * school nearby. A city's drive is the mean of off-peak and rush. The page
 * itself still shows each value.
 *
 * Schools are a letter since phase404.17 (owner 2026-11-27: 「用字母」) — the
 * scale and why it stops at B− are in `@percho/shared/school-grade`. A city's
 * is for its typical school, where it printed its top graduation rate: that
 * read 94.8%–98.4% on all seven cities.
 *
 * Pure — the callers hand in rows they have already read.
 */

import type { CityFundamentals } from '@percho/shared/city';
import type { CommunityProfile } from '@percho/shared/community-profile';
import type { GlanceCell, PlaceGlance } from '@percho/shared/glance';
import { rankShare } from '@percho/shared/rank-share';
import { gradeFigure, schoolGrade, typicalShare } from '@percho/shared/school-grade';

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

/**
 * What a home HERE is worth: the community's own estimate, under what it is
 * ("est. home value", "new homes from"). Owner 2026-11-27, of the city's value
 * on every card of a city's communities: 「应该写的是这个小区的price」, and of
 * the ones with no sold prices to read: 「先给一个估值 不要空着」.
 *
 * A community nobody has estimated still gets its city's or ZIP's typical
 * value, named as that: "$747K" over "Suwanee homes".
 */
function homesCell(profile: CommunityProfile | null): GlanceCell | null {
  if (profile?.estimate) {
    return { value: profile.estimate.display, label: profile.estimate.label, topic: 'potential' };
  }
  const homeValue = profile?.homeValue;
  if (!homeValue) return null;
  return { value: homeValue.display, label: `${homeValue.area} homes`, topic: 'potential' };
}

/**
 * Where the nearby schools stand among Georgia's, as the Explore tile words
 * each one — "Top 1%", "Top 2%", "Top 7%" — and the figure is for the best of
 * them, as a letter (owner 2026-11-27: 「用字母」; the scale is
 * `@percho/shared/school-grade`): "Grade A+" over "best school, top 1%". The
 * standing stays in the label, so two A's can be told apart.
 *
 * Past the top half there is no letter, and the cell reads as it did before
 * the letters: "Top 62%" over "best school nearby".
 */
function schoolsCell(ranks: CommunityProfile['ranks'] | undefined): GlanceCell | null {
  const rows = (ranks?.rows ?? []).filter((r) => r.group === SCHOOLS_GROUP).slice(0, 3);
  if (rows.length === 0) return null;
  const best = Math.min(...rows.map(rankShare));
  const which = rows.length === 1 ? 'school nearby' : 'best school';
  const grade = schoolGrade(best);
  return grade
    ? { value: gradeFigure(grade), label: `${which}, top ${best}%`, topic: 'schools' }
    : {
        value: `Top ${best}%`,
        label: rows.length === 1 ? which : `${which} nearby`,
        topic: 'schools',
      };
}

/**
 * The drive to the nearest highway on-ramp — "6 min" over "to I-85" — as the
 * community's Convenience tile prints it. It took the straight-line distance
 * to Atlanta's place (owner 2026-11-27: 「好就写上高速时长」): that figure was
 * the same on every community of a city, and the city's card has said it.
 */
function highwayCell(highway: CommunityProfile['highway'] | undefined): GlanceCell | null {
  if (!highway) return null;
  return { value: highway.display, label: highway.label, topic: 'convenience' };
}

/**
 * How far out a community nobody has measured the highway for is. Nothing for
 * a place in downtown itself: "0 mi north" says nothing.
 */
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

/**
 * "Suwanee, GA" — the city as an address writes it (owner, 2026-11-27, on the
 * line above a card: 「加ga」). The city alone for a row with no state.
 */
const cityState = (city: string, state: string | null | undefined) =>
  state ? `${city}, ${state}` : city;

export function communityGlance(
  c: Point & {
    city: string;
    state?: string | null;
    county?: string | null;
    profile: CommunityProfile | null;
  },
): PlaceGlance | undefined {
  if (!c.city) return undefined;
  return {
    place: {
      lead: cityState(c.city, c.state),
      ...(c.county ? { rest: `${c.county} County` } : {}),
    },
    cells: present([
      homesCell(c.profile),
      schoolsCell(c.profile?.ranks),
      highwayCell(c.profile?.highway) ?? distanceCell(pointOf(c)),
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
 * state rows it is drawn against are left out. The figure is the highest
 * school's, as the page prints it — and where the city has several, a
 * graduation rate is labelled as the top one rather than as the city's.
 */
function graduationCell(education: CityFundamentals['education']): GlanceCell | null {
  const own = education.rows.filter((r) => !r.baseline);
  const label = measureLabel(education.measure);
  const best = own.reduce<(typeof own)[number] | undefined>(
    (top, r) => (top === undefined || r.pct > top.pct ? r : top),
    undefined,
  );
  if (!best || !label) return null;
  const topOfSeveral = own.length > 1 && /^graduate\b/.test(label);
  return {
    value: best.display,
    label: topOfSeveral ? 'top graduation rate' : label,
    topic: 'schools',
  };
}

/**
 * A city's schools as one letter: where its typical school stands among
 * Georgia's, every scored school in and around it counted (the list its page
 * prints under Schools) — "Grade A+" over "schools, top 4% in GA".
 *
 * The typical one, not the best: five of the first seven cities have a school
 * in Georgia's top 1%, and a figure that is the same on every card is the
 * fault the graduation rate was replaced for (94.8%–98.4% across the seven,
 * high schools only). Nothing for a city with no scored school or one past
 * the scale — the graduation rate is printed then, as before.
 */
function citySchoolsCell(schools: ReadonlyArray<{ share: number }> | undefined): GlanceCell | null {
  const typical = typicalShare(schools ?? []);
  const grade = typical === null ? null : schoolGrade(typical);
  if (typical === null || !grade) return null;
  return { value: gradeFigure(grade), label: `schools, top ${typical}% in GA`, topic: 'schools' };
}

/**
 * The drive to downtown, between off-peak and rush hour as the city's
 * Convenience tile prints them. The off-peak figure alone would be the
 * flattering half.
 *
 * One number and no second one: the label carried the road miles ("33 mi to
 * downtown") until phase404.20, and beside a community's straight-line "28 mi"
 * the two read as a contradiction (owner 2026-11-27: 「city card上的距离dt和进入
 * community后的这个数字不一致」).
 */
function driveCell(gettingAround: CityFundamentals['gettingAround']): GlanceCell | null {
  const row = gettingAround.find((g) => /^downtown atlanta/i.test(g.label));
  if (!row?.minutes) return null;
  const { min, max } = row.minutes;
  return {
    value: `${Math.round((min + max) / 2)} min`,
    label: 'drive to downtown',
    topic: 'convenience',
  };
}

/**
 * A city's line is `City, ST · County`, the same things in the same order as
 * a community's (owner, 2026-11-26: 「左上角一会儿是county 一会儿是city很乱」).
 * It led with the county — a city's card already says the city — and that read
 * as a different line on every other card. How far and which way from Atlanta
 * is the third figure's to say.
 */
export function cityGlance(c: {
  name: string;
  state?: string | null;
  county?: string | null;
  profile: Pick<CityFundamentals, 'compare' | 'education' | 'gettingAround'> | null;
  /** Every scored school in and around the city (`citySchools`). */
  schools?: ReadonlyArray<{ share: number }> | undefined;
}): PlaceGlance | undefined {
  if (!c.name) return undefined;
  return {
    place: {
      lead: cityState(c.name, c.state),
      ...(c.county ? { rest: `${c.county} County` } : {}),
    },
    cells: c.profile
      ? present([
          medianHomeCell(c.profile.compare),
          citySchoolsCell(c.schools) ?? graduationCell(c.profile.education),
          driveCell(c.profile.gettingAround),
        ])
      : [],
  };
}
