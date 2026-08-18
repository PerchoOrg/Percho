import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchText = vi.fn();
const searchNearby = vi.fn(async (_input?: unknown): Promise<unknown[]> => []);

vi.mock('./google-places', async () => {
  const actual = await vi.importActual<typeof import('./google-places')>('./google-places');
  return {
    ...actual,
    searchText: (query: string, bias?: unknown) => searchText(query, bias),
    searchNearby: (input: unknown) => searchNearby(input),
  };
});

const { resolveCandidates } = await import('./community-tour');

const CENTER = { lat: 34.09057, lng: -84.141518 }; // Aberdeen, Suwanee GA
const RADIUS = 6000;
const SECTOR = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-84.2, 34.0],
      [-84.1, 34.0],
      [-84.1, 34.2],
      [-84.2, 34.2],
      [-84.2, 34.0],
    ],
  ],
};

const candidate = (name: string) => ({
  name,
  bucket: 'outdoor',
  why: '',
  shot_note: '',
  source: '',
  confidence: 'high' as const,
  agent: 'gemini_a' as const,
});

const place = (over: Record<string, unknown> = {}) => ({
  id: 'place-1',
  displayName: { text: 'Sims Lake Park' },
  formattedAddress: '4600 Suwanee Dam Rd, Suwanee, GA',
  types: ['park'],
  businessStatus: 'OPERATIONAL',
  location: { latitude: CENTER.lat, longitude: CENTER.lng },
  photos: [{ name: 'p1' }, { name: 'p2' }, { name: 'p3' }],
  ...over,
});

beforeEach(() => {
  searchText.mockReset();
  searchNearby.mockReset();
  searchNearby.mockResolvedValue([]);
});

describe('resolveCandidates — query shape', () => {
  it('searches the NAME plus the community locality, never an address', async () => {
    searchText.mockResolvedValue([place()]);
    await resolveCandidates([candidate('Sims Lake Park')], CENTER, RADIUS, 'Suwanee, GA');
    expect(searchText).toHaveBeenCalledWith('Sims Lake Park, Suwanee, GA', {
      center: CENTER,
      radiusMeters: RADIUS,
    });
  });

  it('biases to the community circle so a common name resolves nearby', async () => {
    searchText.mockResolvedValue([place()]);
    await resolveCandidates([candidate('Aberdeen')], CENTER, RADIUS, 'Suwanee, GA');
    const [, bias] = searchText.mock.calls[0]!;
    expect(bias).toEqual({ center: CENTER, radiusMeters: RADIUS });
  });

  it('still works with no locality', async () => {
    searchText.mockResolvedValue([place()]);
    await resolveCandidates([candidate('Sims Lake Park')], CENTER, RADIUS);
    expect(searchText).toHaveBeenCalledWith('Sims Lake Park', expect.anything());
  });
});

describe('resolveCandidates — firewall', () => {
  it('drops a Google result outside the sector polygon before photos', async () => {
    searchText.mockResolvedValue([place({ location: { latitude: 34.1, longitude: -84.05 } })]);
    const out = await resolveCandidates(
      [candidate('Wrong-sector Park')],
      CENTER,
      RADIUS,
      'Suwanee, GA',
      SECTOR,
    );
    expect(out.resolved).toHaveLength(0);
    expect(out.dropped[0]!.reason).toBe('outside sector polygon');
  });

  it('keeps a Google result inside the sector polygon', async () => {
    searchText.mockResolvedValue([place()]);
    const out = await resolveCandidates(
      [candidate('In-sector Park')],
      CENTER,
      RADIUS,
      'Suwanee, GA',
      SECTOR,
    );
    expect(out.resolved).toHaveLength(1);
  });

  it('filters top-rated nearby additions through the same sector polygon', async () => {
    searchText.mockResolvedValue([]);
    searchNearby.mockResolvedValue([
      place({
        id: 'outside-top',
        rating: 4.9,
        userRatingCount: 500,
        location: { latitude: 34.1, longitude: -84.05 },
      }),
      place({ id: 'inside-top', rating: 4.8, userRatingCount: 400 }),
    ]);
    const out = await resolveCandidates([], CENTER, RADIUS, 'Suwanee, GA', SECTOR);
    expect(out.top_rated.map((p) => p.place_id)).toEqual(['inside-top']);
  });

  it('drops a match that resolved up to the town', async () => {
    // Verified live: "Suwanee Town Center" comes back as the city of Suwanee.
    searchText.mockResolvedValue([
      place({ displayName: { text: 'Suwanee' }, types: ['locality', 'political'] }),
    ]);
    const out = await resolveCandidates(
      [candidate('Suwanee Town Center')],
      CENTER,
      RADIUS,
      'Suwanee, GA',
    );
    expect(out.resolved).toHaveLength(0);
    expect(out.dropped[0]!.reason).toContain('locality');
  });

  it('drops a closed business', async () => {
    searchText.mockResolvedValue([place({ businessStatus: 'CLOSED_PERMANENTLY' })]);
    const out = await resolveCandidates([candidate('Old Diner')], CENTER, RADIUS, 'Suwanee, GA');
    expect(out.resolved).toHaveLength(0);
    expect(out.dropped[0]!.reason).toContain('not operational');
  });

  it('keeps a real POI and scores it on its photo count', async () => {
    searchText.mockResolvedValue([place()]);
    const out = await resolveCandidates(
      [candidate('Sims Lake Park')],
      CENTER,
      RADIUS,
      'Suwanee, GA',
    );
    expect(out.resolved).toHaveLength(1);
    // photo_count only became non-zero when the field mask started asking for
    // photos; before that every agent-resolved POI scored 0 and the ranking
    // meant nothing.
    expect(out.resolved[0]!.photo_count).toBe(3);
    expect(out.resolved[0]!.score).toBeGreaterThan(0);
  });

  it('deduplicates aliases that resolve to the same Google place_id', async () => {
    searchText.mockResolvedValue([place()]);
    const out = await resolveCandidates(
      [candidate('George Pierce Park'), candidate('George Pierce Park & Community Center')],
      CENTER,
      RADIUS,
      'Suwanee, GA',
    );
    expect(out.resolved).toHaveLength(1);
    expect(out.resolved[0]!.place_id).toBe('place-1');
  });

  it('carries the whole Places result through, photos included', async () => {
    // The photo fetch reads its references out of pois.raw_place. A resolved
    // POI stored without it resolves fine and then yields zero photos —
    // exactly what Aberdeen did (owner 2026-08-17).
    searchText.mockResolvedValue([place()]);
    const out = await resolveCandidates(
      [candidate('Sims Lake Park')],
      CENTER,
      RADIUS,
      'Suwanee, GA',
    );
    expect(out.resolved[0]!.raw_place).not.toBeNull();
    expect(out.resolved[0]!.raw_place?.photos).toHaveLength(3);
  });
});
