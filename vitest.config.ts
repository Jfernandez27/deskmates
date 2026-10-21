import { defineConfig } from "vitest/config";

export default defineConfig({ test: { root: ".", include: ["tests/unit/**/*.test.ts", "tests/web/**/*.test.ts", "vscode/test/**/*.test.ts"] } });
