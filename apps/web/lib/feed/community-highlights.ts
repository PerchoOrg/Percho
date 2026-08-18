/**
 * Nextdoor `attributes` / `interests` → Percho `DimKey`, for the community
 * card's three "community highlights" tiles.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * The redline's community card has three glass tiles under the place name
 * (Family Friendly · Walkable · Great Schools). `CommunityFace` renders them
 * from `card.dims`, falling back to `card.pills` — but the feed route never sent
 * either field, so the whole tiles row was skipped and the card had a hole in it
 * exactly where the redline says highlights go. Owner caught it on device:
 * 「少了community highlights ... 这一部分不能空」.
 *
 * The fix is data, not layout: `communities` already carries real per-community
 * signals from the Nextdoor seed (§20260715115000) that nothing has ever read.
 * Measured over the 8,679 feed-eligible communities (active + cover image):
 *
 *   attributes present   7,875  (90.7%)
 *   interests present    8,466  (97.5%)
 *   neither                206  (2.4%)
 *
 * ── Two sources, deliberately ranked ────────────────────────────────────────
 *
 * `attributes` is what residents SAY about the place ("Peaceful", "Walkability",
 * "Family Friendly") — a direct claim about the neighbourhood, so it is read
 * first and can fill all three tiles on its own.
 *
 * `interests` is what residents DO ("Hiking & Trails", "Dinner Parties"). That
 * is weaker evidence about a place — a neighbour who likes hiking does not prove
 * the neighbourhood has trails — so it only TOPS UP when attributes yield fewer
 * than three. With attributes alone 82.0% of communities reach three tiles;
 * topping up from interests takes that to 95.7%, with 2.5% still yielding none.
 *
 * A community that yields nothing renders no tiles. That is intentional and is
 * the one case the card must still survive: inventing "Family Friendly" for a
 * subdivision we know nothing about is fabricated editorial about a real place,
 * which §3's "real or absent" rule forbids. 219 of 8,679 cards stay tile-less.
 *
 * ── Why a hand-curated map and not fuzzy matching ───────────────────────────
 *
 * The attribute vocabulary has a 193-value long tail that is largely noise:
 * "Traceylynn Consultant", "Needs More Raging Parties", "Lash Strips",
 * "I Can Deer Hunt In My Yard Lol", plus per-business spam ("Catering",
 * "Dine-In", "Take-out"). Only the head is meaningful, and only some of the head
 * maps honestly onto a Percho dim. Substring/embedding matching would drag the
 * junk in. So the map below is explicit: an attribute is rendered only if a
 * human decided it means the same thing as the dim.
 *
 * Spanish variants are included because they are real values in the seed
 * (Nextdoor's Spanish-language neighbourhoods) and the buyer pool is
 * multilingual by positioning (CLAUDE.md §1) — the rendered LABEL is still
 * English, only the input token is Spanish.
 *
 * Not mapped on purpose:
 *   'Safe' / 'Friendly' / 'Neighbors' / 'Clean' — high frequency but they are
 *   not any of the 11 dims; forcing them into `quiet` or `family` would put a
 *   claim on the card the data does not make.
 *   'nightlife' — no attribute in the vocabulary honestly means nightlife.
 */

import type { DimKey } from '@percho/shared/types';

/**
 * Resident-stated attributes. Highest-confidence source: a direct claim about
 * the neighbourhood itself.
 */
const ATTRIBUTE_DIM: Record<string, DimKey> = {
  // quiet
  Peaceful: 'quiet',
  Quiet: 'quiet',
  Privacy: 'quiet',
  Secluded: 'quiet',
  Tranquilo: 'quiet',
  Silencioso: 'quiet',
  Apacible: 'quiet',
  Privacidad: 'quiet',
  // family
  'Family Friendly': 'family',
  Kids: 'family',
  'Ideal para familias': 'family',
  // walkable
  Walkability: 'walkable',
  Walking: 'walkable',
  Sidewalks: 'walkable',
  'Para caminar': 'walkable',
  Aceras: 'walkable',
  'Zonas peatonales': 'walkable',
  // schools
  Schools: 'schools',
  // outdoors
  Trees: 'outdoors',
  Woods: 'outdoors',
  Nature: 'outdoors',
  Parks: 'outdoors',
  Gardens: 'outdoors',
  Wildlife: 'outdoors',
  Birds: 'outdoors',
  Green: 'outdoors',
  Landscaping: 'outdoors',
  Árboles: 'outdoors',
  Parques: 'outdoors',
  Bosque: 'outdoors',
  'Flora y fauna': 'outdoors',
  Naturaleza: 'outdoors',
  Jardines: 'outdoors',
  Pájaros: 'outdoors',
  Paisajismo: 'outdoors',
  // trails (and water/terrain features people walk to)
  Trails: 'trails',
  Hiking: 'trails',
  Running: 'trails',
  Creek: 'trails',
  Lake: 'trails',
  River: 'trails',
  Hills: 'trails',
  Beach: 'trails',
  Ocean: 'trails',
  Bay: 'trails',
  Pond: 'trails',
  Lago: 'trails',
  // hip
  Restaurants: 'hip',
  Food: 'hip',
  Shopping: 'hip',
  Stores: 'hip',
  Downtown: 'hip',
  Urban: 'hip',
  Eclectic: 'hip',
  Historic: 'hip',
  Comida: 'hip',
  'Centro de la ciudad': 'hip',
  // space
  Yards: 'space',
  Large: 'space',
  Open: 'space',
  Grande: 'space',
  Abierto: 'space',
  Patios: 'space',
  // entertaining
  Events: 'entertaining',
  Golf: 'entertaining',
  Tennis: 'entertaining',
  Pool: 'entertaining',
  Eventos: 'entertaining',
  Tenis: 'entertaining',
  // move_in
  'Well Maintained': 'move_in',
  'Bien cuidado': 'move_in',
};

/**
 * Resident interests. Weaker evidence — what people DO, not what the place IS —
 * so this only fills tiles the attributes left empty. See the header.
 */
const INTEREST_DIM: Record<string, DimKey> = {
  'Gardening & Landscape': 'outdoors',
  Wildlife: 'outdoors',
  Birding: 'outdoors',
  'Hiking & Trails': 'trails',
  Running: 'trails',
  'Biking & Cycling': 'trails',
  'Canoeing & Kayaking': 'trails',
  Fishing: 'trails',
  Camping: 'trails',
  Walking: 'walkable',
  'Parenting School-Age Kids': 'family',
  'Parenting Babies to 5 y/os': 'family',
  'Parenting Teens': 'family',
  'Family Activities': 'family',
  'Block Parties': 'family',
  'Dinner Parties': 'entertaining',
  'BBQ & Grilling': 'entertaining',
  'Wine Tasting': 'entertaining',
  Golf: 'entertaining',
  Tennis: 'entertaining',
  Swimming: 'entertaining',
  'Seeing Live Music': 'hip',
  'Performing Arts': 'hip',
  Dancing: 'hip',
  'Local History': 'hip',
  'Home Improvement & DIY': 'move_in',
  Woodworking: 'move_in',
};

/** The redline's community card has exactly three tiles. */
export const COMMUNITY_HIGHLIGHT_COUNT = 3;

/**
 * Up to three dims for a community's highlight tiles.
 *
 * Order is the source's own order (Nextdoor returns attributes roughly by how
 * often residents cited them), not a Percho-imposed ranking — the tile row
 * should read as "what this neighbourhood is known for", strongest first.
 *
 * @returns 0-3 distinct dims. Empty means the community has no usable signal and
 * the card renders no tiles rather than invented ones.
 */
export function communityHighlightDims(args: {
  attributes?: string[] | null;
  interests?: string[] | null;
}): DimKey[] {
  const out: DimKey[] = [];

  const take = (tokens: string[] | null | undefined, table: Record<string, DimKey>) => {
    for (const raw of tokens ?? []) {
      if (out.length >= COMMUNITY_HIGHLIGHT_COUNT) return;
      if (typeof raw !== 'string') continue;
      // Seed values carry stray trailing spaces ("Casas ", "perros ").
      const dim = table[raw.trim()];
      if (dim && !out.includes(dim)) out.push(dim);
    }
  };

  take(args.attributes, ATTRIBUTE_DIM);
  take(args.interests, INTEREST_DIM);
  return out;
}
