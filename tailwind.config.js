/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: '#FFD200',
          yellowDark: '#F2C200',
          navy: '#141B2D',
          ink: '#1F2937',
        },
        income: '#12A150',
        expense: '#D92D20',
      },
      boxShadow: {
        card: '0 2px 10px rgba(20, 27, 45, 0.08)',
        sheet: '0 -6px 24px rgba(20, 27, 45, 0.16)',
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
