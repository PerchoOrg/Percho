// Shared subdivision + POI data + persona logic + state persistence
window.VIBE_STATE_KEY = 'percho-vibe:state:v1';

window.SUBDIVISIONS = [
  {
    id: 'waterside', name: 'Waterside', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70&auto=format',
    tags: ['🌳 Wooded', '👨‍👩‍👧 Family', '🏫 Top schools'],
    stats: { median: '$685K', homes: 142, vibe: 'Quiet' },
    traits: { family: 90, walkable: 40, quiet: 85, hip: 30, outdoors: 80, nightlife: 20 },
    blurb: 'Established Chapel Hill enclave. Cul-de-sacs, mature oaks, top-rated Ephesus Elementary a 4-min drive.',
    pois: [
      { name: 'Ephesus Elementary', cat: 'school', mins: 4, note: 'GS 8/10' },
      { name: 'Bolin Creek Trail', cat: 'park', mins: 6, note: '4.2mi greenway' },
      { name: 'Perennial Coffee', cat: 'food', mins: 5, note: '★ 4.8' },
      { name: 'Whole Foods', cat: 'shop', mins: 9, note: 'Flagship store' },
    ],
    listings: [
      { addr: '5122 Lower Creek St', price: '$749K', bd: 4, ba: 3.5, sqft: 2840, img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=70' },
      { addr: '412 Waterside Dr', price: '$695K', bd: 4, ba: 3, sqft: 2620, img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&q=70' },
    ],
  },
  {
    id: 'southern-village', name: 'Southern Village', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&q=70&auto=format',
    tags: ['🚶 Walkable', '🍽️ Restaurants', '☕ Village green'],
    stats: { median: '$720K', homes: 385, vibe: 'Village' },
    traits: { family: 70, walkable: 95, quiet: 60, hip: 60, outdoors: 55, nightlife: 50 },
    blurb: 'Master-planned "traditional neighborhood" — Market St has coffee, dinner, movie theater walkable from every home.',
    pois: [
      { name: 'Village Green', cat: 'park', mins: 2, note: 'Sat farmers mkt' },
      { name: 'Weaver Street Market', cat: 'food', mins: 3, note: 'Walk 4 min' },
      { name: 'Southern Village Cinema', cat: 'entertainment', mins: 3, note: '5 screens' },
      { name: 'Scroggs Elementary', cat: 'school', mins: 4, note: 'GS 9/10' },
    ],
    listings: [
      { addr: '108 Market St', price: '$695K', bd: 3, ba: 2.5, sqft: 1980, img: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400&q=70' },
      { addr: '304 Aberdeen Dr', price: '$780K', bd: 4, ba: 3, sqft: 2400, img: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=400&q=70' },
    ],
  },
  {
    id: 'meadowmont', name: 'Meadowmont', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=70&auto=format',
    tags: ['🎓 Near UNC', '🏊 Amenities', '💼 Professional'],
    stats: { median: '$810K', homes: 620, vibe: 'Manicured' },
    traits: { family: 75, walkable: 70, quiet: 55, hip: 55, outdoors: 60, nightlife: 40 },
    blurb: 'Post-2000 planned community. Pool + clubhouse + 6 mi trails. Popular with UNC faculty and Duke faculty commuting west.',
    pois: [
      { name: 'Meadowmont Club', cat: 'entertainment', mins: 2, note: 'Pool + tennis' },
      { name: 'Rashkis Elementary', cat: 'school', mins: 3, note: 'GS 8/10' },
      { name: 'Harris Teeter', cat: 'shop', mins: 2, note: 'Walk 6 min' },
      { name: 'The Cedars', cat: 'food', mins: 4, note: '★ 4.6' },
    ],
    listings: [
      { addr: '622 Meadowmont Ln', price: '$875K', bd: 5, ba: 4, sqft: 3200, img: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=400&q=70' },
    ],
  },
  {
    id: 'downtown-durham', name: 'Downtown Durham Lofts', city: 'Durham, NC',
    img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&q=70&auto=format',
    tags: ['🎨 Hip', '🍸 Nightlife', '🏢 Loft living'],
    stats: { median: '$495K', homes: 91, vibe: 'Urban' },
    traits: { family: 15, walkable: 90, quiet: 20, hip: 95, outdoors: 30, nightlife: 90 },
    blurb: 'Converted tobacco warehouses, exposed brick, restaurants at street level. Walk to Durham Bulls games and 40+ restaurants.',
    pois: [
      { name: 'M Sushi', cat: 'food', mins: 1, note: '★ 4.7 · walk' },
      { name: 'DPAC', cat: 'entertainment', mins: 2, note: 'Broadway tours' },
      { name: 'Ponysaurus Brewing', cat: 'nightlife', mins: 3, note: '★ 4.6' },
      { name: 'Durham Central Park', cat: 'park', mins: 1, note: 'Sat market' },
    ],
    listings: [
      { addr: '318 W Main St #4B', price: '$525K', bd: 2, ba: 2, sqft: 1450, img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=70' },
    ],
  },
  {
    id: 'fearrington', name: 'Fearrington Village', city: 'Pittsboro, NC',
    img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=70&auto=format',
    tags: ['🐑 Rural', '🍷 Slow', '🌾 Farm-to-table'],
    stats: { median: '$795K', homes: 210, vibe: 'Retreat' },
    traits: { family: 40, walkable: 45, quiet: 95, hip: 65, outdoors: 90, nightlife: 15 },
    blurb: 'Former dairy farm turned pastoral retirement + retreat community. Belted Galloway "Oreo cows" grazing, farm-to-table restaurant, no through traffic.',
    pois: [
      { name: 'The Fearrington House', cat: 'food', mins: 2, note: 'AAA 5-diamond' },
      { name: 'McIntyre\'s Books', cat: 'shop', mins: 3, note: 'Beloved indie' },
      { name: 'Belted Galloway pastures', cat: 'park', mins: 1, note: 'Walk 5 min' },
    ],
    listings: [
      { addr: '87 Village Way', price: '$825K', bd: 3, ba: 3, sqft: 2600, img: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=70' },
    ],
  },
  {
    id: 'briar-chapel', name: 'Briar Chapel', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=900&q=70&auto=format',
    tags: ['🌱 New build', '🚴 Trails', '👨‍👩‍👧‍👦 Kids'],
    stats: { median: '$625K', homes: 2400, vibe: 'Modern suburb' },
    traits: { family: 95, walkable: 55, quiet: 75, hip: 45, outdoors: 85, nightlife: 20 },
    blurb: '2007+ built master plan. 900 acres, 24 miles of trails, community pool, elementary school on-site. Highest kid density in Chatham County.',
    pois: [
      { name: 'Chatham Grove Elementary', cat: 'school', mins: 2, note: 'Onsite · GS 7/10' },
      { name: 'Briar Chapel trail system', cat: 'park', mins: 1, note: '24 mi network' },
      { name: 'The Great Meadow pool', cat: 'entertainment', mins: 2, note: 'Community pool' },
    ],
    listings: [
      { addr: '412 Bennett Mountain Tr', price: '$645K', bd: 4, ba: 3, sqft: 2760, img: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=400&q=70' },
    ],
  },
  {
    id: 'carrboro-mill', name: 'Carr Mill District', city: 'Carrboro, NC',
    img: 'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=900&q=70&auto=format',
    tags: ['🎨 Artsy', '🌈 Progressive', '🚲 Bike-first'],
    stats: { median: '$580K', homes: 340, vibe: 'Bohemian' },
    traits: { family: 55, walkable: 88, quiet: 55, hip: 90, outdoors: 65, nightlife: 70 },
    blurb: '"The Paris of the Piedmont." Ex-hippie town gone gently gentrified — coops, vinyl shops, music venues, tofu at every restaurant.',
    pois: [
      { name: 'Weaver Street Market', cat: 'food', mins: 1, note: 'Coop grocery' },
      { name: 'Cat\'s Cradle', cat: 'nightlife', mins: 2, note: 'Legendary venue' },
      { name: 'Carrboro Farmers Market', cat: 'food', mins: 2, note: 'Sat 7a-noon' },
      { name: 'ArtsCenter', cat: 'entertainment', mins: 2, note: 'Classes + shows' },
    ],
    listings: [
      { addr: '104 W Weaver St', price: '$595K', bd: 3, ba: 2, sqft: 1780, img: 'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=400&q=70' },
    ],
  },
  {
    id: 'chapel-woods', name: 'Chapel Woods', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=900&q=70&auto=format',
    tags: ['🌲 Wooded', '🏡 Custom homes', '🤫 Very quiet'],
    stats: { median: '$925K', homes: 88, vibe: 'Secluded' },
    traits: { family: 65, walkable: 25, quiet: 98, hip: 40, outdoors: 88, nightlife: 10 },
    blurb: 'Late-70s custom home enclave. Every house on 1+ acre wooded lot. No sidewalks. Second-generation Chapel Hillians who never left.',
    pois: [
      { name: 'Duke Forest access', cat: 'park', mins: 5, note: '7,000 acres' },
      { name: 'Vin Rouge', cat: 'food', mins: 8, note: '★ 4.5' },
    ],
    listings: [
      { addr: '18 Chapel Woods Ct', price: '$1.05M', bd: 4, ba: 3.5, sqft: 3400, img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=70' },
    ],
  },
  {
    id: 'ninth-street', name: 'Ninth Street Bungalows', city: 'Durham, NC',
    img: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=900&q=70&auto=format',
    tags: ['🏘️ Historic', '☕ Coffee shops', '🎓 Near Duke'],
    stats: { median: '$540K', homes: 165, vibe: 'Walkable historic' },
    traits: { family: 60, walkable: 92, quiet: 45, hip: 80, outdoors: 55, nightlife: 65 },
    blurb: '1920s craftsman bungalows on tree-lined streets adjacent to Duke\'s East Campus. Six coffee shops within a 10-min walk.',
    pois: [
      { name: 'Cocoa Cinnamon', cat: 'food', mins: 1, note: 'Cult coffee' },
      { name: 'Duke East Campus', cat: 'park', mins: 2, note: 'Walk 6 min' },
      { name: 'Ninth Street shops', cat: 'shop', mins: 1, note: 'Indie retail' },
    ],
    listings: [
      { addr: '812 Iredell St', price: '$565K', bd: 3, ba: 2, sqft: 1620, img: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&q=70' },
    ],
  },
  {
    id: 'governors-club', name: 'Governors Club', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=70&auto=format',
    tags: ['⛳ Golf', '🚪 Gated', '💎 Luxury'],
    stats: { median: '$1.15M', homes: 550, vibe: 'Gated golf' },
    traits: { family: 50, walkable: 20, quiet: 90, hip: 35, outdoors: 70, nightlife: 25 },
    blurb: 'Gated golf community. 27-hole Jack Nicklaus signature course. Long driveways, formal amenities, retired execs.',
    pois: [
      { name: 'Governors Club Golf', cat: 'entertainment', mins: 1, note: 'Nicklaus design' },
      { name: 'Club dining room', cat: 'food', mins: 2, note: 'Members only' },
    ],
    listings: [
      { addr: '82000 Springs Rd', price: '$1.28M', bd: 5, ba: 5, sqft: 4200, img: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400&q=70' },
    ],
  },
];

window.CAT_META = {
  school: { icon: '🏫', label: 'School', color: '#3B82F6' },
  park: { icon: '🌳', label: 'Park/Trail', color: '#10B981' },
  food: { icon: '🍽️', label: 'Food', color: '#F59E0B' },
  shop: { icon: '🛒', label: 'Shop', color: '#8B5CF6' },
  nightlife: { icon: '🍸', label: 'Nightlife', color: '#EC4899' },
  entertainment: { icon: '🎭', label: 'Fun', color: '#F97316' },
};

// ---- Individual listings across subdivisions (for mixed feed) ----
window.LISTINGS = [
  { id:'l1', subId:'waterside', addr:'5122 Lower Creek St', price:749000, bd:4, ba:3.5, sqft:2840, year:2007, dom:12,
    img:'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=75',
    priceHistory:[720,725,735,749], hook:'Renovated kitchen · half-acre lot' },
  { id:'l2', subId:'southern-village', addr:'108 Market St', price:695000, bd:3, ba:2.5, sqft:1980, year:2004, dom:6,
    img:'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=900&q=75',
    priceHistory:[655,670,680,695], hook:'Walk to coffee, dinner, movies' },
  { id:'l3', subId:'downtown-durham', addr:'318 W Main St #4B', price:525000, bd:2, ba:2, sqft:1450, year:1998, dom:31,
    img:'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=75',
    priceHistory:[560,545,535,525], hook:'Loft w/ 14ft ceilings, exposed brick' },
  { id:'l4', subId:'briar-chapel', addr:'412 Bennett Mountain Tr', price:645000, bd:4, ba:3, sqft:2760, year:2019, dom:4,
    img:'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=75',
    priceHistory:[615,625,635,645], hook:'New build, backs to trail' },
  { id:'l5', subId:'meadowmont', addr:'622 Meadowmont Ln', price:875000, bd:5, ba:4, sqft:3200, year:2005, dom:9,
    img:'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=900&q=75',
    priceHistory:[850,860,870,875], hook:'Pool + trail access · UNC 8 min' },
  { id:'l6', subId:'carrboro-mill', addr:'104 W Weaver St', price:595000, bd:3, ba:2, sqft:1780, year:1948, dom:22,
    img:'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=900&q=75',
    priceHistory:[620,610,600,595], hook:'Historic bungalow, walk to coop' },
  { id:'l7', subId:'ninth-street', addr:'812 Iredell St', price:565000, bd:3, ba:2, sqft:1620, year:1926, dom:5,
    img:'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=75',
    priceHistory:[540,550,558,565], hook:'Craftsman, 6-min walk to Duke East' },
  { id:'l8', subId:'fearrington', addr:'87 Village Way', price:825000, bd:3, ba:3, sqft:2600, year:1999, dom:44,
    img:'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=75',
    priceHistory:[895,870,845,825], hook:'One-level, wooded acre, no HOA drama' },
  { id:'l9', subId:'governors-club', addr:'82000 Springs Rd', price:1280000, bd:5, ba:5, sqft:4200, year:2003, dom:60,
    img:'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=900&q=75',
    priceHistory:[1350,1320,1300,1280], hook:'On the 8th fairway, updated 2022' },
  { id:'l10', subId:'chapel-woods', addr:'18 Chapel Woods Ct', price:1050000, bd:4, ba:3.5, sqft:3400, year:1982, dom:18,
    img:'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=75',
    priceHistory:[1080,1075,1060,1050], hook:'Deep lot, mid-century-modern feel' },
  { id:'l11', subId:'waterside', addr:'412 Waterside Dr', price:695000, bd:4, ba:3, sqft:2620, year:2009, dom:8,
    img:'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=900&q=75',
    priceHistory:[675,680,690,695], hook:'Cul-de-sac, screened porch' },
  { id:'l12', subId:'southern-village', addr:'304 Aberdeen Dr', price:780000, bd:4, ba:3, sqft:2400, year:2001, dom:14,
    img:'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=900&q=75',
    priceHistory:[760,765,775,780], hook:'Detached garage w/ loft' },
];

// ---- Hierarchical scopes: broad → narrow ----
// Card types injected into feed: intent, region, metro, city, culture, subdivision, listing
window.INTENT_CARDS = [
  { id: 'primary', label: 'Primary Home', emoji: '🏡',
    desc: 'You\'ll live here. Schools, commute, community matter most.',
    traits: { family:70, walkable:60, quiet:60 } },
  { id: 'investment', label: 'Investment', emoji: '📈',
    desc: 'Cash flow or appreciation. Rentability & job growth matter.',
    traits: { yield:80, appreciation:80, family:40 } },
  { id: 'vacation', label: 'Vacation / 2nd Home', emoji: '🏖️',
    desc: 'Weekends & summers. Views, walkability to fun, low upkeep.',
    traits: { outdoors:80, nightlife:50, quiet:60 } },
  { id: 'relocation', label: 'Job Relocation', emoji: '💼',
    desc: 'Being reassigned. Commute to a specific office is the anchor.',
    traits: { walkable:60, family:60 } },
  { id: 'retirement', label: 'Retirement', emoji: '🌅',
    desc: 'Slower pace, healthcare access, low-tax states.',
    traits: { quiet:85, outdoors:65, family:40 } },
];

window.REGION_CARDS = [
  { id: 'sunbelt', label: 'Sun Belt', emoji: '☀️',
    desc: 'NC · SC · GA · TX · FL · AZ. Growing metros, no state income tax (some), warm.',
    highlights: ['Population +2%/yr', 'Low taxes', 'Warm winters'],
    img: 'https://images.unsplash.com/photo-1519999482648-25049ddd37b1?w=900&q=70' },
  { id: 'northeast', label: 'Northeast Corridor', emoji: '🏙️',
    desc: 'NYC · Boston · Philly · DC. Legacy density, top schools, high cost, transit.',
    highlights: ['Best transit', 'Top schools', 'Highest COL'],
    img: 'https://images.unsplash.com/photo-1522083165195-3424ed129620?w=900&q=70' },
  { id: 'west-coast', label: 'West Coast', emoji: '🌊',
    desc: 'CA · WA · OR. Tech hubs, ocean access, wildfire & drought risk.',
    highlights: ['Tech jobs', 'Nature access', 'Cost & fire risk'],
    img: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=900&q=70' },
  { id: 'midwest', label: 'Midwest', emoji: '🌾',
    desc: 'OH · MI · IL · MN. Affordable, 4 seasons, tight-knit cities.',
    highlights: ['Best affordability', 'Manufacturing rebound', 'Cold winters'],
    img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=70' },
  { id: 'mountain', label: 'Mountain West', emoji: '🏔️',
    desc: 'CO · UT · MT · ID · WY. Outdoors, boomtowns, water anxiety.',
    highlights: ['Outdoor life', 'Fastest growth', 'Water scarcity'],
    img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=70' },
];

window.METRO_CARDS = [
  { id: 'rtp', label: 'Research Triangle', emoji: '🎓',
    desc: 'Raleigh · Durham · Chapel Hill, NC. 3 R1 universities, biotech, top public schools.',
    stats: { pop: '2.1M', median: '$425K', jobs: '+3.1%/yr' },
    tags: ['University hub', 'Biotech', 'Best schools'],
    img: 'https://images.unsplash.com/photo-1596496050755-c923e73e42e1?w=900&q=70' },
  { id: 'atl', label: 'Atlanta Metro', emoji: '🍑',
    desc: 'GA. Big-city amenities at Sun Belt prices. Traffic notorious, film & tech.',
    stats: { pop: '6.1M', median: '$380K', jobs: '+2.4%/yr' },
    tags: ['Film industry', 'Fortune 500', 'Airport king'],
    img: 'https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?w=900&q=70' },
  { id: 'aus', label: 'Austin Metro', emoji: '🎸',
    desc: 'TX. Tech influx cooling, weird culture surviving, taxes low.',
    stats: { pop: '2.4M', median: '$520K', jobs: '+2.0%/yr' },
    tags: ['Tech-heavy', 'No state income tax', 'Live music'],
    img: 'https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=900&q=70' },
  { id: 'char', label: 'Charlotte Metro', emoji: '🏦',
    desc: 'NC. Banking capital, NASCAR heritage, fastest-growing East Coast metro.',
    stats: { pop: '2.8M', median: '$405K', jobs: '+2.7%/yr' },
    tags: ['Finance hub', 'Growing fast', 'Affordable'],
    img: 'https://images.unsplash.com/photo-1590756254933-2873d72a83b6?w=900&q=70' },
];

window.CULTURE_CARDS = [
  { id: 'asian', label: 'Asian Community', emoji: '🥢',
    desc: 'Cities with large East / Southeast / South Asian communities, Asian grocery, schools with Mandarin/Korean programs.',
    examples: 'Sunnyvale · Fremont · Bellevue · Cary · Sugar Land',
    img: 'https://images.unsplash.com/photo-1555921015-5532091f6026?w=900&q=70' },
  { id: 'lgbtq', label: 'LGBTQ+ Welcoming', emoji: '🏳️‍🌈',
    desc: 'Municipal Equality Index 90+ · anti-discrimination laws · established queer neighborhoods.',
    examples: 'Provincetown · Asheville · Boystown · Wilton Manors',
    img: 'https://images.unsplash.com/photo-1561551318-8e0f27f9d90a?w=900&q=70' },
  { id: 'faith', label: 'Faith-Anchored', emoji: '⛪',
    desc: 'Neighborhoods anchored by places of worship — church / mosque / temple / synagogue within walking distance.',
    examples: 'Provo, UT · Dearborn, MI · Brooklyn (Boro Park) · Alpharetta',
    img: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=900&q=70' },
  { id: 'foodie', label: 'Foodie Cities', emoji: '🍜',
    desc: 'James Beard density, farmers-market culture, walkable restaurant clusters.',
    examples: 'Portland · Charleston · New Orleans · Durham · Nashville',
    img: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=70' },
  { id: 'trails', label: 'Trail-Runner Life', emoji: '🥾',
    desc: 'National forest / greenway network within 10 min. Bike to trails, ski by weekend.',
    examples: 'Boulder · Bend · Asheville · Chattanooga · Missoula',
    img: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=70' },
];

// ---- Ask-cards: one yes/no question per card ----
// Every ask card has: scopeType, id, q (question), sub (context line), img, chip
window.ASK_POOL = [
  // Intent
  { scopeType:'intent',  id:'primary',    q:'A place to live?',                   sub:'Primary home — schools, commute, community matter.', img:'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70', chip:'🏡 Primary' },
  { scopeType:'intent',  id:'investment', q:'Looking to invest?',                 sub:'Cash flow, cap rate, appreciation.', img:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900&q=70', chip:'📈 Investment' },
  { scopeType:'intent',  id:'vacation',   q:'A weekend / vacation home?',         sub:'Views, low upkeep, walk to fun.', img:'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=900&q=70', chip:'🏖️ Vacation' },
  { scopeType:'intent',  id:'relocation', q:'Job relocation?',                    sub:'Commute to one specific office is the anchor.', img:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&q=70', chip:'💼 Relocation' },
  { scopeType:'intent',  id:'retirement', q:'Retiring soon?',                     sub:'Slower pace, healthcare, low-tax states.', img:'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=900&q=70', chip:'🌅 Retirement' },
  // Region
  { scopeType:'region',  id:'sunbelt',    q:'Sun Belt?',                          sub:'NC · SC · GA · TX · FL · AZ — warm, growing, some no-income-tax.', img:'https://images.unsplash.com/photo-1519999482648-25049ddd37b1?w=900&q=70', chip:'☀️ Sun Belt' },
  { scopeType:'region',  id:'west-coast', q:'West Coast?',                        sub:'CA · WA · OR — tech, ocean, fire & drought risk.', img:'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=900&q=70', chip:'🌊 West Coast' },
  { scopeType:'region',  id:'mountain',   q:'Mountain West?',                     sub:'CO · UT · MT · ID · WY — outdoors, boomtowns, water anxiety.', img:'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=70', chip:'🏔️ Mountain' },
  { scopeType:'region',  id:'northeast',  q:'Northeast Corridor?',                sub:'NYC · Boston · Philly · DC — density, transit, top schools, high cost.', img:'https://images.unsplash.com/photo-1522083165195-3424ed129620?w=900&q=70', chip:'🏙️ Northeast' },
  // State
  { scopeType:'state',   id:'NC',         q:'North Carolina?',                    sub:'RTP · Charlotte · Asheville. #4 fastest growing state.', img:'https://images.unsplash.com/photo-1596496050755-c923e73e42e1?w=900&q=70', chip:'📍 NC' },
  { scopeType:'state',   id:'GA',         q:'Georgia?',                           sub:'Atlanta metro dominant. Film industry, low COL.', img:'https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?w=900&q=70', chip:'📍 GA' },
  { scopeType:'state',   id:'TX',         q:'Texas?',                             sub:'No state income tax. Austin · Dallas · Houston · SA.', img:'https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=900&q=70', chip:'📍 TX' },
  { scopeType:'state',   id:'WA',         q:'Washington state?',                  sub:'Seattle · Bellevue · Spokane. Tech, no income tax, rain.', img:'https://images.unsplash.com/photo-1502175353174-a7a1a9b30329?w=900&q=70', chip:'📍 WA' },
  { scopeType:'state',   id:'FL',         q:'Florida?',                           sub:'Miami · Tampa · Orlando · Jax. No income tax, hurricane insurance.', img:'https://images.unsplash.com/photo-1535498730771-e735b998cd64?w=900&q=70', chip:'📍 FL' },
  // Metro
  { scopeType:'metro',   id:'atl',        q:'Atlanta metro?',                     sub:'6.1M pop · median $380K · film & Fortune 500 · notorious traffic.', img:'https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?w=900&q=70', chip:'🍑 Atlanta' },
  { scopeType:'metro',   id:'rtp',        q:'Research Triangle (NC)?',            sub:'Raleigh · Durham · Chapel Hill. Universities, biotech, top schools.', img:'https://images.unsplash.com/photo-1596496050755-c923e73e42e1?w=900&q=70', chip:'🎓 RTP' },
  { scopeType:'metro',   id:'aus',        q:'Austin metro?',                      sub:'Tech influx cooling, weird culture surviving, no state income tax.', img:'https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=900&q=70', chip:'🎸 Austin' },
  { scopeType:'metro',   id:'char',       q:'Charlotte metro?',                   sub:'Banking capital, fastest-growing East Coast metro, affordable.', img:'https://images.unsplash.com/photo-1590756254933-2873d72a83b6?w=900&q=70', chip:'🏦 Charlotte' },
  { scopeType:'metro',   id:'sea',        q:'Seattle area?',                      sub:'Amazon/MSFT gravity. Bellevue > Seattle for family; islands for quiet.', img:'https://images.unsplash.com/photo-1502175353174-a7a1a9b30329?w=900&q=70', chip:'☕ Seattle' },
  // City
  { scopeType:'city',    id:'chapel-hill',      q:'Chapel Hill, NC?',              sub:'College town · pop 62K · median $685K · Waterside/Meadowmont.', img:'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70', chip:'🏘️ Chapel Hill' },
  { scopeType:'city',    id:'peachtree-corners',q:'Peachtree Corners, GA?',        sub:'Atlanta suburb · pop 42K · tech innovation hub · family-heavy.', img:'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=70', chip:'🏘️ Peachtree Corners' },
  { scopeType:'city',    id:'bellevue',         q:'Bellevue, WA?',                 sub:'Seattle eastside · pop 152K · median $1.2M · top schools · Asian community.', img:'https://images.unsplash.com/photo-1502175353174-a7a1a9b30329?w=900&q=70', chip:'🏘️ Bellevue' },
  { scopeType:'city',    id:'durham',           q:'Durham, NC?',                   sub:'Duke + bull city · pop 285K · median $415K · food scene, urban feel.', img:'https://images.unsplash.com/photo-1596496050755-c923e73e42e1?w=900&q=70', chip:'🏘️ Durham' },
  { scopeType:'city',    id:'cary',             q:'Cary, NC?',                     sub:'RTP suburb · pop 175K · median $625K · #1 safest, huge Asian community.', img:'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=900&q=70', chip:'🏘️ Cary' },
  // Culture / lifestyle
  { scopeType:'culture', id:'asian',      q:'Big Asian community?',               sub:'Grocery, weekend school, boba, dim sum within 10 min.', img:'https://images.unsplash.com/photo-1555921015-5532091f6026?w=900&q=70', chip:'🥢 Asian' },
  { scopeType:'culture', id:'foodie',     q:'Foodie city?',                       sub:'James Beard density, farmers markets, walkable restaurant clusters.', img:'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=70', chip:'🍜 Foodie' },
  { scopeType:'culture', id:'trails',     q:'Trail-runner life?',                 sub:'Greenway/national forest within 10 min. Bike to trails.', img:'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=70', chip:'🥾 Trails' },
  { scopeType:'culture', id:'faith',      q:'Faith-anchored neighborhood?',       sub:'Church / mosque / temple / synagogue walkable.', img:'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=900&q=70', chip:'⛪ Faith' },
  { scopeType:'culture', id:'lgbtq',      q:'LGBTQ+ welcoming?',                  sub:'Municipal Equality Index 90+ · established queer neighborhoods.', img:'https://images.unsplash.com/photo-1561551318-8e0f27f9d90a?w=900&q=70', chip:'🏳️‍🌈 LGBTQ+' },
  // Property style
  { scopeType:'style',   id:'newbuild',   q:'New construction only?',             sub:'2020+ builds. Modern layout, warranty, HOA usually.', img:'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=70', chip:'🔨 New build' },
  { scopeType:'style',   id:'historic',   q:'Historic / older home charm?',       sub:'Pre-1960. Hardwood, character, ongoing maintenance.', img:'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=70', chip:'🕰️ Historic' },
  { scopeType:'style',   id:'condo',      q:'Condo / townhouse OK?',              sub:'Lock-and-leave lifestyle, HOA, less maintenance.', img:'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=70', chip:'🏢 Condo' },
];

// ---- Feed generation: ask-cards interleaved with content ----
// Pattern: ask, ask, ask, [community], ask, [listing], ask, [listing], ask, ...
// Ask ratio front-loaded (learn fast), tapering as we know user.
window.generateFeed = function(size = 80) {
  const feed = [];
  const commList = SUBDIVISIONS.map(s => ({ type:'community', ref:s, key:'c-'+s.id }));
  const listList = LISTINGS.map(l => ({
    type:'listing', ref:l, key:'l-'+l.id,
    sub: SUBDIVISIONS.find(s => s.id === l.subId),
  }));

  // Ask cards ordered by scope: intent first → region → state → metro → city → culture → style
  // Shuffle within each group so users don't see the same order twice
  const byScope = { intent:[], region:[], state:[], metro:[], city:[], culture:[], style:[] };
  ASK_POOL.forEach(a => byScope[a.scopeType].push({ type:'ask', ref:a, key:'ask-'+a.scopeType+'-'+a.id }));
  const shuffle = arr => { for (let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; };
  Object.keys(byScope).forEach(k => shuffle(byScope[k]));
  const asks = [...byScope.intent, ...byScope.region, ...byScope.state, ...byScope.metro, ...byScope.city, ...byScope.culture, ...byScope.style];

  let ai = 0, ci = 0, li = 0;
  for (let i = 0; i < size; i++) {
    // First 6 cards are pure asks (fast onboarding). After that, 1 in 3 is an ask.
    const askTurn = i < 6 || (i % 3 === 0 && ai < asks.length);
    if (askTurn && ai < asks.length) {
      feed.push(asks[ai++]);
    } else if (i % 4 === 0 && commList.length) {
      feed.push(commList[ci++ % commList.length]);
    } else {
      feed.push(listList[li++ % listList.length]);
    }
  }
  return feed;
};

// ---- State ----
window.loadState = function() {
  try {
    const raw = localStorage.getItem(VIBE_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
};

window.saveState = function(state) {
  localStorage.setItem(VIBE_STATE_KEY, JSON.stringify(state));
};

window.clearState = function() {
  localStorage.removeItem(VIBE_STATE_KEY);
};

// ---- Persona derivation ----
window.derivePersona = function(likedIds) {
  if (!likedIds || likedIds.length === 0) {
    return {
      name: 'The Explorer',
      desc: 'You passed on everything so far — that\'s fine, let\'s keep going. Swipe a few more and we\'ll dial in.',
      traits: { family: 50, walkable: 50, quiet: 50, hip: 50, outdoors: 50, nightlife: 50 },
      likedIds: [],
    };
  }
  const liked = SUBDIVISIONS.filter(s => likedIds.includes(s.id));
  const traitKeys = ['family','walkable','quiet','hip','outdoors','nightlife'];
  const traits = Object.fromEntries(traitKeys.map(k => [
    k, Math.round(liked.reduce((a, s) => a + s.traits[k], 0) / liked.length)
  ]));

  let name = 'The Balanced Explorer';
  let desc = 'Your swipes span multiple vibes — you value variety. We\'ll show you a mix.';

  if (traits.family > 75 && traits.outdoors > 65 && traits.quiet > 65) {
    name = 'The Trail-Runner Suburbanite';
    desc = 'Quiet streets, easy access to nature, top schools nearby. Not rural, not urban — the sweet middle.';
  } else if (traits.walkable > 80 && traits.hip > 70) {
    name = 'The Third-Place Urbanist';
    desc = 'Coffee in the morning, restaurants at night, no car if possible. You want your neighborhood to be the destination.';
  } else if (traits.quiet > 85 && traits.outdoors > 75) {
    name = 'The Slow-Living Retreater';
    desc = 'You\'d trade nightlife for stars. Farm-to-table over franchise. Rural but not isolated.';
  } else if (traits.family > 85) {
    name = 'The Family-First Planner';
    desc = 'Schools first, everything else negotiable. New builds and low-traffic streets rank high.';
  } else if (traits.hip > 75 && traits.nightlife > 60) {
    name = 'The Downtown Devotee';
    desc = 'Culture, music, food scene. You want to walk out your door and be in the city.';
  } else if (traits.family > 60 && traits.walkable > 70) {
    name = 'The Village Family';
    desc = 'You want kids AND coffee shops. Small-town feel with real amenities. The rare combo.';
  }
  return { name, desc, traits, likedIds };
};

window.scoreMatch = function(userTraits, subdivision) {
  const keys = Object.keys(userTraits);
  let score = 0, total = 0;
  keys.forEach(k => {
    score += 100 - Math.abs(userTraits[k] - subdivision.traits[k]);
    total += 100;
  });
  return Math.round(score / total * 100);
};

window.rankedMatches = function(userTraits, excludeIds = []) {
  return SUBDIVISIONS
    .filter(s => !excludeIds.includes(s.id))
    .map(s => ({ s, score: scoreMatch(userTraits, s) }))
    .sort((a, b) => b.score - a.score);
};

// ---- Persona-specific reason for a subdivision ----
window.matchReasonFor = function(persona, subdivision) {
  const s = subdivision;
  const reasons = [];
  // Find the traits where BOTH persona and place score high — those are the shared strengths.
  const shared = Object.keys(persona.traits).map(k => ({
    k, both: Math.min(persona.traits[k], s.traits[k]),
    avg: (persona.traits[k] + s.traits[k]) / 2,
  })).sort((a,b) => b.both - a.both);
  const phrases = {
    family: 'family orientation', walkable: 'walkability',
    quiet: 'peace and quiet', hip: 'cultural energy',
    outdoors: 'outdoor access', nightlife: 'nightlife',
  };
  shared.slice(0, 2).forEach(({ k, both }) => {
    if (both > 55) reasons.push(phrases[k]);
  });
  if (reasons.length === 0) {
    // Fallback: pick this place's own top trait
    const topTrait = Object.entries(s.traits).sort((a,b) => b[1] - a[1])[0];
    reasons.push(phrases[topTrait[0]]);
  }
  return reasons.slice(0, 2).join(' + ');
};
