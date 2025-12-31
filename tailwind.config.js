/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', "./src/**/*.{html,js}"],
  theme: {
    extend: {
      colors: { 
        'logoClr': '#20b2aa',
        'logoClrBlue': '#4485d1',
        'spreadsheetClr': '#0ab677ff',
        'txtWht': '#f5f5f5',
      },
    },
  },
  plugins: [],
}

