/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: {
          bg: '#0B1117',
          surface: '#111A22',
          panel: '#18242E',
          hover: '#202E39',
          border: '#31414D',
          text: '#F4F7FA',
          secondary: '#C0CDD6',
          muted: '#92A2AE',
          mint: '#3AD6C6',
          mintHover: '#65E6D8',
          mintText: '#062B2A',
          selection: '#12312F',
          amber: '#FFBD66',
          green: '#4CD6A0',
          coral: '#FF5F6D',
          coralText: '#2B0E13',
          destructive: '#B83A48',
          destructiveHover: '#A83240',
          destructiveText: '#FFFFFF',
        },
        // Mapped aliases ensuring backward compatibility while projecting the Midnight Signal palette
        aura: {
          primary: '#3AD6C6',
          primaryHover: '#65E6D8',
          cyan: '#3AD6C6',
          violet: '#3AD6C6',
          pink: '#FF5F6D',
          coral: '#FF5F6D',
          dark: '#0B1117',
          panel: '#18242E',
          card: '#111A22',
          hover: '#202E39',
          border: '#31414D',
          muted: '#92A2AE',
          accent: '#4CD6A0',
          warning: '#FFBD66'
        },
        loom: {
          primary: '#3AD6C6',
          primaryHover: '#65E6D8',
          secondary: '#4CD6A0',
          coral: '#FF5F6D',
          dark: '#0B1117',
          panel: '#18242E',
          card: '#111A22',
          hover: '#202E39',
          border: '#31414D',
          muted: '#92A2AE',
          accent: '#4CD6A0',
          warning: '#FFBD66'
        }
      },
      boxShadow: {
        'bubble': '0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 0 2px rgba(58, 214, 198, 0.4)',
        'bubble-active': '0 10px 35px -5px rgba(255, 95, 109, 0.6), 0 0 0 2px rgba(255, 95, 109, 0.6)',
        'aura-float': '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(49, 65, 77, 0.6)',
        'aura-glow': '0 0 25px -5px rgba(58, 214, 198, 0.35)',
        'loom-float': '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(49, 65, 77, 0.6)'
      }
    },
  },
  plugins: [],
}
