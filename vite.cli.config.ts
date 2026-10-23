import { defineConfig } from "vite";
import { builtinModules } from "node:module";
import { chmodSync } from "node:fs";
import { join } from "node:path";

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
  plugins: [{
    // the `deskmates` command runs this file: it must be executable in the package itself, since `npm update` keeps
    // the existing link and does not set the mode again (a fresh install does)
    name: "executable-cli",
    writeBundle(options) { chmodSync(join(options.dir!, "deskmates.js"), 0o755); },
  }],
});
