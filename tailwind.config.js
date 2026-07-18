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
        // The `apple-*` palette that used to live here has been removed. It was
        // a second, parallel color system (pure-white text ramp, its own
        // red/green/orange) competing with the `te-*` tokens, which is why text
        // colour drifted between screens. Everything now resolves to the
        // --te-* custom properties in index.css.
      },
      // Radius scale — mirrors the --te-radius-* tokens in index.css so markup
      // and CSS can't drift apart. These three are the only radii in the app
      // (plus rounded-full for pills).
      borderRadius: {
        'te-sm': 'var(--te-radius-sm)',
        'te-md': 'var(--te-radius-md)',
        'te-lg': 'var(--te-radius-lg)',
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
