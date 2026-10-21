import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  base: "./",
  publicDir: false,
  build: { outDir: "../dist/web", assetsDir: "static", emptyOutDir: true, target: "es2022" },
});
