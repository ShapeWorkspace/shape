/* eslint-env node */
import { defineConfig, devices } from "@playwright/test"
import { config } from "dotenv"

// Load environment variables from .env.local
config({ path: ".env.local", quiet: true })

// In Docker environments (dtree worktrees), we need to start the server and client
// before running tests. In local dev, they're already running.
const isDocker = process.env.DOCKER_ENV === "true"
const clientPort = process.env.CLIENT_PORT || process.env.VITE_CLIENT_PORT
if (!clientPort) {
  throw new Error("CLIENT_PORT or VITE_CLIENT_PORT environment variable is required")
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // Give E2E flows enough time (UI + network)
  timeout: 10 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  testDir: "./tests/playwright",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /** workers: 2, */
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "list",

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${clientPort}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    headless: true,
    video: "off",
    screenshot: "off",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // In Docker environments, the Go server is already running via docker-compose.
  // We only need to start the Vite dev client.
  // In local dev, both are already running.
  webServer: isDocker
    ? {
        command: `cd /app && yarn dev --port ${clientPort}`,
        url: `http://localhost:${clientPort}`,
        reuseExistingServer: true,
        timeout: 120 * 1000,
      }
    : undefined,
})
