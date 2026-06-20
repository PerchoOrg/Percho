import { SiteFooter } from '@/components/site/SiteFooter';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Lightweight wrapper for static legal/info subpages (about, privacy, terms,
 * contact, fair-housing). Keeps typography consistent without each page
 * re-declaring the same chrome.
 */
export function LegalLayout({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-6 pt-16 pb-8">
          <Link href="/" className="font-serif text-xl text-ink hover:text-ink2">
            Vicinity<span className="text-ink">.</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="eyebrow mb-4">{eyebrow}</div>
        <h1 className="display-lg text-ink mb-4">{title}</h1>
        {updated && <div className="text-sm text-muted mb-12">Last updated {updated}</div>}

        <div className="space-y-6 text-ink2 leading-[1.75] [&_h2]:font-serif [&_h2]:text-ink [&_h2]:text-2xl [&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:tracking-[-0.012em] [&_h3]:font-serif [&_h3]:text-ink [&_h3]:text-lg [&_h3]:mt-8 [&_h3]:mb-2 [&_p]:text-base [&_a]:text-ink [&_a]:underline hover:[&_a]:text-ink2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:text-base">
          {children}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
