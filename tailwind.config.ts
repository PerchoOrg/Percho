import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Demo brand accent — gold/amber. Tweak in Phase 7 with Vivian.
        accent: {
          DEFAULT: '#c9a227',
          dark: '#a88a1e',
        },
        // Vicinity palette (matches demo): dark ink + warm cream + gold accent.
        ink: '#0a0a0a',
        ink2: '#1a1a1a',
        ink3: '#222222',
        gold: '#c9a961',
        bronze: '#8b7355',
        cream: '#f5f1ea',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
