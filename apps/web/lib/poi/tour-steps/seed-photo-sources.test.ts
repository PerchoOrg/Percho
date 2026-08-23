/**
 * Seeding the candidate page list.
 *
 * The bug this guards is an ordering one, not a data one: the list used to be
 * written by the ingest step, so the pages you choose between only appeared
 * after the fetch you were choosing the input for had already run (owner
 * 2026-08-23: "can you give me the candidate website urls that we got from
 * agent research? so i can select").
 */

import { describe, expect, it, vi } from 'vitest';
import { seedPhotoSources } from './ingest';

type Upserted = Array<{ url: string; origin: string; enabled: boolean; label: string }>;

function fakeSb(website: string | null) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const updateIn = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: () => ({ in: updateIn }) });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'communities') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { website } }) }) }),
      };
    }
    if (table === 'community_photo_sources') return { upsert, update };
    throw new Error(`unexpected table: ${table}`);
  });
  return {
    // biome-ignore lint/suspicious/noExplicitAny: a stub, not a Supabase client.
    sb: { from } as any,
    upsert,
    updateIn,
    rows: () => upsert.mock.calls[0]?.[0] as Upserted,
  };
}

const research = {
  agents: {
    gemini_a: {
      parsed: {
        community_site: 'https://aberdeencommunity.org',
        pois: [{ name: 'Lambert High School', source: 'https://lhs.forsyth.k12.ga.us' }],
      },
    },
  },
};

describe('seedPhotoSources', () => {
  it('ticks the community site and leaves everyone else unticked', async () => {
    const { sb, rows } = fakeSb(null);
    expect(await seedPhotoSources(sb, 'c1', research)).toBe(2);
    expect(rows()).toEqual([
      expect.objectContaining({
        url: 'https://aberdeencommunity.org',
        origin: 'community_site',
        enabled: true,
      }),
      expect.objectContaining({
        url: 'https://lhs.forsyth.k12.ga.us',
        origin: 'research',
        enabled: false,
      }),
    ]);
  });

  it("prefers the community's own recorded website over the run blob", async () => {
    // `runResearch` only fills `communities.website` when it is blank, so a URL
    // a person entered outranks the model's guess — and this is the one place
    // that difference decides what gets fetched by default.
    const { sb, rows } = fakeSb('https://aberdeenhoa.example/amenities');
    await seedPhotoSources(sb, 'c1', research);
    const ticked = rows().filter((r) => r.enabled);
    expect(ticked.map((r) => r.url)).toEqual([
      'https://aberdeenhoa.example/amenities',
      'https://aberdeencommunity.org',
    ]);
    expect(ticked[0]!.label).toBe('Amenities');
  });

  it('does not add the recorded website twice when research found the same page', async () => {
    const { sb, rows } = fakeSb('https://aberdeencommunity.org');
    expect(await seedPhotoSources(sb, 'c1', research)).toBe(2);
    expect(rows().filter((r) => r.url === 'https://aberdeencommunity.org')).toHaveLength(1);
  });

  it('never writes `enabled` outside the insert, so a tick survives a re-seed', async () => {
    // The correction pass may only repair `origin`. Writing `enabled` here is
    // what would silently undo an untick every time the panel was opened.
    const { sb, upsert, updateIn } = fakeSb(null);
    await seedPhotoSources(sb, 'c1', research);
    expect(upsert.mock.calls[0]?.[1]).toEqual({
      onConflict: 'community_id,url',
      ignoreDuplicates: true,
    });
    expect(updateIn).toHaveBeenCalledWith('url', ['https://aberdeencommunity.org']);
  });

  it('writes nothing for a community with no website and no research', async () => {
    const { sb, upsert } = fakeSb(null);
    expect(await seedPhotoSources(sb, 'c1', undefined)).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('still lists the optional sources when no community site was found', async () => {
    // Apremont - Highcroft and Ashley Crossing are both in this state: research
    // found thirteen POI pages and no community site at all.
    const { sb, rows } = fakeSb(null);
    const n = await seedPhotoSources(sb, 'c1', {
      agents: {
        gemini_a: {
          parsed: { pois: [{ name: 'The Forum', source: 'https://theforumpeachtree.com' }] },
        },
      },
    });
    expect(n).toBe(1);
    expect(rows()).toEqual([expect.objectContaining({ origin: 'research', enabled: false })]);
  });
});
