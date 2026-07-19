// Mock video sources for swipe feed.
// In production these become CF Stream HLS URLs. For demo we use looping
// Ken Burns over the listing cover photo to simulate a video without
// actually hosting MP4s.
window.SWIPE_FEED = window.LISTINGS.map((L, i) => ({
  ...L,
  // For each listing, an additional "ambience" image of a different luxury
  // angle (interior / exterior / pool) to rotate through.
  angles: [
    L.cover,
    [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1600&h=2400&fit=crop',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&h=2400&fit=crop',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&h=2400&fit=crop',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&h=2400&fit=crop',
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1600&h=2400&fit=crop',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&h=2400&fit=crop',
    ][i % 6],
  ],
  agent: { name: 'Vivian Zhang', avatar: window.AGENT.avatar },
  community: [
    'Bridle Trails',
    'Houghton',
    'Medina',
    'Madison Park',
    'Clyde Hill',
    'Downtown Kirkland',
  ][i % 6],
  schools: [
    'Bellevue HS · 9',
    'Lake WA HS · 10',
    'Bellevue HS · 9',
    'Garfield HS · 8',
    'Bellevue HS · 9',
    'Lake WA HS · 10',
  ][i % 6],
  commute: [
    '18m to Microsoft',
    '22m to SLU',
    '14m to Microsoft',
    '11m to Downtown',
    '16m to Microsoft',
    '19m to SLU',
  ][i % 6],
}));
