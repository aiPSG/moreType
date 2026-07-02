import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Transpile down for a wider browser baseline (pre-ES2020 engines).
    target: "es2019",
    // Stable, unhashed asset filenames. GitHub Pages re-hashing on every deploy
    // meant a cached index.html could reference a now-deleted chunk and white-
    // screen; with fixed names the referenced files always exist. Pages still
    // sends short cache + ETag, so content stays fresh on revalidation.
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
