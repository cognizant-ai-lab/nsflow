/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6", // Blue-500
        secondary: "#9333ea", // Purple-600
        background: "#242424", // Dark background
        textLight: "#e2e8f0",
        textDark: "#1e293b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Avenir", "Helvetica", "Arial", "sans-serif"],
      },
      spacing: {
        "header-height": "3.5rem",
        "sidebar-width": "260px",
        "chat-width": "300px",
      },
    },
  },
  plugins: [],
};
