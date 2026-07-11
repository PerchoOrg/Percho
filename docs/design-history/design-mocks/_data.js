// Shared mock data for the 4 design comps.
// All mansion photos are stable Unsplash luxury-home images (demo only).
window.AGENT = {
  name: "Vivian Zhang",
  title: "Listing Specialist · Eastside Luxury",
  brokerage: "Compass — Bellevue",
  city: "Bellevue, WA",
  license: "WA #135-291",
  years: 11,
  sold: 184,
  avg_dom: 9,
  rating: 4.96,
  reviews: 127,
  bio: "I sell the Eastside the way it deserves — with cinematography, patient buyer matching, and a closing record that speaks for itself. Every listing on this page was shot, edited, and marketed by my team.",
  avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop",
  contact: { phone: "(425) 555-0144", email: "vivian@percho.homes" },
};

window.LISTINGS = [
  {
    id: 1, address: "12814 NE 24th St", city: "Bellevue, WA", neighborhood: "West Bellevue",
    price: 4250000, beds: 5, baths: 4.5, sqft: 5840,
    cover: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&h=2000&fit=crop",
    style: "Modern Contemporary", status: "Just Listed",
  },
  {
    id: 2, address: "1408 Lakeside Dr S", city: "Kirkland, WA", neighborhood: "Houghton",
    price: 6890000, beds: 6, baths: 5.5, sqft: 7210,
    cover: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&h=2000&fit=crop",
    style: "Lakefront Modern", status: "Active",
  },
  {
    id: 3, address: "3425 Evergreen Point Rd", city: "Medina, WA", neighborhood: "Medina",
    price: 12500000, beds: 7, baths: 8, sqft: 9840,
    cover: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1600&h=2000&fit=crop",
    style: "Estate", status: "By Appointment",
  },
  {
    id: 4, address: "808 Lake Washington Blvd", city: "Seattle, WA", neighborhood: "Madison Park",
    price: 3950000, beds: 4, baths: 3.5, sqft: 4320,
    cover: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=1600&h=2000&fit=crop",
    style: "Craftsman Modern", status: "Just Listed",
  },
  {
    id: 5, address: "9842 Points Dr NE", city: "Clyde Hill, WA", neighborhood: "Clyde Hill",
    price: 7300000, beds: 5, baths: 6, sqft: 6890,
    cover: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&h=2000&fit=crop",
    style: "Modern Estate", status: "Active",
  },
  {
    id: 6, address: "115 Lakeshore Plaza", city: "Kirkland, WA", neighborhood: "Downtown",
    price: 2890000, beds: 3, baths: 3, sqft: 2640,
    cover: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1600&h=2000&fit=crop",
    style: "Penthouse", status: "Active",
  },
];

window.fmtPrice = (n) => "$" + (n / 1_000_000).toFixed(2) + "M";
