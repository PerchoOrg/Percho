import { describe, expect, it } from 'vitest';
import {
  type IndexAssembly,
  type IndexListing,
  type IndexRun,
  buildTourIndexRows,
} from './tour-index';

const listing = (id: string, created_at: string): IndexListing => ({
  id,
  address: `${id} Main St`,
  city: 'Johns Creek',
  state: 'GA',
  status: 'live',
  created_at,
  agents: null,
});

const photo = (listing_id: string, tagged = true, inFilm = false) => ({
  listing_id,
  tagged_at: tagged ? '2026-08-01T00:00:00Z' : null,
  used_in_video_at: inFilm ? '2026-08-02T00:00:00Z' : null,
});

const run = (listing_id: string, updated_at: string | null, status = 'ready'): IndexRun => ({
  listing_id,
  status,
  updated_at,
});

const cut = (
  listing_id: string,
  surface: string,
  status: string,
  updated_at: string,
): IndexAssembly => ({ listing_id, surface, status, updated_at });

const build = (input: Partial<Parameters<typeof buildTourIndexRows>[0]>) =>
  buildTourIndexRows({
    listings: [],
    photos: [],
    runs: [],
    assemblies: [],
    formatActivity: (iso) => iso ?? '—',
    ...input,
  });

describe('buildTourIndexRows', () => {
  it('orders by last pipeline activity, newest first', () => {
    const rows = build({
      listings: [
        listing('a', '2026-01-01T00:00:00Z'),
        listing('b', '2026-01-02T00:00:00Z'),
        listing('c', '2026-01-03T00:00:00Z'),
      ],
      runs: [run('a', '2026-08-22T20:25:00Z'), run('a', '2026-08-01T00:00:00Z')],
      assemblies: [cut('c', 'web', 'ready', '2026-08-10T00:00:00Z')],
    });
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(rows[0]?.lastActivityAt).toBe('2026-08-22T20:25:00Z');
  });

  it('sinks never-processed homes below every processed one, newest-created first', () => {
    const rows = build({
      listings: [
        listing('old', '2026-01-01T00:00:00Z'),
        listing('new', '2026-06-01T00:00:00Z'),
        listing('ran', '2026-02-01T00:00:00Z'),
      ],
      // A run older than either untouched listing was created: recency of
      // PROCESSING wins, which is the whole point of the reorder.
      runs: [run('ran', '2026-01-15T00:00:00Z')],
    });
    expect(rows.map((r) => r.id)).toEqual(['ran', 'new', 'old']);
    expect(rows[1]?.lastActivityAt).toBeNull();
    expect(rows[1]?.stage).toBeNull();
  });

  it('ranks by instant, not by string: PostgREST fractional digits vary per table', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z'), listing('b', '2026-01-01T00:00:00Z')],
      // '+' < '0' in a string compare, so `.632+00:00` would beat `.633000+00:00`.
      runs: [
        run('a', '2026-08-22T18:03:49.632+00:00'),
        run('b', '2026-08-22T18:03:49.633000+00:00'),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('counts tagged photos per listing', () => {
    const [partial, whole, none] = build({
      listings: [
        listing('p', '2026-01-03T00:00:00Z'),
        listing('w', '2026-01-02T00:00:00Z'),
        listing('n', '2026-01-01T00:00:00Z'),
      ],
      photos: [photo('p'), photo('p', false), photo('w')],
    });
    expect(partial).toMatchObject({ photos: 2, photosTagged: 1 });
    expect(whole).toMatchObject({ photos: 1, photosTagged: 1 });
    expect(none).toMatchObject({ photos: 0, photosTagged: 0 });
  });

  it('reports the furthest run, with an unfinished newer attempt beside it', () => {
    // 5122 Lower Creek Street: a re-run started after the film was finished and
    // stopped at planning. The home is Ready; the re-run is a note.
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      runs: [
        run('a', '2026-08-22T08:29:00Z', 'ready'),
        run('a', '2026-08-22T18:03:00Z', 'planning'),
        run('a', '2026-08-21T08:24:00Z', 'failed'),
      ],
    });
    expect(rows[0]).toMatchObject({ stage: 'ready', rerunStage: 'planning', runCount: 3 });
  });

  it('leaves no rerun note when the newest run is the one that got furthest', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      runs: [
        run('a', '2026-08-01T00:00:00Z', 'planning'),
        run('a', '2026-08-22T00:00:00Z', 'ready'),
      ],
    });
    expect(rows[0]).toMatchObject({ stage: 'ready', rerunStage: null });
  });

  it('prefers the newest of two runs that got equally far', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      runs: [run('a', '2026-08-01T00:00:00Z', 'ready'), run('a', '2026-08-22T00:00:00Z', 'ready')],
    });
    expect(rows[0]).toMatchObject({ stage: 'ready', rerunStage: null });
  });

  it('never lets a failed attempt outrank a finished one', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      runs: [run('a', '2026-08-01T00:00:00Z', 'ready'), run('a', '2026-08-22T00:00:00Z', 'failed')],
    });
    expect(rows[0]).toMatchObject({ stage: 'ready', rerunStage: 'failed' });
  });

  it('counts the photos the plan picked, which is not the photo count', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      // 4 photos, 2 of them picked — the plan drops the rest.
      photos: [photo('a', true, true), photo('a', true, true), photo('a'), photo('a')],
    });
    expect(rows[0]).toMatchObject({ photos: 4, photosTagged: 4, photosPicked: 2 });
  });

  it('counts picks with no assembly at all — the plan stamps them, not the cut', () => {
    // 3855 Oak Park Drive: planned twice, never assembled.
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      runs: [run('a', '2026-08-22T18:03:00Z', 'planning')],
      photos: [photo('a', true, true), photo('a')],
    });
    expect(rows[0]).toMatchObject({ photosPicked: 1, web: null, ios: null });
  });

  it('keeps a stage when the run carries no timestamp at all', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      runs: [run('a', null, 'tagging')],
    });
    expect(rows[0]).toMatchObject({ stage: 'tagging', lastActivityAt: null });
  });

  it('reports each surface separately — one cut up does not make the film ready', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      assemblies: [
        cut('a', 'web', 'ready', '2026-08-01T00:00:00Z'),
        cut('a', 'ios', 'rendering', '2026-08-01T00:00:00Z'),
      ],
    });
    expect(rows[0]).toMatchObject({ web: 'ready', ios: 'pending' });
  });

  it('shows the newest cut per surface, so a re-render replaces the failure it fixed', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      assemblies: [
        cut('a', 'web', 'failed', '2026-08-01T00:00:00Z'),
        cut('a', 'web', 'ready', '2026-08-22T00:00:00Z'),
      ],
    });
    expect(rows[0]).toMatchObject({ web: 'ready', ios: null });
  });

  it('counts an assembly as activity even when no run row carries the time', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z')],
      runs: [run('a', null, 'assembling')],
      assemblies: [cut('a', 'ios', 'ready', '2026-08-22T00:00:00Z')],
    });
    expect(rows[0]?.lastActivityAt).toBe('2026-08-22T00:00:00Z');
  });

  it('labels activity through the formatter the page injects', () => {
    const rows = build({
      listings: [listing('a', '2026-01-01T00:00:00Z'), listing('b', '2026-01-02T00:00:00Z')],
      runs: [run('a', '2026-08-22T00:00:00Z')],
      formatActivity: (iso) => (iso ? '2h ago' : '—'),
    });
    expect(rows.map((r) => r.lastActivityLabel)).toEqual(['2h ago', '—']);
  });
});
