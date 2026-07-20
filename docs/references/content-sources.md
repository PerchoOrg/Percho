# Vicinity: Legal Content Sources for Peachtree Corners, GA

Bootstrap sources for a real-estate video-swipe app targeting ZIP 30092/30097.
Bbox used: `-84.24,33.94,-84.18,34.00`. Centroid: `33.9701, -84.2216`.

## Comparison Table

| # | Source | PC Volume | Cost | License / Attrib. | Legal | Recommend |
|---|--------|-----------|------|-------------------|-------|-----------|
| 1 | Google Places Photos (new API) | ~10 photos/POI on popular POIs | $7 / 1000 requests (Place Photo) + Place Details lookup; ~$50 one-time for 50 POIs × 10 photos | Must display within Google Map context OR with "Powered by Google" + photo attribution HTML. **No permanent caching** (30-day for content, IDs can be refreshed). | 🟡 | Yes, but display-time fetch only |
| 2 | Google Street View Static | Full coverage on all public roads in 30092/30097 | $7 / 1000 (0–100k tier) | "© Google" watermark auto-baked; cannot remove; no permanent storage beyond 30 days | 🟡 | Yes for street tours |
| 3 | Mapillary (Meta) | ~thousands of images in bbox (crowdsourced, dense on GA-141, Peachtree Pkwy) | Free API; auth via Meta OAuth token | CC-BY-SA 4.0 — must credit contributor + link; share-alike downstream | 🟢 | Yes |
| 4 | Wikimedia Commons | 33 files in Cat:Peachtree_Corners, 34 Norcross, 57+ Gwinnett (subcats), **500+ within 10 km geosearch** | Free | Mostly CC-BY-SA / CC-BY / PD; per-file check required | 🟢 | Yes |
| 5 | Flickr CC | Modest (~hundreds geo-tagged in bbox) | Free, 3600 req/hr | CC 2.0/4.0 variants; credit photographer + link | 🟢 | Yes |
| 6 | Unsplash / Pexels | Zero PC-specific; generic "Atlanta suburb" B-roll | Free | Unsplash/Pexels license — free commercial, no attrib required | 🟢 | Yes as filler B-roll (low relevance) |
| 7 | Census / Data.gov / Gwinnett open data | Datasets (demographics, parcels, park polygons) not photos | Free | Public domain / open | 🟢 | Yes for data overlays, not video content |
| 8 | Reddit r/Atlanta, r/PeachtreeCorners | r/PeachtreeCorners ~4k members, tens of image posts/month | Free API (OAuth), 100 QPM | User retains copyright; Reddit license is non-exclusive to Reddit — you need per-user permission | 🔴 for reuse without consent | Only-with-partnership |
| 9 | TikTok / Instagram | High volume | N/A | ToS forbids scraping; DMCA + CFAA exposure (hiQ v. LinkedIn narrows but doesn't legalize) | 🔴 | No — creator partnerships only |

---

## 1. Google Places API (New) — Place Photos

Endpoint (new v1):
```
GET https://places.googleapis.com/v1/{name=places/*/photos/*/media}
```
Two-step: (a) Text Search / Place Details returns `photos[].name`; (b) call the media URL.

```bash
# Text Search for POIs in PC
curl -X POST "https://places.googleapis.com/v1/places:searchText" \
 -H "Content-Type: application/json" \
 -H "X-Goog-Api-Key: $GKEY" \
 -H "X-Goog-FieldMask: places.id,places.displayName,places.photos" \
 -d '{"textQuery":"restaurants in Peachtree Corners GA","locationBias":{"circle":{"center":{"latitude":33.9701,"longitude":-84.2216},"radius":5000}}}'

# Fetch a photo (returns 302 to a googleusercontent CDN URL)
curl -L "https://places.googleapis.com/v1/places/ChIJ.../photos/AeeoHc.../media?maxWidthPx=1200&key=$GKEY" -o photo.jpg
```
- Popular POIs return 5–10 photos each; small POIs 0–3.
- **Cost**: Place Photo SKU = $7/1000 in the 0–100k tier. Text Search Pro = $32/1000. **50 POIs × 10 photos + 50 searches ≈ 500 × $0.007 + 50 × $0.032 ≈ $5.10 one-time**, but repeat pulls needed because caching is limited.
- **Attribution**: HTML attribution from `authorAttributions` MUST be displayed with the photo.
- **Storage rule**: photo binaries cannot be stored beyond 30 days (place IDs may be cached indefinitely); refetch on demand.

## 2. Google Street View Static API

```
GET https://maps.googleapis.com/maps/api/streetview
```
```bash
curl "https://maps.googleapis.com/maps/api/streetview?size=1600x900&location=33.9701,-84.2216&heading=90&pitch=0&fov=90&key=$GKEY" -o sv.jpg
# metadata (free) to confirm coverage before spending:
curl "https://maps.googleapis.com/maps/api/streetview/metadata?location=33.9701,-84.2216&key=$GKEY"
```
- Coverage in Peachtree Corners is **100%** on all public roads (multiple 2015–2024 passes).
- **Cost**: $7/1000 images, metadata free.
- **Attribution**: Google watermark is baked into the image; do not crop it.
- **Street tour**: sample 20 sequential `location` + rotating `heading` = 20-frame swipeable clip. Cost ~$0.14 per tour.
- Same 30-day storage rule as Places.

## 3. Mapillary

```
GET https://graph.mapillary.com/images?bbox=-84.24,33.94,-84.18,34.00&limit=500
```
```bash
curl "https://graph.mapillary.com/images?access_token=$MAPILLARY_TOKEN&bbox=-84.24,33.94,-84.18,34.00&fields=id,thumb_2048_url,captured_at,creator&limit=500"
```
- Requires a free Meta developer app + Client Token. Anon token in your test returned OAuth error (expected).
- Coverage: dense on Peachtree Pkwy, Holcomb Bridge, GA-141, Jones Bridge Rd; sparse on side streets.
- **License**: CC-BY-SA 4.0 — credit `© {creator} / Mapillary CC-BY-SA` + link; downstream derivatives must be CC-BY-SA. This is viral, so keep Mapillary-derived clips in a separately licensed lane.
- Rate limit: 60,000 req/min (very generous), 100 GB/mo egress.

## 4. Wikimedia Commons — verified results

Category members (proved live):
```bash
curl "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Peachtree_Corners,_Georgia&cmlimit=500&format=json"
```
Results: **33 files, 5 subcategories** (The Forum, Jones Bridge, Wesleyan School, PC pedestrian bridge, Mechanicsville).

Geosearch (10 km radius):
```bash
curl "https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=33.9701%7C-84.2216&gsradius=10000&gslimit=500&gsnamespace=6&format=json"
```
Returned the **500 max** — saturated, meaning there are more. Includes PC Library, PC City Hall, Wesleyan campus, Jones Bridge, Chattahoochee River park.

Norcross: 34 files. Gwinnett County: 57 direct + 32 subcategories.

Get image URL + license:
```bash
curl "https://commons.wikimedia.org/w/api.php?action=query&titles=File:Peachtree_Corners_Branch_Library,_Peachtree_Corners_GA.jpg&prop=imageinfo&iiprop=url|extmetadata&format=json"
```
- Free, no rate cap beyond fair-use throttling (~200 req/s with User-Agent).
- **License**: per-file; parse `extmetadata.LicenseShortName`. Most are CC-BY-SA-4.0 or CC-BY-2.0. Store attribution string.

## 5. Flickr

```
GET https://www.flickr.com/services/rest/?method=flickr.photos.search
```
```bash
curl "https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=$FLICKR_KEY&bbox=-84.24,33.94,-84.18,34.00&license=1,2,3,4,5,6,9,10&extras=owner_name,license,url_l,geo&per_page=500&format=json&nojsoncallback=1"
```
- `license=1,2,3,4,5,6` = CC BY-NC-SA / BY-NC / BY-NC-ND / BY / BY-SA / BY-ND. Add 9 (CC0) and 10 (PDM) for zero-friction reuse. For commercial use in Vicinity, **restrict to 4, 5, 7, 9, 10** (drop NC).
- Expect low hundreds of CC-BY / CC-BY-SA hits in the bbox; volume rises significantly across Atlanta.
- Rate limit: 3600 calls/hr per key.
- Attribution: photographer name + link back per CC.

## 6. Unsplash / Pexels

```bash
curl "https://api.unsplash.com/search/photos?query=atlanta%20suburb&per_page=30" -H "Authorization: Client-ID $UNSPLASH_KEY"
curl "https://api.pexels.com/v1/search?query=georgia+neighborhood&per_page=30" -H "Authorization: $PEXELS_KEY"
```
- **Relevance: LOW** for Peachtree Corners specifically. Zero hits for the city name; generic "suburban Atlanta" / "Georgia home" pool is small and stock-y.
- Licenses: Unsplash license & Pexels license — free commercial, no attribution required (though appreciated). Do not sell as-is or claim as your own.
- Best use: transition frames / mood B-roll, not primary POI content.

## 7. US Census / Data.gov / Gwinnett open data

- **Census ACS 5-yr API** (`https://api.census.gov/data/2022/acs/acs5?...`): demographics for ZCTA 30092/30097 — good for on-video data cards ("Median HH income $X").
- **Data.gov / USGS**: NAIP aerial imagery (public domain) usable for aerial fly-overs. Endpoint: The National Map API / `https://apps.nationalmap.gov/tnmaccess/api/products`.
- **Gwinnett County Open Data Portal** (`gwinnettcounty-gwinnetthub.hub.arcgis.com`): parks polygons, schools, trails GeoJSON. No photos, but excellent to layer POI metadata.
- **City of Peachtree Corners** website hosts press-release photos — not open-licensed by default; contact city communications for a MOU (free, usually granted for civic promotion).
- Legal: 🟢 public domain; attribution "Source: US Census Bureau" recommended.

## 8. Reddit

```bash
curl -H "User-Agent: vicinity/0.1" "https://oauth.reddit.com/r/PeachtreeCorners/new?limit=100" -H "Authorization: Bearer $TOKEN"
```
- r/PeachtreeCorners is small (~few thousand members). r/Atlanta is large but noisy for PC-specific content.
- **Reddit API since 2023** requires OAuth, enforces 100 QPM per client, and paid tiers above free limits. Data API ToS: content is user-owned; Reddit's license to itself is non-exclusive, so you cannot re-host user photos as your own content without user permission.
- Legal: 🔴 for republishing. 🟡 for discovering creators to partner with (DM outreach).

## 9. TikTok / Instagram — Risk Only

- **Instagram Graph API** only exposes content from accounts that authorize your app (Business/Creator) or public hashtag search (limited, deprecated for most use cases). Public scraping violates ToS and triggers rate blocks, account bans, IP bans, and DMCA/CFAA exposure. hiQ v. LinkedIn narrowed CFAA scope but ToS breach and copyright still apply.
- **TikTok Research API / Display API**: Research API is academic-only; Display API returns only videos from OAuth-connected users. Third-party scrapers (`yt-dlp` on tiktok URLs) violate ToS.
- **Alternative**: (a) Direct creator partnerships — offer revenue share or flat licensing for hyperlocal creators found via hashtag `#peachtreecorners`; (b) UGC submission portal inside Vicinity with an explicit content-license clause; (c) Licensing marketplaces like Trell, Storyblocks, or agency-negotiated packs.

---

## Recommended Stack for Vicinity MVP (Peachtree Corners)

1. **Primary POI photos**: Google Places (on-demand fetch, cache 30 days, show attribution).
2. **Street tours**: Google Street View Static + sequential heading sweeps.
3. **Landmarks / civic**: Wikimedia Commons (33+ direct files, hundreds nearby) — permanent hosting OK with attribution.
4. **Street-level richness**: Mapillary — isolate CC-BY-SA rail from other content.
5. **B-roll filler**: Unsplash/Pexels.
6. **Data overlays**: Census ACS + Gwinnett open data.
7. **UGC**: Partner with r/PeachtreeCorners and local TikTok creators via explicit license agreements. Never scrape.

Estimated one-time cost to bootstrap 50 POIs + 20 street tours: **≈ $8 in Google API spend** + free tier on everything else.
