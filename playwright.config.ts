import { defineConfig } from "@playwright/test";

// override to run several checkouts in parallel
export const PORT = Number(process.env.DESKMATES_E2E_PORT ?? 47999);
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 800 } },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.05 } },
  webServer: { command: `npx vite build && node bin/deskmates.ts serve --port ${PORT} --themes tests/fixtures/themes`, url: `http://127.0.0.1:${PORT}/healthz`, reuseExistingServer: false, timeout: 60_000 },
});
