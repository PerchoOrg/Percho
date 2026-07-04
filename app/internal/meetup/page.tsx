import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MeetupSearch } from './MeetupSearch.client';

export const metadata: Metadata = {
  title: 'Internal — Meetup packet',
  robots: { index: false, follow: false },
};

const FOLDERS = [
  { slug: 'meetup-kw-atlanta', title: 'Meetup — KW Atlanta' },
  { slug: 'mls-integration', title: 'MLS Integration' },
  { slug: 'ken-burns', title: 'Ken Burns' },
];

const DOCS_ROOT = path.join(process.cwd(), 'docs');

type Entry = { slug: string; title: string; preview: string };

function extractMeta(md: string, fallback: string): { title: string; preview: string } {
  const lines = md.split('\n');
  let title = fallback;
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m && m[1]) {
      title = m[1].trim();
      break;
    }
  }
  // First non-empty, non-heading, non-code-fence paragraph line
  let preview = '';
  let inFence = false;
  for (const rawLine of lines) {
      const line = rawLine.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line) continue;
    if (line.startsWith('#')) continue;
    // strip simple markdown
    preview = line
      .replace(/[*_`>]/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    if (preview) break;
  }
  if (preview.length > 140) preview = preview.slice(0, 137).trimEnd() + '…';
  return { title, preview };
}

function listMd(folder: string): Entry[] {
  const dir = path.join(DOCS_ROOT, folder);
  if (!fs.existsSync(dir)) return [];
  const PRIORITY = ['OVERNIGHT-SUMMARY.md', 'README.md'];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort((a, b) => {
      const ai = PRIORITY.indexOf(a);
      const bi = PRIORITY.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      }
      return a.localeCompare(b);
    });
  return files.map((file) => {
    const full = path.join(dir, file);
    const md = fs.readFileSync(full, 'utf8');
    const base = file.replace(/\.md$/i, '');
    const { title, preview } = extractMeta(md, base);
    return { slug: `${folder}/${base}`, title, preview };
  });
}

export default function MeetupIndexPage() {
  const groups = FOLDERS.map((f) => ({ ...f, entries: listMd(f.slug) }));

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-serif tracking-tighter">Overnight packet</h1>
        <p className="text-ink2 text-sm">
          Docs viewer for meetup materials, MLS integration notes, and Ken Burns pitch notes.
        </p>
        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          <Link
            href="/agents"
            className="rounded border border-line px-3 py-1.5 hover:bg-surface"
          >
            Review /agents landing →
          </Link>
          <Link
            href="/demo/autofill"
            className="rounded border border-line px-3 py-1.5 hover:bg-surface"
          >
            Review /demo/autofill →
          </Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-serif tracking-tight">Demo video</h2>
        <p className="text-ink2 text-sm">
          24s Ken Burns slideshow for Tuesday&apos;s pitch. Direct link is public — anyone with
          the URL can view. Do not share outside the meetup crew.
        </p>
        <video
          controls
          playsInline
          preload="metadata"
          className="w-full max-w-sm rounded border border-line bg-black"
          src="/demo/vicinity-slideshow-demo.mp4"
        />
        <p className="text-ink2 text-xs">
          <a
            href="/demo/vicinity-slideshow-demo.mp4"
            className="underline hover:text-ink"
            download
          >
            Download MP4 (8.6 MB)
          </a>
        </p>
      </section>

      <MeetupSearch groups={groups} />
    </div>
  );
}
