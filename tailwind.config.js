/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#0e1525',
        ink: '#1a2332',
        cream: '#faf9f6',
        saffron: {
          DEFAULT: '#ff6f3c',
          50: '#fff4ed',
          100: '#ffe6d5',
          200: '#ffc9aa',
          300: '#ffa374',
          400: '#ff6f3c',
          500: '#fe5316',
          600: '#ef370c',
          700: '#c6260c',
          800: '#9d2012',
          900: '#7e1d12',
        },
        danger: '#f43f5e',
      },
      fontFamily: {
        serif: ['Crimson Pro', 'Georgia', 'serif'],
        mono: ['DM Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(255, 111, 60, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(255, 111, 60, 0.6)' },
        },
      },
    },
  },
  plugins: [],
};
