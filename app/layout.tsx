import './globals.css';
import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';
import { BottomNavWrapper } from './_components/BottomNavWrapper';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Vicinity', template: '%s | Vicinity' },
  description: 'Property swipe platform for US homebuyers — vertical video feed for listings.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="bg-ink text-cream antialiased">
        {children}
        {/* Mobile-only fixed bottom tab bar; self-hides on feed/auth/landing
         * and on md+ breakpoints. Adds a md:hidden 14px bottom inset on every
         * page; pages that need to butt up against the bottom (feed) hide it. */}
        <BottomNavWrapper />
      </body>
    </html>
  );
}
