import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm neutral palette (cream / paper / warm-ink).
        bg: '#f3eee7',
        surface: '#fbf8f3',
        ink: '#313131',
        ink2: '#5a5651',
        muted: '#8a857d',
        line: 'rgba(49, 49, 49, 0.14)',
        'line-strong': 'rgba(49, 49, 49, 0.32)',

        // The palette above is the whole palette. The dark-theme aliases this
        // file used to carry (cream / gold / bronze / ink3 / accent) all
        // resolved to one of the six tokens above after the light-theme
        // switch, so `text-gold` rendered ink — retired in phase51, the call
        // sites now name the token they actually get.
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
