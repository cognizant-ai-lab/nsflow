
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
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ mode }) => {
  // Load environment variables based on current mode (e.g., 'development')
  const env = loadEnv(mode, process.cwd());

  const backendHost = env.VITE_BACKEND_HOST || "localhost";
  const backendPort = env.VITE_BACKEND_PORT || "8005";
  const targetUrl = `http://${backendHost}:${backendPort}`;

  return {
    plugins: [react()],
    base: mode === "development" ? "/" : "./",
    build: {
      outDir: "dist",
      assetsDir: "assets",
      rollupOptions: {
        output: {
          entryFileNames: "assets/index.js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    server: {
      proxy: {
        "/api/v1": {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
        },
      },
      historyApiFallback: true, // Needed to support page refresh on /home
    },
  };
});

