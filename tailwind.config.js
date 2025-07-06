/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './main/index.html',
    './main/js/*.js'
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          900: '#1a202c',
          800: '#2d3748',
          700: '#4a5568',
          600: '#718096',
          500: '#a0aec0',
          400: '#cbd5e0'
        },
        cyan: {
          500: '#06b6d4',
          600: '#0891b2'
        }
      }
    }
  },
  plugins: []
}
