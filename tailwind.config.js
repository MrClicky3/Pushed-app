/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        te: {
          upper: '#9b8cf2',
          lower: '#f2c08c',
          pr:    '#7fd57f',
          warn:  '#e8a657',
          bg:    '#010101',
          surface: '#181614',
        },
        apple: {
          bg: '#000000',
          // glass surface tokens — used for cards/sheets/bars
          glass: 'rgba(255,255,255,0.07)',
          'glass-light': 'rgba(255,255,255,0.12)',
          'glass-strong': 'rgba(255,255,255,0.15)',
          // keep legacy opaque tokens as fallback
          card: '#1c1c1e',
          elevated: '#2c2c2e',
          tertiary: '#3a3a3c',
          green: '#30d158',
          red: '#ff453a',
          orange: '#ff9f0a',
          blue: '#0a84ff',
          label: {
            primary: '#ffffff',
            secondary: 'rgba(255,255,255,0.60)',
            tertiary: 'rgba(255,255,255,0.35)',
            quaternary: 'rgba(255,255,255,0.18)',
          },
          separator: 'rgba(255,255,255,0.10)',
          fill: {
            primary: 'rgba(120,120,128,0.36)',
            secondary: 'rgba(120,120,128,0.32)',
            tertiary: 'rgba(118,118,128,0.24)',
          },
        },
      },
      backdropBlur: {
        xs: '4px',
        '3xl': '48px',
        '4xl': '64px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        'glass-lg': '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10)',
      },
    },
  },
  plugins: [],
};
