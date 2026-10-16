/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        loom: {
          primary: '#625df5',
          primaryHover: '#4e49eb',
          secondary: '#7c77fa',
          coral: '#ff5b4f',
          dark: '#111216',
          panel: '#1a1b20',
          card: '#22232a',
          hover: '#2d2e37',
          border: '#33353f',
          muted: '#8e90a0',
          accent: '#10b981',
          warning: '#f59e0b'
        }
      },
      boxShadow: {
        'bubble': '0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 0 3px rgba(98, 93, 245, 0.4)',
        'bubble-active': '0 10px 35px -5px rgba(255, 91, 79, 0.6), 0 0 0 3px rgba(255, 91, 79, 0.6)',
        'loom-float': '0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)'
      }
    },
  },
  plugins: [],
}
