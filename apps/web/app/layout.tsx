import './globals.css';
import type { Metadata } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';
import { BottomNavWrapper } from './_components/BottomNavWrapper';
import { DesktopSidebarWrapper } from './_components/DesktopSidebarWrapper';
import { MainShell } from './_components/MainShell';
import { TopBarWrapper } from './_components/TopBarWrapper';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Display serif for headings.
const serifDisplay = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif-display',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: { default: 'Percho', template: '%s | Percho' },
  description: 'Property swipe platform for US homebuyers — vertical video feed for listings.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serifDisplay.variable}`}>
      <body className="bg-bg text-ink antialiased">
        {/* Site chrome:
         *   - DesktopSidebar: md+ only, fixed 200px left rail with brand +
         *     primary tabs.
         *   - TopBar: every breakpoint, sticky [search · sub-tabs · avatar].
         *   - BottomNav: mobile-only bottom tab bar (kept).
         * All three self-hide on feed/auth/landing via isChromeHidden. */}
        <DesktopSidebarWrapper />
        <TopBarWrapper />
        <MainShell>{children}</MainShell>
        <BottomNavWrapper />
      </body>
    </html>
  );
}
