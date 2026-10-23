import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// override to run several checkouts in parallel
export const PORT = Number(process.env.DESKMATES_E2E_PORT ?? 47999);
// the test service gets a home of its own: not your roles.toml, token or history, and none of your agents' transcripts
const home = mkdtempSync(join(tmpdir(), "deskmates-e2e-"));
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 800 } },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.05 } },
  webServer: { command: `npx vite build && node bin/deskmates.ts serve --port ${PORT} --themes tests/fixtures/themes --no-transcripts`, env: { XDG_CONFIG_HOME: join(home, "config"), XDG_STATE_HOME: join(home, "state") }, url: `http://127.0.0.1:${PORT}/healthz`, reuseExistingServer: false, timeout: 60_000 },
});
