/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Gara brand: teal/green family (amagara = life & health)
        brand: {
          50: '#e9f9f3',
          100: '#c9f0e2',
          200: '#93e2c6',
          300: '#5cd3a9',
          400: '#2cbb8c',
          500: '#0f9d77',
          600: '#0c7e60',
          700: '#0a6450',
          800: '#0a5041',
          900: '#093f34',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
