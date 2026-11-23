/**
 * What the city page adds to a stored profile at read time (phase371): the
 * Resources links and the safety rows. Neither is researched copy — the links
 * follow from the city's name, county and point, and the safety rows from
 * `city-safety.json` — so neither is stored in `cities.profile`.
 *
 * Pure, so the page's links can be tested without a database.
 */
import type { CityDetailDTO } from '@percho/shared/city';
import {
  CITY_DISTRICTS,
  CITY_SITES,
  COUNTY_LINKS,
  REDFIN_CITIES,
} from '../communities/local-links';
import safetyFile from './city-safety.json';

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
  if (c.lat !== null && c.lng !== null)
    links.push({
      group: 'Safety',
      label: 'FEMA flood map',
      url: `https://hazards-fema.maps.arcgis.com/apps/webappviewer/index.html?id=8b0adb51996444d4879338b5529aa9cd&center=${c.lng},${c.lat}&level=13`,
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

const SAFETY = safetyFile as {
  fireWithinMiles: number;
  cities: Record<string, { hospital?: { name: string; miles: number }; fireStations: number }>;
};

/**
 * Facts about the place, never about crime (`packages/shared/src/city.ts`):
 * the hospital closest to the city's centre and the fire stations around it.
 */
export function citySafety(slug: string): CityDetailDTO['safety'] | undefined {
  const facts = SAFETY.cities[slug];
  if (!facts) return undefined;
  const rows: NonNullable<CityDetailDTO['safety']>['rows'] = [];
  if (facts.hospital)
    rows.push({ label: 'Hospital', name: facts.hospital.name, note: `${facts.hospital.miles} mi` });
  if (facts.fireStations > 0)
    rows.push({
      label: 'Fire stations',
      name: `${facts.fireStations} within ${SAFETY.fireWithinMiles} miles`,
    });
  return rows.length > 0 ? { rows } : undefined;
}
