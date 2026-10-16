/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aura: {
          primary: '#6366f1',
          primaryHover: '#4f46e5',
          cyan: '#06b6d4',
          violet: '#8b5cf6',
          pink: '#ec4899',
          coral: '#f43f5e',
          dark: '#0b0d14',
          panel: '#121622',
          card: '#181f30',
          hover: '#222b42',
          border: '#2a344f',
          muted: '#94a3b8',
          accent: '#10b981',
          warning: '#f59e0b'
        },
        loom: {
          primary: '#6366f1',
          primaryHover: '#4f46e5',
          secondary: '#8b5cf6',
          coral: '#f43f5e',
          dark: '#0b0d14',
          panel: '#121622',
          card: '#181f30',
          hover: '#222b42',
          border: '#2a344f',
          muted: '#94a3b8',
          accent: '#10b981',
          warning: '#f59e0b'
        }
      },
      boxShadow: {
        'bubble': '0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 0 3px rgba(6, 182, 212, 0.4)',
        'bubble-active': '0 10px 35px -5px rgba(244, 63, 94, 0.6), 0 0 0 3px rgba(244, 63, 94, 0.6)',
        'aura-float': '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.2)',
        'aura-glow': '0 0 25px -5px rgba(6, 182, 212, 0.35)',
        'loom-float': '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.2)'
      }
    },
  },
  plugins: [],
}
