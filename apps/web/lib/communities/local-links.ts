/**
 * Pages a community's Explore page links out to that cannot be reached by a
 * search (phase370): the county's own site and its property records, the
 * school district, the city's own site, and the city's page on Redfin, which
 * is addressed by an id only Redfin assigns.
 *
 * A table, not a guess. Each URL here was opened and answered on 2026-11-22
 * (the Redfin paths were read off Redfin's own indexed pages);
 * a county or city that is not listed gets no link rather than a search that
 * may land nowhere. It covers the three counties and eight cities that have a
 * community film today — add a row when a film is made somewhere new.
 *
 * Keys are lower-case, as `profile-build.ts` keys everything else.
 */

export const COUNTY_LINKS: Readonly<
  Record<string, { site: string; assessor: string; district: string }>
> = {
  forsyth: {
    site: 'https://www.forsythco.com/',
    assessor: 'https://www.forsythco.com/government/departments/board-of-assessors/',
    district: 'https://www.forsyth.k12.ga.us/',
  },
  fulton: {
    site: 'https://www.fultoncountyga.gov/',
    assessor: 'https://fultonassessor.org/',
    district: 'https://www.fultonschools.org/',
  },
  gwinnett: {
    site: 'https://www.gwinnettcounty.com/',
    assessor: 'https://www.gwinnettcounty.com/government/departments/county-administrator/assessor',
    district: 'https://www.gcpsk12.org/',
  },
};

/** A city that runs its own schools, apart from its county's district. */
export const CITY_DISTRICTS: Readonly<Record<string, string>> = {
  buford: 'https://www.bufordcityschools.org/',
};

export const CITY_SITES: Readonly<Record<string, string>> = {
  alpharetta: 'https://www.alpharetta.ga.us/',
  buford: 'https://www.cityofbuford.com/',
  cumming: 'https://www.cityofcumming.net/',
  duluth: 'https://www.duluthga.net/',
  'johns creek': 'https://johnscreekga.gov/',
  'peachtree corners': 'https://www.peachtreecornersga.gov/',
  'sugar hill': 'https://cityofsugarhill.com/',
  suwanee: 'https://www.suwanee.com/',
};

/** `https://www.redfin.com/city/<id>/GA/<Name>` — the id is Redfin's own. */
export const REDFIN_CITIES: Readonly<Record<string, string>> = {
  alpharetta: 'https://www.redfin.com/city/438/GA/Alpharetta',
  buford: 'https://www.redfin.com/city/30771/GA/Buford',
  cumming: 'https://www.redfin.com/city/5394/GA/Cumming',
  duluth: 'https://www.redfin.com/city/6333/GA/Duluth',
  'johns creek': 'https://www.redfin.com/city/33537/GA/Johns-Creek',
  'peachtree corners': 'https://www.redfin.com/city/35853/GA/Peachtree-Corners',
  'sugar hill': 'https://www.redfin.com/city/18846/GA/Sugar-Hill',
  suwanee: 'https://www.redfin.com/city/18994/GA/Suwanee',
};
