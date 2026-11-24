/**
 * What the city page adds to a stored profile at read time (phase371): the
 * Resources links and the safety block (natural hazards since phase384). Neither is researched copy — the links
 * follow from the city's name, county and point, and the hazard ratings from
 * `city-hazards.json` — so neither is stored in `cities.profile`. Since phase383
 * also the everyday places around the centre and the schools' own websites,
 * from `city-places.json` (both files: `import-community-safety.ts --cities`).
 *
 * Pure, so the page's links can be tested without a database.
 */
import type { CityDetailDTO, CrimeLevel } from '@percho/shared/city';
import {
  CITY_DISTRICTS,
  CITY_SITES,
  COUNTY_LINKS,
  REDFIN_CITIES,
} from '../communities/local-links';
import crimeFile from './city-crime.json';
import hazardsFile from './city-hazards.json';
import placesFile from './city-places.json';
import schoolsFile from './city-schools.json';

type Links = NonNullable<CityDetailDTO['links']>;

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const label = (text: string) => (text.length > 18 ? `${text.slice(0, 17).trimEnd()}…` : text);

export interface CityPlace {
  name: string;
  county: string | null;
  lat: number | null;
  lng: number | null;
  /** The city's own site, as the `cities` row has it. */
  website: string | null;
}

/**
 * The same sites a community's page links to (`profile-build.ts`), addressed
 * to the city: its own site and its county's, the homes sites by city, the
 * district, the two safety maps, and where people talk about it.
 */
export function cityLinks(c: CityPlace): Links {
  const links: Links = [];
  const q = encodeURIComponent;
  const county = COUNTY_LINKS[key(c.county)];
  const site = c.website?.startsWith('https://') ? c.website : CITY_SITES[key(c.name)];
  if (site) {
    const full = `City of ${c.name}`;
    links.push({ group: 'City', label: full.length <= 18 ? full : label(c.name), url: site });
  }
  if (county && c.county)
    links.push({ group: 'City', label: label(`${c.county} County`), url: county.site });
  links.push({
    group: 'City',
    label: 'Wikipedia',
    url: `https://en.wikipedia.org/wiki/${q(`${c.name.trim().replace(/\s+/g, '_')},_Georgia`)}`,
  });
  links.push({
    group: 'City',
    label: 'Google Maps',
    url: `https://www.google.com/maps/search/?api=1&query=${q(`${c.name}, GA`)}`,
  });
  if (c.lat !== null && c.lng !== null)
    links.push({
      group: 'City',
      label: 'Walk Score',
      url: `https://www.walkscore.com/score/loc/lat=${c.lat}/lng=${c.lng}`,
    });

  links.push({
    group: 'Homes',
    label: 'Homes on Zillow',
    url: `https://www.zillow.com/homes/${c.name.trim().replace(/\s+/g, '-')}-GA_rb/`,
  });
  const redfin = REDFIN_CITIES[key(c.name)];
  if (redfin) {
    links.push({ group: 'Homes', label: 'Redfin', url: redfin });
    links.push({
      group: 'Homes',
      label: 'Trulia',
      url: `https://www.trulia.com/GA/${c.name.trim().replace(/\s+/g, '_')}/`,
    });
    links.push({
      group: 'Homes',
      label: 'Homes.com',
      url: `https://www.homes.com/${c.name.trim().toLowerCase().replace(/\s+/g, '-')}-ga/`,
    });
  }
  if (county) links.push({ group: 'Homes', label: 'Property records', url: county.assessor });

  const district = CITY_DISTRICTS[key(c.name)] ?? county?.district;
  if (district) links.push({ group: 'Schools', label: 'School district', url: district });

  // Crime figures are not on the page; the agencies' own map is one tap away.
  links.push({
    group: 'Safety',
    label: 'Crime map',
    url: `https://communitycrimemap.com/?address=${q(`${c.name}, GA`)}`,
  });
  links.push({
    group: 'Safety',
    label: 'FEMA Risk Index',
    url: 'https://hazards.fema.gov/nri/map',
  });
  if (c.lat !== null && c.lng !== null)
    links.push({
      group: 'Safety',
      label: 'FEMA flood map',
      url: `https://hazards-fema.maps.arcgis.com/apps/webappviewer/index.html?id=8b0adb51996444d4879338b5529aa9cd&center=${c.lng},${c.lat}&level=13`,
    });

  // What residents wrote about living there (owner 2026-11-22: "resources可以
  // 加一些评论文章"). Niche addresses a place as <city>-<county>-<state>.
  if (c.county)
    links.push({
      group: 'Community',
      label: 'Niche reviews',
      url: `https://www.niche.com/places-to-live/${`${c.name} ${c.county}`.trim().toLowerCase().replace(/\s+/g, '-')}-ga/`,
    });
  links.push({
    group: 'Community',
    label: 'Reddit',
    url: `https://www.reddit.com/search/?q=${q(`"${c.name}" Georgia`)}`,
  });
  links.push({
    group: 'Community',
    label: 'YouTube',
    url: `https://www.youtube.com/results?search_query=${q(`${c.name} GA`)}`,
  });
  return links;
}

const HAZARDS = hazardsFile as {
  cities: Record<string, NonNullable<CityDetailDTO['hazards']>>;
};

/**
 * How exposed the city is to natural hazards (`packages/shared/src/city.ts`):
 * FEMA's National Risk Index ratings for the tracts around its centre, as
 * `import-community-safety.ts --cities` found them. Nothing about crime.
 */
export function cityHazards(slug: string): CityDetailDTO['hazards'] | undefined {
  return HAZARDS.cities[slug];
}

const CRIME = crimeFile as {
  against: string;
  cities: Record<
    string,
    { agency: string; year: number; violentPer100k: number; statePer100k: number }
  >;
};

/**
 * A rate against the state's, in words. Half the state's rate or less is
 * "Well below"; within a tenth of it is "Near"; half as much again is "Well
 * above". The bands are wide on purpose: a city of 30,000 moves by tens per
 * 100,000 from one year to the next.
 */
export function crimeLevel(rate: number, stateRate: number): CrimeLevel {
  const ratio = rate / stateRate;
  if (ratio <= 0.5) return 'Well below';
  if (ratio < 0.9) return 'Below';
  if (ratio <= 1.1) return 'Near';
  if (ratio < 1.5) return 'Above';
  return 'Well above';
}

/**
 * The city's violent crime against the state's rate — the words, the year,
 * who reported it and where to read it. The rates stay in `city-crime.json`:
 * the page shows no count (`packages/shared/src/city.ts`).
 */
export function cityCrime(slug: string): CityDetailDTO['crime'] | undefined {
  const c = CRIME.cities[slug];
  if (!c || !(c.statePer100k > 0)) return undefined;
  return {
    violent: crimeLevel(c.violentPer100k, c.statePer100k),
    against: CRIME.against,
    year: c.year,
    agency: c.agency,
    source: { name: 'FBI Crime Data Explorer', url: 'https://cde.ucr.cjis.gov/' },
  };
}

const PLACES = placesFile as {
  cities: Record<
    string,
    { everyday: NonNullable<CityDetailDTO['everyday']>; schoolSites: Record<string, string> }
  >;
};

/** The everyday places around the city's centre, by kind, nearest first. */
export function cityEveryday(slug: string): CityDetailDTO['everyday'] | undefined {
  const kinds = PLACES.cities[slug]?.everyday;
  return kinds && kinds.length > 0 ? kinds : undefined;
}

/** A school's name as the importer keys its website (`schoolKey` there). */
const schoolKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\bschool\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The school's own website, when one school of that name is in reach of the city. */
export function schoolSite(slug: string, name: string): string | undefined {
  return PLACES.cities[slug]?.schoolSites[schoolKey(name)];
}

/** Publishers of figures and official pages — sources, but not something to read about the city. */
const NOT_AN_ARTICLE = /^(U\.S\. Census|Data USA|Wikipedia|City of |Drive times|U\.S\. News)/i;

/**
 * Articles about the city, from what its researched profile already cites:
 * the pieces behind its non-school rankings, then the news and features among
 * its sources. Nothing is searched for at read time and nothing is invented —
 * a city whose profile cites no article gets none.
 */
export function articleLinks(
  profile: Pick<CityDetailDTO, 'rankings' | 'sources' | 'education'>,
): Links {
  const schools = new Set(
    profile.education.schools.flatMap((s) => [
      s.name.toLowerCase(),
      `${s.name.toLowerCase()} school`,
    ]),
  );
  const out: Links = [];
  const seen = new Set<string>();
  const add = (label: string, url: string | undefined) => {
    if (!url?.startsWith('https://') || seen.has(url)) return;
    seen.add(url);
    out.push({ group: 'Articles', label, url });
  };
  for (const r of profile.rankings) {
    if (schools.has(r.title.trim().toLowerCase())) continue;
    add(`${r.source.name}: ${r.title}`, r.source.url);
  }
  for (const s of profile.sources) {
    if (!s.name.includes(' — ') || NOT_AN_ARTICLE.test(s.name)) continue;
    add(s.name, s.url);
  }
  return out.slice(0, 8);
}

const SCHOOLS = schoolsFile as {
  cities: Record<string, NonNullable<CityDetailDTO['allSchools']>>;
};

/** Every scored school in and around the city (`build-city-schools.ts`). */
export function citySchools(slug: string): CityDetailDTO['allSchools'] | undefined {
  const list = SCHOOLS.cities[slug];
  if (!list || list.length === 0) return undefined;
  return list.map((s) => {
    const site = schoolSite(slug, s.name);
    return site ? { ...s, site } : s;
  });
}
