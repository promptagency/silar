import { defineConfig, devices } from "@playwright/test";

// Runs against the production build so the CSP meta tag is in place.
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:4173" },
  webServer: { command: "npm run build && npm run preview -- --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: false },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
