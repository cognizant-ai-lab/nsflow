
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

export default defineConfig(() => { 
  return {
    plugins: [react()],
    base: "/",
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
          target: `http://localhost:8005`,
          changeOrigin: true,
          secure: false,
        },
      },
      historyApiFallback: true, // Needed to support page refresh on /home
    },
  };
});
