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

// Curated Unsplash real-estate photos, grouped by room type.
// Hotlinked at ?w=1600&q=80 for high-quality video render.
// Pools kept for reference / future rotation; per-listing arrays are
// materialized inline below so they can be scanned/edited directly.

export const MOCK_LISTINGS: MockListing[] = [
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
    photo_urls: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80',
      'https://images.unsplash.com/photo-1600585154363-67eb9e2e2099?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80',
      'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1600&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600&q=80',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1600&q=80',
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?w=1600&q=80',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74102834.mp4',
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
    photo_urls: [
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1600&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&q=80',
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600&q=80',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=80',
      'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=1600&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1600&q=80',
      'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=1600&q=80',
      'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1600&q=80',
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1600&q=80',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74118902.mp4',
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
    photo_urls: [
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1600&q=80',
      'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1600&q=80',
      'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=1600&q=80',
      'https://images.unsplash.com/photo-1556912173-3bb406ef7e77?w=1600&q=80',
      'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1600&q=80',
      'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1600&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?w=1600&q=80',
      'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1600&q=80',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74130471.mp4',
  },
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
    photo_urls: [
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&q=80',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600&q=80',
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1600&q=80',
      'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1600&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600&q=80',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1600&q=80',
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?w=1600&q=80',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74145238.mp4',
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
    photo_urls: [
      'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1600&q=80',
      'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=1600&q=80',
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1600&q=80',
      'https://images.unsplash.com/photo-1571066811602-716837d681de?w=1600&q=80',
      'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=1600&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1600&q=80',
      'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=1600&q=80',
      'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1600&q=80',
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1600&q=80',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74162983.mp4',
  },
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
    photo_urls: [
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80',
      'https://images.unsplash.com/photo-1600585154363-67eb9e2e2099?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80',
      'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1600&q=80',
      'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1600&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?w=1600&q=80',
      'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1600&q=80',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74177412.mp4',
  },
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
    photo_urls: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1600&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&q=80',
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600&q=80',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=80',
      'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1600&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600&q=80',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1600&q=80',
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?w=1600&q=80',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74192145.mp4',
  },
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
    photo_urls: [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80',
      'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1600&q=80',
      'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=1600&q=80',
      'https://images.unsplash.com/photo-1556912173-3bb406ef7e77?w=1600&q=80',
      'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=1600&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1600&q=80',
      'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=1600&q=80',
      'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1600&q=80',
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1600&q=80',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74204518.mp4',
  },
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
    photo_urls: [
      'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1600&q=80',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600&q=80',
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1600&q=80',
      'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1600&q=80',
      'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1600&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?w=1600&q=80',
      'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1600&q=80',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74211074.mp4',
  },
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
    photo_urls: [
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1600&q=80',
      'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=1600&q=80',
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1600&q=80',
      'https://images.unsplash.com/photo-1571066811602-716837d681de?w=1600&q=80',
      'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1600&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600&q=80',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1600&q=80',
      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1600&q=80',
      'https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?w=1600&q=80',
      'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1600&q=80',
    ],
    videoUrl: '/demo/listings/74218653.mp4',
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
