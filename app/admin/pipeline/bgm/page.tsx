/**
 * /admin/pipeline/bgm — background music library browser.
 *
 * Phase 104 (2026-07-17): operators can preview every mp3 the render
 * worker might pick for a generated video. Tracks are streamed from
 * the public Supabase Storage bucket `bgm/` (uploaded by
 * `scripts/upload-bgm/upload.py`). Source of truth for what's in the
 * library is `scripts/render-worker/bgm/manifest.json`, which lists
 * exactly what was uploaded on the render host.
 *
 * The worker itself still reads mp3s off local disk on the render EC2
 * (see `scripts/render-worker/worker.py::pick_bgm`) — this page is a
 * browser-side mirror for QA / curation.
 */

import fs from 'node:fs';
import path from 'node:path';

type BucketEntry = { count: number; tracks: string[] };
type Manifest = {
  schema_version: number;
  description: string;
  source: string;
  license: string;
  attribution: string;
  storage_bucket: string;
  buckets: Record<string, BucketEntry>;
  total_active_tracks: number;
};

// Curated per-vibe descriptions (mirrored from docs/bgm/vibe-map.md).
// If the manifest gains a new vibe bucket, it still renders — falls
// back to a neutral label.
const VIBE_META: Record<string, { label: string; blurb: string; fit: string }> = {
  'warm-acoustic': {
    label: 'Warm Acoustic',
    blurb: 'Acoustic guitar, ukulele, hand percussion. Cozy, human.',
    fit: 'Single family, cabin, farmhouse, family homes.',
  },
  'modern-corporate': {
    label: 'Modern Corporate',
    blurb: 'Clean piano + light pads, uplifting but restrained.',
    fit: 'Townhome, condo, new construction, modern homes.',
  },
  'luxury-ambient': {
    label: 'Luxury Ambient',
    blurb: 'Sparse piano, soft strings, spacious reverb.',
    fit: '$2M+, estates, high-end condos.',
  },
  'chill-electronic': {
    label: 'Chill Electronic',
    blurb: 'Organic electronic, mellow beats (not lo-fi jazz).',
    fit: 'Urban condo, loft, downtown.',
  },
  cinematic: {
    label: 'Cinematic',
    blurb: 'Sweeping strings + piano, no drops.',
    fit: 'Waterfront, view lots, hero shots.',
  },
};

// Preferred display order — matches the vibe-map doc.
const VIBE_ORDER = [
  'warm-acoustic',
  'modern-corporate',
  'luxury-ambient',
  'chill-electronic',
  'cinematic',
];

function loadManifest(): Manifest | null {
  const p = path.join(process.cwd(), 'scripts/render-worker/bgm/manifest.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

function trackUrl(bucket: string, vibe: string, file: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return `${base}/storage/v1/object/public/${bucket}/${encodeURIComponent(
    vibe,
  )}/${encodeURIComponent(file)}`;
}

// Turn "07-amazing-plan.mp3" → "Amazing Plan"
function prettyTitle(file: string): string {
  const stem = file.replace(/\.mp3$/i, '').replace(/^\d+-/, '');
  return stem
    .split('-')
    .map((w) => (w.length > 0 ? (w[0] ?? '').toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export const dynamic = 'force-dynamic';

export default async function BgmLibraryPage() {
  const manifest = loadManifest();

  if (!manifest) {
    return (
      <div className="space-y-4">
        <h1 className="font-semibold text-xl text-ink">Background music</h1>
        <div className="rounded-2xl border border-line bg-surface p-6 text-ink2 text-sm">
          <p className="mb-2 font-medium text-ink">Manifest not found.</p>
          <p>
            Run <code className="rounded bg-bg px-1.5 py-0.5">scripts/upload-bgm/upload.py</code>{' '}
            from the render host to generate{' '}
            <code className="rounded bg-bg px-1.5 py-0.5">
              scripts/render-worker/bgm/manifest.json
            </code>{' '}
            and upload the mp3s to Supabase Storage.
          </p>
        </div>
      </div>
    );
  }

  const orderedVibes = [
    ...VIBE_ORDER.filter((v) => manifest.buckets[v]),
    ...Object.keys(manifest.buckets).filter((v) => !VIBE_ORDER.includes(v)),
  ];
  const totalTracks = Object.values(manifest.buckets).reduce(
    (n, b) => n + (b?.count ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-xl text-ink">Background music</h1>
        <p className="text-ink2 text-sm">
          {manifest.total_active_tracks ?? totalTracks} tracks across {orderedVibes.length} vibe
          buckets. The render worker picks one at random per video. Click any track to preview.
        </p>
      </header>

      {orderedVibes.map((vibe) => {
        const entry = manifest.buckets[vibe];
        if (!entry) return null;
        const meta = VIBE_META[vibe] ?? {
          label: vibe,
          blurb: '',
          fit: '',
        };
        return (
          <section
            key={vibe}
            className="overflow-hidden rounded-2xl border border-line bg-surface"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-line border-b bg-cream/60 px-4 py-3 sm:px-5">
              <div>
                <h2 className="font-semibold text-base text-ink">{meta.label}</h2>
                <p className="text-ink2 text-xs">{meta.blurb}</p>
              </div>
              <div className="text-ink2 text-xs">
                <span className="font-medium text-ink">{entry.count}</span> tracks
                {meta.fit ? <> · {meta.fit}</> : null}
              </div>
            </div>

            {entry.tracks.length === 0 ? (
              <div className="px-4 py-6 text-ink2 text-sm sm:px-5">No tracks in this bucket.</div>
            ) : (
              <ul className="divide-y divide-line">
                {entry.tracks.map((file) => (
                  <li
                    key={file}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink text-sm">
                        {prettyTitle(file)}
                      </div>
                      <div className="truncate font-mono text-ink2 text-xs">{file}</div>
                    </div>
                    {/** biome-ignore lint/a11y/useMediaCaption: royalty-free instrumental, no captions */}
                    <audio
                      controls
                      preload="none"
                      src={trackUrl(manifest.storage_bucket, vibe, file)}
                      className="h-8 w-full sm:w-72"
                    >
                      <track kind="captions" />
                    </audio>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <footer className="rounded-2xl border border-line bg-surface px-4 py-3 text-ink2 text-xs sm:px-5">
        <div className="font-medium text-ink">Attribution</div>
        <div>{manifest.attribution}</div>
        <div className="mt-1">License: {manifest.license}</div>
      </footer>
    </div>
  );
}
