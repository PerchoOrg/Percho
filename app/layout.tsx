import './globals.css';
import type { Metadata } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';
import { BottomNavWrapper } from './_components/BottomNavWrapper';
import { DesktopSidebarWrapper } from './_components/DesktopSidebarWrapper';
import { TopBarWrapper } from './_components/TopBarWrapper';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Aman direction display serif. See DESIGN.md.
const serifDisplay = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif-display',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: { default: 'Vicinity', template: '%s | Vicinity' },
  description: 'Property swipe platform for US homebuyers — vertical video feed for listings.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serifDisplay.variable}`}>
      <body className="bg-bg text-ink antialiased">
        {/* Phase 45 chrome (2026-06-20):
         *   - DesktopSidebar: md+ only, fixed 200px left rail with brand +
         *     primary tabs.
         *   - TopBar: every breakpoint, sticky [search · sub-tabs · avatar].
         *   - BottomNav: mobile-only bottom tab bar (kept).
         * All three self-hide on feed/auth/landing via isChromeHidden. */}
        <DesktopSidebarWrapper />
        <TopBarWrapper />
        <main className="md:pl-[200px]">{children}</main>
        <BottomNavWrapper />
      </body>
    </html>
  );
}
