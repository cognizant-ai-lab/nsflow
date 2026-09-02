
/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

import { uiCommonAliases } from "./aliases";

// Vite's default esbuild target is [es2020, edge88, firefox78, chrome87, safari14].
// esbuild >= 0.28 has a regression where it tries to transform destructuring for
// safari14 (and then errors, since that transform isn't implemented). Only the safari14
// floor trips it; the rest of the default list is fine. We bump just the Safari floor to
// safari16 and keep every other default target, so browser support is unchanged except
// for dropping Safari 14/15 (Safari 16: 2022). This target must be applied to every
// esbuild path: production build (build.target), dev source transform (esbuild.target),
// and dev dependency pre-bundling (optimizeDeps.esbuildOptions.target). build.target
// alone does NOT cover `vite dev`.
const ESBUILD_TARGET = ["es2020", "edge88", "firefox78", "chrome87", "safari16"];

export default defineConfig(() => {
  return {
    plugins: [react()],
    base: "/",
    resolve: {
      // Deep dist paths live in ./aliases.ts — see the comment there for why we
      // bypass ui-common's barrel entirely.
      alias: { ...uiCommonAliases },
    },
    esbuild: {
      target: ESBUILD_TARGET,
    },
    optimizeDeps: {
      esbuildOptions: {
        target: ESBUILD_TARGET,
      },
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      target: ESBUILD_TARGET,
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
          target: `http://localhost:8005`,
          changeOrigin: true,
          secure: false,
        },
        // WebSockets (note: ws: true)
        '/api/v1/ws': {
          target: 'ws://localhost:8005',
          changeOrigin: true,
          ws: true,
        },
      },
      historyApiFallback: true, // Needed to support page refresh on /home
    },
  };
});
