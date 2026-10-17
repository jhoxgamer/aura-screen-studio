/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nocturne: {
          bg: '#0B0E14',
          surface: '#121722',
          panel: '#191F2B',
          hover: '#222B39',
          border: '#303A4B',
          text: '#F3F5F9',
          secondary: '#B7C0CE',
          muted: '#929CAF',
          blue: '#78A5FF',
          blueHover: '#9AB9FF',
          blueText: '#101A32',
          selection: '#1A2A47',
          amber: '#F2B66D',
          lightBlue: '#83B8FF',
          coral: '#FF647C',
          coralText: '#2B0E13',
          destructive: '#B83A48',
          destructiveHover: '#A83240',
          destructiveText: '#FFFFFF',
        },
        // Mapped aliases ensuring backward compatibility while eliminating mint/teal
        aura: {
          primary: '#78A5FF',
          primaryHover: '#9AB9FF',
          cyan: '#78A5FF',
          violet: '#78A5FF',
          pink: '#FF647C',
          coral: '#FF647C',
          dark: '#0B0E14',
          panel: '#191F2B',
          card: '#121722',
          hover: '#222B39',
          border: '#303A4B',
          muted: '#929CAF',
          accent: '#83B8FF',
          warning: '#F2B66D'
        },
        loom: {
          primary: '#78A5FF',
          primaryHover: '#9AB9FF',
          secondary: '#83B8FF',
          coral: '#FF647C',
          dark: '#0B0E14',
          panel: '#191F2B',
          card: '#121722',
          hover: '#222B39',
          border: '#303A4B',
          muted: '#929CAF',
          accent: '#83B8FF',
          warning: '#F2B66D'
        },
        midnight: {
          bg: '#0B0E14',
          surface: '#121722',
          panel: '#191F2B',
          hover: '#222B39',
          border: '#303A4B',
          text: '#F3F5F9',
          secondary: '#B7C0CE',
          muted: '#929CAF',
          mint: '#78A5FF',
          mintHover: '#9AB9FF',
          mintText: '#101A32',
          selection: '#1A2A47',
          amber: '#F2B66D',
          green: '#83B8FF',
          coral: '#FF647C',
          coralText: '#2B0E13',
          destructive: '#B83A48',
          destructiveHover: '#A83240',
          destructiveText: '#FFFFFF',
        }
      },
      boxShadow: {
        'bubble': '0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(120, 165, 255, 0.4)',
        'bubble-active': '0 10px 35px -5px rgba(255, 100, 124, 0.6), 0 0 0 2px rgba(255, 100, 124, 0.6)',
        'aura-float': '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(48, 58, 75, 0.6)',
        'aura-glow': '0 0 25px -5px rgba(120, 165, 255, 0.35)',
        'loom-float': '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(48, 58, 75, 0.6)'
      }
    },
  },
  plugins: [],
}
