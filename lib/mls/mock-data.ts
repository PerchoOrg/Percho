/**
 * Mock Atlanta MLS listings for the /demo/autofill pitch demo.
 *
 * Used for the KW Atlanta meetup (2026-07) so the founder can demo the
 * "type an address, we auto-fill everything" pitch without live Bridge/FMLS
 * credentials. Not wired to any real MLS data path.
 */

export interface MockListing {
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  lot_size: number; // acres
  year_built: number;
  mls_number: string; // FMLS style: 74xxxxxx
  days_on_market: number;
  description: string;
  photo_urls: string[];
  videoUrl?: string;
}

// Curated Unsplash photo IDs of homes/interiors — hotlinked at ?w=800.
const P = (id: string) => `https://images.unsplash.com/photo-${id}?w=800`;

const HOUSE_PHOTOS_A = [
  P('1600585154340-be6161a56a0c'),
  P('1600607687939-ce8a6c25118c'),
  P('1600566753190-17f0baa2a6c3'),
  P('1600585154526-990dced4db0d'),
  P('1600607687644-c7171b42498f'),
  P('1512917774080-9991f1c4c750'),
];

const HOUSE_PHOTOS_B = [
  P('1613490493576-7fde63acd811'),
  P('1600566753086-00f18fe6ba46'),
  P('1600607687920-4e2a09cf159d'),
  P('1600566752355-35792bedcfea'),
  P('1560448204-e02f11c3d0e2'),
  P('1580587771525-78b9dba3b914'),
];

const HOUSE_PHOTOS_C = [
  P('1568605114967-8130f3a36994'),
  P('1600585152220-90363fe7e115'),
  P('1600047509807-ba8f99d2cdde'),
  P('1600210492486-724fe5c67fb0'),
  P('1600607687644-c7171b42498f'),
  P('1600566753376-12c8ab7fb75b'),
];

const HOUSE_PHOTOS_D = [
  P('1600596542815-ffad4c1539a9'),
  P('1600585154526-990dced4db0d'),
  P('1600566753051-6057a1ec1362'),
  P('1600585154363-67eb9e2e2099'),
  P('1600566753104-685f4f24cb4d'),
  P('1600566753190-17f0baa2a6c3'),
];

export const MOCK_LISTINGS: MockListing[] = [
  // ── Buckhead ($1M+) ─────────────────────────────────────────────
  {
    address: '3520 Peachtree Rd NE',
    city: 'Atlanta',
    state: 'GA',
    zip: '30326',
    price: 1_895_000,
    beds: 5,
    baths: 4.5,
    sqft: 4820,
    lot_size: 0.42,
    year_built: 2016,
    mls_number: '74102834',
    days_on_market: 12,
    description:
      'Modern Buckhead estate with chef’s kitchen, primary-on-main, and a resort-style backyard. Walk to Phipps Plaza and Lenox.',
    photo_urls: HOUSE_PHOTOS_A,
    videoUrl: '/demo/vicinity-slideshow-demo.mp4',
  },
  {
    address: '2870 W Paces Ferry Rd NW',
    city: 'Atlanta',
    state: 'GA',
    zip: '30327',
    price: 3_250_000,
    beds: 6,
    baths: 6.5,
    sqft: 7100,
    lot_size: 1.1,
    year_built: 2004,
    mls_number: '74118902',
    days_on_market: 34,
    description:
      'Gated Tuxedo Park compound behind mature magnolias. Two-story marble foyer, wine cellar, and pool with cabana.',
    photo_urls: HOUSE_PHOTOS_B,
  },
  {
    address: '415 Blackland Rd NW',
    city: 'Atlanta',
    state: 'GA',
    zip: '30342',
    price: 1_275_000,
    beds: 4,
    baths: 3.5,
    sqft: 3540,
    lot_size: 0.55,
    year_built: 1998,
    mls_number: '74130471',
    days_on_market: 6,
    description:
      'Renovated brick traditional in prime Buckhead. Screened porch, flat backyard, and Sarah Smith Elementary district.',
    photo_urls: HOUSE_PHOTOS_C,
  },

  // ── Midtown ($500-800k) ─────────────────────────────────────────
  {
    address: '905 Juniper St NE #412',
    city: 'Atlanta',
    state: 'GA',
    zip: '30309',
    price: 685_000,
    beds: 2,
    baths: 2,
    sqft: 1480,
    lot_size: 0,
    year_built: 2019,
    mls_number: '74145238',
    days_on_market: 18,
    description:
      'Corner condo with skyline views, floor-to-ceiling glass, and one block to Piedmont Park. Rooftop pool + concierge.',
    photo_urls: HOUSE_PHOTOS_D,
  },
  {
    address: '1130 Piedmont Ave NE #302',
    city: 'Atlanta',
    state: 'GA',
    zip: '30309',
    price: 549_000,
    beds: 2,
    baths: 2,
    sqft: 1290,
    lot_size: 0,
    year_built: 2007,
    mls_number: '74151067',
    days_on_market: 41,
    description:
      'Hardwoods, chef’s kitchen with quartz, and a private balcony overlooking the park. Deeded garage parking.',
    photo_urls: HOUSE_PHOTOS_A,
  },
  {
    address: '620 Peachtree St NE #2201',
    city: 'Atlanta',
    state: 'GA',
    zip: '30308',
    price: 785_000,
    beds: 3,
    baths: 2.5,
    sqft: 1720,
    lot_size: 0,
    year_built: 2015,
    mls_number: '74162983',
    days_on_market: 9,
    description:
      'High-floor 3BR in the heart of Midtown with unobstructed downtown views. Walkable to MARTA, Fox Theatre, and Ponce City Market.',
    photo_urls: HOUSE_PHOTOS_B,
  },

  // ── West End ($300-500k) ────────────────────────────────────────
  {
    address: '812 Ashby Grove SW',
    city: 'Atlanta',
    state: 'GA',
    zip: '30310',
    price: 389_000,
    beds: 3,
    baths: 2,
    sqft: 1650,
    lot_size: 0.18,
    year_built: 1925,
    mls_number: '74177412',
    days_on_market: 22,
    description:
      'Renovated West End craftsman bungalow with original heart-pine floors and a modern kitchen. Steps to the Beltline Westside Trail.',
    photo_urls: HOUSE_PHOTOS_C,
  },
  {
    address: '1247 Ralph David Abernathy Blvd SW',
    city: 'Atlanta',
    state: 'GA',
    zip: '30310',
    price: 445_000,
    beds: 4,
    baths: 3,
    sqft: 2100,
    lot_size: 0.22,
    year_built: 1918,
    mls_number: '74183990',
    days_on_market: 14,
    description:
      'Fully restored Victorian with wraparound porch, high ceilings, and a rebuilt carriage house. Historic West End at its best.',
    photo_urls: HOUSE_PHOTOS_D,
  },

  // ── Sandy Springs ───────────────────────────────────────────────
  {
    address: '6420 Roswell Rd',
    city: 'Sandy Springs',
    state: 'GA',
    zip: '30328',
    price: 725_000,
    beds: 4,
    baths: 3,
    sqft: 2860,
    lot_size: 0.34,
    year_built: 2001,
    mls_number: '74192145',
    days_on_market: 27,
    description:
      'Bright transitional in the heart of Sandy Springs. Open plan, two-car garage, and a fenced backyard for the kids and dogs.',
    photo_urls: HOUSE_PHOTOS_A,
  },
  {
    address: '105 Glenridge Point Pkwy',
    city: 'Sandy Springs',
    state: 'GA',
    zip: '30342',
    price: 1_150_000,
    beds: 5,
    baths: 4.5,
    sqft: 4200,
    lot_size: 0.6,
    year_built: 2010,
    mls_number: '74198776',
    days_on_market: 3,
    description:
      'Executive home minutes to GA-400 and Northside Hospital. Chef’s kitchen, finished basement, and a saltwater pool.',
    photo_urls: HOUSE_PHOTOS_B,
  },

  // ── Old Fourth Ward ─────────────────────────────────────────────
  {
    address: '660 Glen Iris Dr NE',
    city: 'Atlanta',
    state: 'GA',
    zip: '30308',
    price: 799_000,
    beds: 3,
    baths: 2.5,
    sqft: 2050,
    lot_size: 0.11,
    year_built: 2014,
    mls_number: '74204518',
    days_on_market: 8,
    description:
      'Modern O4W townhome with rooftop deck and skyline views. Walk to Ponce City Market, Krog Street, and the Beltline Eastside Trail.',
    photo_urls: HOUSE_PHOTOS_C,
  },

  // ── Grant Park ──────────────────────────────────────────────────
  {
    address: '532 Cherokee Ave SE',
    city: 'Atlanta',
    state: 'GA',
    zip: '30312',
    price: 665_000,
    beds: 3,
    baths: 2,
    sqft: 1780,
    lot_size: 0.16,
    year_built: 1908,
    mls_number: '74211074',
    days_on_market: 15,
    description:
      'Restored Victorian across from Grant Park with original details, chef’s kitchen, and a private garden. Zoo Atlanta at your doorstep.',
    photo_urls: HOUSE_PHOTOS_D,
  },

  // ── Inman Park ──────────────────────────────────────────────────
  {
    address: '1044 Edgewood Ave NE',
    city: 'Atlanta',
    state: 'GA',
    zip: '30307',
    price: 985_000,
    beds: 4,
    baths: 3.5,
    sqft: 2640,
    lot_size: 0.14,
    year_built: 1905,
    mls_number: '74218653',
    days_on_market: 21,
    description:
      'Iconic Inman Park Victorian with wraparound porch and carriage house. One block to Krog Street Market and the Beltline.',
    photo_urls: HOUSE_PHOTOS_A,
  },

  // ── Decatur ─────────────────────────────────────────────────────
  {
    address: '318 W Ponce de Leon Ave',
    city: 'Decatur',
    state: 'GA',
    zip: '30030',
    price: 875_000,
    beds: 4,
    baths: 3,
    sqft: 2480,
    lot_size: 0.19,
    year_built: 1938,
    mls_number: '74225198',
    days_on_market: 5,
    description:
      'Classic Decatur bungalow inside the city-schools district. Walk to Decatur Square, MARTA, and the Saturday farmers market.',
    photo_urls: HOUSE_PHOTOS_B,
  },

  // ── East Atlanta Village ────────────────────────────────────────
  {
    address: '1289 Metropolitan Ave SE',
    city: 'Atlanta',
    state: 'GA',
    zip: '30316',
    price: 479_000,
    beds: 3,
    baths: 2,
    sqft: 1590,
    lot_size: 0.2,
    year_built: 1946,
    mls_number: '74232841',
    days_on_market: 11,
    description:
      'Renovated craftsman in East Atlanta Village. Screened porch, fenced yard, and a short walk to the EAV strip and Brownwood Park.',
    photo_urls: HOUSE_PHOTOS_C,
  },
];

/**
 * Case-insensitive substring match on address / city / zip / MLS #.
 * Empty query returns all listings.
 */
export function searchMockListings(query: string): MockListing[] {
  const q = query.trim().toLowerCase();
  if (!q) return MOCK_LISTINGS;
  return MOCK_LISTINGS.filter((l) => {
    const hay = `${l.address} ${l.city} ${l.state} ${l.zip} ${l.mls_number}`.toLowerCase();
    return hay.includes(q);
  });
}
