// Percho Discovery Feed v3 — prototype data + feed generator.
// All client-side. State persisted to localStorage.
window.STATE_KEY = 'percho-v3:state:v1';

// ---------- Dimensions ----------
// A small vocabulary — Preference / Listing / Community / Trade-off cards
// all tag themselves against these; the profile is evidence per-dim.
window.DIMS = {
  outdoors:     { label: 'outdoor space',        obs: "You've consistently liked homes with outdoor space." },
  walkable:     { label: 'walkability',          obs: "You've repeatedly preferred walkable neighborhoods." },
  schools:      { label: 'top schools',          obs: "You keep picking places with strong schools nearby." },
  quiet:        { label: 'quiet streets',        obs: "You gravitate to quiet streets over busy corridors." },
  hip:          { label: 'a cultural scene',     obs: "You lean toward places with a cultural scene." },
  entertaining: { label: 'entertaining spaces',  obs: "You've consistently chosen homes designed for entertaining." },
  trails:       { label: 'trails and greenways', obs: "You've saved several homes with trail access." },
  nightlife:    { label: 'nightlife',            obs: "You've picked neighborhoods with real nightlife." },
  family:       { label: 'family-friendliness',  obs: "You prioritize family-oriented neighborhoods." },
  move_in:      { label: 'move-in-ready homes',  obs: "You prefer move-in-ready over projects." },
  space:        { label: 'more square footage',  obs: "You reach for more square footage when you can." },
};

// ---------- Ask pool (Preference cards) ----------
// First 3 in the feed are hard-coded: intent → region → state|metro.
window.ASK_POOL = {
  intent: {
    id: 'primary', scopeType: 'intent',
    q: 'A place to live?',
    sub: 'Primary home — schools, commute, community matter.',
    img: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70',
    chip: '🏡 Primary',
    dimYes: 'family',
  },
  region: {
    id: 'sunbelt', scopeType: 'region',
    q: 'Sun Belt?',
    sub: 'NC · SC · GA · TX · FL · AZ — warm, growing, no-income-tax states.',
    img: 'https://images.unsplash.com/photo-1519999482648-25049ddd37b1?w=900&q=70',
    chip: '☀️ Sun Belt',
    dimYes: 'outdoors',
  },
  state_or_metro: {
    id: 'rtp', scopeType: 'metro',
    q: 'Research Triangle, NC?',
    sub: 'Raleigh · Durham · Chapel Hill. Universities, biotech, top schools.',
    img: 'https://images.unsplash.com/photo-1596496050755-c923e73e42e1?w=900&q=70',
    chip: '🎓 RTP',
    dimYes: 'schools',
  },
};

// Extra ask cards sprinkled in after the 3-card front load.
window.EXTRA_ASKS = [
  { scopeType:'culture', id:'trails',     q:'Trail-runner life?',
    sub:'Greenway / national forest within 10 min. Bike to trails.',
    img:'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=70',
    chip:'🥾 Trails', dimYes:'trails' },
  { scopeType:'culture', id:'foodie',     q:'Foodie city?',
    sub:'Farmers markets, walkable restaurant clusters.',
    img:'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=70',
    chip:'🍜 Foodie', dimYes:'walkable' },
  { scopeType:'city',    id:'chapel-hill', q:'Chapel Hill, NC specifically?',
    sub:'College town · pop 62K · median $685K.',
    img:'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70',
    chip:'🏘️ Chapel Hill', dimYes:'schools' },
  { scopeType:'culture', id:'entertain',  q:'Do you host friends often?',
    sub:'Open kitchens, big islands, dining that flows to outdoors.',
    img:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=70',
    chip:'🍽️ Entertain', dimYes:'entertaining' },
];

// ---------- Listings ----------
window.LISTINGS = [
  {
    id: 'waterside-5122',
    addr: '5122 Lower Creek St', community: 'Waterside', city: 'Chapel Hill, NC',
    price: 749000, bd: 4, ba: 3.5, sqft: 2840,
    img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=70',
    dims: ['entertaining', 'outdoors', 'schools', 'trails', 'family'],
    hook: 'oak-shaded cul-de-sac · kitchen island opens to a screened porch',
  },
  {
    id: 'southern-village-108',
    addr: '108 Market St', community: 'Southern Village', city: 'Chapel Hill, NC',
    price: 695000, bd: 3, ba: 2.5, sqft: 1980,
    img: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=70',
    dims: ['walkable', 'hip', 'family'],
    hook: '4-min walk to Weaver Street Market · village green out the front door',
  },
  {
    id: 'meadowmont-622',
    addr: '622 Meadowmont Ln', community: 'Meadowmont', city: 'Chapel Hill, NC',
    price: 875000, bd: 5, ba: 4, sqft: 3200,
    img: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&q=70',
    dims: ['schools', 'space', 'entertaining', 'move_in'],
    hook: 'pool + tennis club at the corner · 3200sqft, move-in ready',
  },
  {
    id: 'briar-chapel-412',
    addr: '412 Bennett Mountain Tr', community: 'Briar Chapel', city: 'Chapel Hill, NC',
    price: 645000, bd: 4, ba: 3, sqft: 2760,
    img: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=70',
    dims: ['trails', 'family', 'outdoors'],
    hook: '24-mile trail network out the back gate · new build, low upkeep',
  },
  {
    id: 'downtown-durham-318',
    addr: '318 W Main St #4B', community: 'Downtown Durham Lofts', city: 'Durham, NC',
    price: 525000, bd: 2, ba: 2, sqft: 1450,
    img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=70',
    dims: ['walkable', 'hip', 'nightlife'],
    hook: 'exposed brick loft · walk to DPAC and 40 restaurants',
  },
];

// ---------- Communities (subdivision anchors) ----------
window.COMMUNITIES = [
  { id: 'waterside', name: 'Waterside', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=70',
    dims: ['outdoors', 'trails', 'quiet', 'schools', 'family'],
    hook: 'Cul-de-sacs, mature oaks, Bolin Creek Trail runs behind the lots.' },
  { id: 'southern-village', name: 'Southern Village', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=70',
    dims: ['walkable', 'hip', 'family'],
    hook: 'Master-planned village — coffee, dinner, movies walkable from every home.' },
  { id: 'briar-chapel', name: 'Briar Chapel', city: 'Chapel Hill, NC',
    img: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=70',
    dims: ['trails', 'family', 'outdoors'],
    hook: '900 acres · 24 miles of trails · elementary school on-site.' },
];

// ---------- Trade-offs ----------
window.TRADEOFF_POOL = [
  { L: { label: 'Large backyard', dim: 'outdoors' },
    R: { label: 'Updated kitchen', dim: 'entertaining' } },
  { L: { label: 'Better schools', dim: 'schools' },
    R: { label: 'Shorter commute', dim: 'walkable' } },
  { L: { label: 'Walkable neighborhood', dim: 'walkable' },
    R: { label: 'Private yard', dim: 'outdoors' } },
  { L: { label: 'Move-in ready', dim: 'move_in' },
    R: { label: 'Room to grow', dim: 'space' } },
];

// ---------- Challenges ----------
window.CHALLENGE_POOL = [
  { kind: 'guess-price',
    listingId: 'waterside-5122',
    prompt: 'What does this Waterside home sell for?',
    options: [ 549000, 749000, 995000 ],
    correct: 749000,
    teach: 'Waterside median is ~$685K; this one is on the higher end because of the screened porch and lot backing onto trails.' },
  { kind: 'guess-price',
    listingId: 'downtown-durham-318',
    prompt: 'What is this Downtown Durham loft?',
    options: [ 375000, 525000, 720000 ],
    correct: 525000,
    teach: 'Downtown Durham lofts trade at ~$360/sqft — location premium over Chapel Hill single-family per-sqft.' },
];

// ---------- Feed rhythm ----------
// Deterministic first 20, then repeats with reshuffled listing rotation.
// Rhythm rules per discovery-feed.md §2.6:
//   pos 1-3: preference (intent → region → state|metro)
//   listings anchor ~40% (8 of 20)
//   trade-off never before card 5, never > 1 in 6
//   challenge ≤ 10% (2 of 20)
//   insight only fires if profile has an observation with count ≥ 3
window.buildFeed = function() {
  const feed = [];
  // 1-3: hard-coded preference funnel
  feed.push({ type:'preference', ref: ASK_POOL.intent });
  feed.push({ type:'preference', ref: ASK_POOL.region });
  feed.push({ type:'preference', ref: ASK_POOL.state_or_metro });

  // 4-20: interleaved. Positions marked by intent.
  const plan = [
    'listing', 'community', 'preference',        // 4,5,6
    'tradeoff', 'listing', 'challenge',          // 7,8,9
    'listing', 'community', 'insight',           // 10,11,12
    'preference', 'listing', 'tradeoff',         // 13,14,15
    'listing', 'community', 'challenge',         // 16,17,18
    'listing', 'listing',                        // 19,20
  ];
  let li = 0, ci = 0, ai = 0, ti = 0, chi = 0;
  plan.forEach(kind => {
    if (kind === 'listing')       feed.push({ type:'listing',    ref: LISTINGS[li++ % LISTINGS.length] });
    else if (kind === 'community') feed.push({ type:'community',  ref: COMMUNITIES[ci++ % COMMUNITIES.length] });
    else if (kind === 'preference') feed.push({ type:'preference', ref: EXTRA_ASKS[ai++ % EXTRA_ASKS.length] });
    else if (kind === 'tradeoff')  feed.push({ type:'tradeoff',   ref: TRADEOFF_POOL[ti++ % TRADEOFF_POOL.length] });
    else if (kind === 'challenge') feed.push({ type:'challenge',  ref: CHALLENGE_POOL[chi++ % CHALLENGE_POOL.length] });
    else if (kind === 'insight')   feed.push({ type:'insight' }); // resolved at render time
  });

  // Cards 21+ — loop more listings/community/preference/tradeoff/challenge
  // (no more insights beyond position 12; keep the feed varied for a long session).
  const tail = ['listing','preference','listing','community','tradeoff','listing','challenge','listing','community','listing','preference','listing','tradeoff','listing','community','listing','preference','listing','listing','challenge'];
  tail.forEach(kind => {
    if (kind === 'listing')       feed.push({ type:'listing',    ref: LISTINGS[li++ % LISTINGS.length] });
    else if (kind === 'community') feed.push({ type:'community',  ref: COMMUNITIES[ci++ % COMMUNITIES.length] });
    else if (kind === 'preference') feed.push({ type:'preference', ref: EXTRA_ASKS[ai++ % EXTRA_ASKS.length] });
    else if (kind === 'tradeoff')  feed.push({ type:'tradeoff',   ref: TRADEOFF_POOL[ti++ % TRADEOFF_POOL.length] });
    else if (kind === 'challenge') feed.push({ type:'challenge',  ref: CHALLENGE_POOL[chi++ % CHALLENGE_POOL.length] });
  });
  return feed;
};

// ---------- State ----------
window.defaultState = function() {
  return {
    scope: { intent:[], region:[], state:[], metro:[], city:[], culture:[], style:[] },
    scopeRejected: { intent:[], region:[], state:[], metro:[], city:[], culture:[], style:[] },
    profile: [], // [{ dim, evidence_count }]
    tradeoffs: [], // [{ dim_L, dim_R, chosen }]
    liked: [], passed: [], saved: [],
    insightsFired: [],
    swipes: 0,
  };
};

window.loadState = function() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    // repair
    const d = defaultState();
    for (const k of Object.keys(d)) if (!(k in s)) s[k] = d[k];
    return s;
  } catch { return defaultState(); }
};
window.saveState = function(s) { localStorage.setItem(STATE_KEY, JSON.stringify(s)); };
window.clearState = function() { localStorage.removeItem(STATE_KEY); };

// ---------- Profile helpers ----------
window.bumpDim = function(state, dim, delta = 1) {
  if (!dim) return;
  let e = state.profile.find(x => x.dim === dim);
  if (!e) { e = { dim, evidence_count: 0 }; state.profile.push(e); }
  e.evidence_count += delta;
};

window.topDims = function(state, n = 3) {
  return [...state.profile]
    .filter(e => e.evidence_count > 0)
    .sort((a,b) => b.evidence_count - a.evidence_count)
    .slice(0, n);
};

// Find a dim to reference for a listing/community WHY: intersection of item.dims × profile top dims.
window.whyDimFor = function(state, item) {
  const top = topDims(state, 5).map(e => e.dim);
  const hit = (item.dims || []).find(d => top.includes(d));
  return hit || (item.dims && item.dims[0]) || null;
};

window.whyLine = function(state, item) {
  const dim = whyDimFor(state, item);
  if (!dim) return "New to Percho — swipe a few more and we'll personalize the WHY.";
  const e = state.profile.find(x => x.dim === dim);
  const count = e ? e.evidence_count : 0;
  if (count >= 2) {
    return `Because you've picked ${count} places with ${DIMS[dim].label} — this one has it too.`;
  }
  return `Featuring ${DIMS[dim].label} — a dimension you've started to signal interest in.`;
};

// Insight fires only when at least one dim has evidence_count >= 3 and hasn't fired yet.
window.pickInsight = function(state) {
  const eligible = state.profile
    .filter(e => e.evidence_count >= 3 && !state.insightsFired.includes(e.dim))
    .sort((a,b) => b.evidence_count - a.evidence_count);
  if (!eligible.length) return null;
  const e = eligible[0];
  return {
    dim: e.dim,
    text: DIMS[e.dim].obs,
    evidence: `${e.evidence_count} signals so far.`,
  };
};

window.fmtPrice = function(n) {
  if (n >= 1000000) return '$' + (n/1000000).toFixed(2) + 'M';
  return '$' + Math.round(n/1000) + 'K';
};
