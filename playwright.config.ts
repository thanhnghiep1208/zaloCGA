import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests require a running app and test Firebase accounts.
 *
 * Set these env vars before running (or add to .env.test.local):
 *   E2E_BASE_URL        — defaults to http://localhost:3000
 *   E2E_USER_USERNAME   — username for a regular user account
 *   E2E_USER_PASSWORD
 *   E2E_ADMIN_USERNAME  — username for an admin account
 *   E2E_ADMIN_PASSWORD
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /e2e\/global-setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
});
