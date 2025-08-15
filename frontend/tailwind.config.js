/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          bg:    '#0f0d0b',
          surface:'#171411',
          card:  '#1d1a16',
          border:'#2a241e',
          text:  '#f8f7f4',
          mut:   '#b3aa9f',
          amber: '#eab308',   // accent
          green: '#22c55e',   // accent
          danger:'#ef4444',
        },
      },
      boxShadow: {
        card: '0 6px 24px rgba(0,0,0,.35)',
        soft: '0 2px 10px rgba(0,0,0,.25)',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
