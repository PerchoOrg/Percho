/**
 * Official pages a community's Explore page links out to (phase370): the
 * county's property records, the school district, the city's own site.
 *
 * A table, not a guess. Each URL here was opened and answered on 2026-11-22;
 * a county or city that is not listed gets no link rather than a search that
 * may land nowhere. It covers the three counties and eight cities that have a
 * community film today — add a row when a film is made somewhere new.
 *
 * Keys are lower-case, as `profile-build.ts` keys everything else.
 */

export const COUNTY_LINKS: Readonly<Record<string, { assessor: string; district: string }>> = {
  forsyth: {
    assessor: 'https://www.forsythco.com/government/departments/board-of-assessors/',
    district: 'https://www.forsyth.k12.ga.us/',
  },
  fulton: {
    assessor: 'https://fultonassessor.org/',
    district: 'https://www.fultonschools.org/',
  },
  gwinnett: {
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
