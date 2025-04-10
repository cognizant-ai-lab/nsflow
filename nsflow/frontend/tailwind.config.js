
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT
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
