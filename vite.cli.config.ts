import { defineConfig } from "vite";
import { builtinModules } from "node:module";

/** Bundles the CLI and service to plain JavaScript for the npm package (Node will not strip types inside node_modules). */
export default defineConfig({
  build: {
    ssr: true, outDir: "dist/cli", emptyOutDir: true, target: "node22", minify: false,
    rollupOptions: {
      input: { deskmates: "bin/deskmates.ts" },
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`), "ws", "smol-toml"],
      output: { format: "es", entryFileNames: "[name].js" },
    },
  },
});
