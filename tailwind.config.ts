import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ReelEstate rewrite tokens — see docs/design/reelestate-teardown/README.md §1.
        // `bg.DEFAULT` is the near-black page background so `bg-bg` on new mobile
        // routes reads dark. Legacy Aman-direction routes (public/, dashboard/,
        // internal/) still resolve via the aliases below during the rewrite.
        bg: {
          DEFAULT: '#05070E',
          surface: '#0A1220',
          elevated: '#101827',
          border: '#12203A',
        },
        cyan: {
          DEFAULT: '#22D3EE',
          bright: '#38D9F2',
          deep: '#1EA7FF',
          ink: '#0E1B3D',
        },
        blue: {
          DEFAULT: '#2563EB',
          600: '#3B82F6',
        },
        magenta: {
          DEFAULT: '#EC4899',
          700: '#E11D74',
        },
        purple: {
          DEFAULT: '#8B5CF6',
          700: '#7C3AED',
        },
        ok: '#22C55E',
        warn: '#F5C518',

        // --- Legacy Aman-direction aliases (kept so pre-rewrite routes still
        // resolve their class strings; do NOT reference in new (mobile) routes).
        surface: '#fbf8f3',
        ink: '#313131',
        ink2: '#5a5651',
        ink3: '#5a5651',
        muted: '#8a857d',
        line: 'rgba(49, 49, 49, 0.14)',
        'line-strong': 'rgba(49, 49, 49, 0.32)',
        cream: '#fbf8f3',
        accent: {
          DEFAULT: '#313131',
          dark: '#1f1f1f',
        },
        gold: '#313131',
        bronze: '#5a5651',
      },
      borderRadius: {
        // README §1 radii — card / tile / logo-tile. Pill uses rounded-full.
        card: '20px',
        tile: '16px',
        'logo-tile': '18px',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif-display)', 'Source Serif 4', 'Georgia', 'serif'],
      },
      letterSpacing: {
        tighter: '-0.02em',
        eyebrow: '0.22em',
        chip: '0.015em', // README §1 typography — chip/caption +1.5 tracking
      },
      backgroundImage: {
        // README §1 gradients.
        'grad-cta': 'linear-gradient(90deg, #38D9F2 0%, #3B82F6 100%)',
        'grad-destructive': 'linear-gradient(90deg, #EC4899 0%, #E11D74 100%)',
        'grad-ring': 'conic-gradient(from 180deg, #EC4899, #8B5CF6, #22D3EE, #EC4899)',
      },
      boxShadow: {
        // README §1 elevation/glass.
        'glow-cyan': '0 0 20px rgba(34, 211, 238, 0.35)',
        'glow-tile': 'inset 0 0 12px rgba(34, 211, 238, 0.15)',
      },
    },
  },
  plugins: [],
};

export default config;
