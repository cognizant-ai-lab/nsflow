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
