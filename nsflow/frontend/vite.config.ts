
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.

// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// ENN-release SDK Software in commercial settings.

// END COPYRIGHT
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig (({ mode }) => ({
  plugins: [react()],
  base: mode === "development" ? "/" : "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        entryFileNames: "assets/index.js", // Static JS filename
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
}));
