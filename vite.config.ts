import { defineConfig } from "vite";

// Served from https://xdgfx.github.io/parkup/ on GitHub Pages.
export default defineConfig({
  base: "./",
  build: { outDir: "dist" },
  // MapLibre 6 runs its worker as an ES module.
  worker: { format: "es" },
});
