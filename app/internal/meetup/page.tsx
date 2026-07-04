import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import type { Metadata } from 'next';

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

      {groups.map((g) => (
        <section key={g.slug} id={g.slug} className="space-y-3 scroll-mt-6">
          <h2 className="text-xl font-serif tracking-tighter border-b border-line pb-1">
            {g.title}
          </h2>
          {g.entries.length === 0 ? (
            <p className="text-sm text-muted">No markdown files.</p>
          ) : (
            <ul className="space-y-3">
              {g.entries.map((e) => (
                <li key={e.slug}>
                  <Link
                    href={`/internal/meetup/${e.slug}`}
                    className="block rounded border border-line bg-surface px-4 py-3 hover:border-line-strong"
                  >
                    <div className="font-medium">{e.title}</div>
                    {e.preview && (
                      <div className="mt-1 text-sm text-ink2 line-clamp-2">{e.preview}</div>
                    )}
                    <div className="mt-1 text-xs text-muted font-mono">{e.slug}.md</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
