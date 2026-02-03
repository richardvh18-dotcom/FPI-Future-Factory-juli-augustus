/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // Responsive breakpoints voor tablet en mobiel
      screens: {
        'xs': '475px',
        // sm: '640px' (default)
        // md: '768px' (default) - tablet
        // lg: '1024px' (default) - desktop
        // xl: '1280px' (default)
        // 2xl: '1536px' (default)
      },
      // Spacing voor touch-friendly interfaces
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [],
};
