import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Primary: forest / emerald green ─────────────────────
        forest: {
          50:  '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0',
          300: '#86efac', 400: '#4ade80', 500: '#22c55e',
          600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
        },
        // ── Accent: ember / sunset orange ───────────────────────
        ember: {
          50:  '#fff7ed', 100: '#ffedd5', 200: '#fed7aa',
          300: '#fdba74', 400: '#fb923c', 500: '#f97316',
          600: '#ea580c', 700: '#c2410c',
        },
        // ── Accent: honey / warm yellow ─────────────────────────
        honey: {
          50:  '#fefce8', 100: '#fef9c3', 200: '#fef08a',
          300: '#fde047', 400: '#facc15', 500: '#eab308',
          600: '#ca8a04', 700: '#a16207',
        },
        // @deprecated — Legacy tokens kept for story/play pages
        candy: {
          50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8',
          300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899',
          600: '#db2777', 700: '#be185d',
        },
        // @deprecated
        sky: {
          50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd',
          300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9',
          600: '#0284c7', 700: '#0369a1',
        },
        // @deprecated
        sun: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a',
          300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b',
          600: '#d97706', 700: '#b45309',
        },
        // @deprecated
        mint: {
          50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0',
          300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
          600: '#059669', 700: '#047857',
        },
        // @deprecated
        grape: {
          50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe',
          300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6',
          600: '#7c3aed', 700: '#6d28d9',
        },
      },
      borderWidth: {
        '3': '3px',
      },
      fontFamily: {
        body: ['"Space Grotesk"', '"Noto Sans SC"', 'sans-serif'],
        accent: ['var(--font-baloo2)', 'cursive'],
      },
      keyframes: {
        bounce_in: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
      },
      animation: {
        'bounce-in': 'bounce_in 0.3s ease-out',
        wiggle: 'wiggle 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
