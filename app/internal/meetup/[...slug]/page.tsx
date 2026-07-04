import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const DOCS_ROOT = path.join(process.cwd(), 'docs');
const ALLOWED_ROOTS = ['meetup-kw-atlanta', 'mls-integration', 'ken-burns'];

function resolveMd(slugParts: string[]): string | null {
  if (!slugParts.length) return null;
  const root = slugParts[0];
  if (!root || !ALLOWED_ROOTS.includes(root)) return null;
  const rel = slugParts.join('/') + '.md';
  const full = path.resolve(DOCS_ROOT, rel);
  const rootReal = path.resolve(DOCS_ROOT);
  if (!full.startsWith(rootReal + path.sep)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

export default function MdPage({ params }: { params: { slug: string[] } }) {
  const full = resolveMd(params.slug);
  if (!full) notFound();
  const md = fs.readFileSync(full, 'utf8');
  const rel = params.slug.join('/');

  return (
    <article className="space-y-6">
      <div className="text-xs text-muted font-mono">docs/{rel}.md</div>
      <div
        className="
          [&>h1]:text-3xl [&>h1]:font-serif [&>h1]:tracking-tighter [&>h1]:mt-2 [&>h1]:mb-4
          [&>h2]:text-2xl [&>h2]:font-serif [&>h2]:tracking-tighter [&>h2]:mt-8 [&>h2]:mb-3 [&>h2]:border-b [&>h2]:border-line [&>h2]:pb-1
          [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:mt-6 [&>h3]:mb-2
          [&>h4]:font-semibold [&>h4]:mt-4 [&>h4]:mb-2
          [&>p]:my-3 [&>p]:leading-relaxed
          [&>ul]:my-3 [&>ul]:list-disc [&>ul]:pl-6 [&>ul>li]:my-1
          [&>ol]:my-3 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol>li]:my-1
          [&_a]:underline [&_a]:text-ink hover:[&_a]:text-ink2
          [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
          [&>pre]:bg-surface [&>pre]:border [&>pre]:border-line [&>pre]:rounded [&>pre]:p-3 [&>pre]:overflow-x-auto [&>pre]:my-4
          [&>pre_code]:bg-transparent [&>pre_code]:p-0
          [&>blockquote]:border-l-4 [&>blockquote]:border-line-strong [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-ink2 [&>blockquote]:my-4
          [&>hr]:my-6 [&>hr]:border-line
          [&_table]:w-full [&_table]:my-4 [&_table]:border-collapse [&_table]:text-sm
          [&_th]:border [&_th]:border-line [&_th]:bg-surface [&_th]:px-2 [&_th]:py-1 [&_th]:text-left
          [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1
          [&_img]:max-w-full [&_img]:rounded
          text-ink
        "
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </div>
      <div className="pt-6 border-t border-line">
        <Link href="/internal/meetup" className="text-sm underline">
          ← All docs
        </Link>
      </div>
    </article>
  );
}
