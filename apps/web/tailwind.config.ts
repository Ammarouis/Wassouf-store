import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f9ff',
          100: '#CCE6FC',
          200: '#B6CFF7',
          300: '#91BAFA',
          400: '#5897ED',
          500: '#19A7F5',
          600: '#1963E4',
          700: '#19499C',
          800: '#5A7EAF',
          900: '#19499C',
          950: '#102d64',
          cyan: '#3BD0FC',
          aqua: '#6EDEFC',
          purple: '#CFA5F7',
        },
      },
      fontFamily: { arabic: ['var(--font-arabic)', 'sans-serif'] },
      animation: {
        'marquee-left': 'marquee-left 35s linear infinite',
        'marquee-right': 'marquee-right 35s linear infinite',
      },
      keyframes: {
        'marquee-left': { '0%': { transform: 'translateX(0%)' }, '100%': { transform: 'translateX(-50%)' } },
        'marquee-right': { '0%': { transform: 'translateX(-50%)' }, '100%': { transform: 'translateX(0%)' } },
      },
    },
  },
  plugins: [],
};

export default config;
