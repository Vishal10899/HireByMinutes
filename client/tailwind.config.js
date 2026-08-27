/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        timberwolf: {
          DEFAULT: '#D3D0C8',
          light: '#E4E2DC',
          dark: '#B8B4AA'
        },
        aliceblue: {
          DEFAULT: '#E9F1F6',
          surface: '#F4F8FA',
          light: '#FFFFFF'
        },
        lightblue: {
          DEFAULT: '#B2D5E2',
          light: '#CBE3ED',
          border: '#9DC7D7'
        },
        moonstone: {
          DEFAULT: '#44A6B5',
          hover: '#3A919E',
          light: '#E2F3F6',
          dark: '#2E7985'
        },
        midnight: {
          DEFAULT: '#004554',
          hover: '#003541',
          light: '#085C6E',
          soft: '#004554e6'
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 3px rgba(0, 69, 84, 0.04), 0 1px 2px rgba(0, 69, 84, 0.02)',
        'card': '0 4px 20px -2px rgba(0, 69, 84, 0.05)',
        'card-hover': '0 10px 25px -4px rgba(0, 69, 84, 0.08)',
        'elevated': '0 14px 34px rgba(0, 69, 84, 0.09)',
      }
    },
  },
  plugins: [],
}
