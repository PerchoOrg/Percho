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
        // Aman direction tokens — see DESIGN.md.
        bg: '#f3eee7',
        surface: '#fbf8f3',
        ink: '#313131',
        ink2: '#5a5651',
        muted: '#8a857d',
        line: 'rgba(49, 49, 49, 0.14)',
        'line-strong': 'rgba(49, 49, 49, 0.32)',

        // Legacy aliases — kept so existing class strings (text-cream, bg-ink, gold, etc.)
        // resolve onto the light palette without a 73-file sweep.
        cream: '#fbf8f3',  // was warm cream on dark; now paper on light
        ink3: '#5a5651',
        accent: {
          DEFAULT: '#313131',  // was gold; now ink (kills chromatic accent)
          dark: '#1f1f1f',
        },
        gold: '#313131',     // any text-gold / bg-gold now reads as ink
        bronze: '#5a5651',   // any text-bronze now reads as ink2
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif-display)', 'Source Serif 4', 'Georgia', 'serif'],
      },
      letterSpacing: {
        tighter: '-0.02em',
        eyebrow: '0.22em',
      },
    },
  },
  plugins: [],
};

export default config;
