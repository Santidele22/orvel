import { defineConfig, devices } from '@playwright/test';

/**
 * The dashboard's public surfaces, against its dev server.
 *
 * The suite is self-contained on purpose: it stubs the backend it depends on, so it asserts the
 * app's behaviour instead of a database's state, and it needs no landing server. The real, buildable
 * web/pwa seam (PWA install surface + runtime smoke) lives in `playwright.seam.config.ts`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  outputDir: '.cache/playwright-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '.cache/playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4200/dashboard',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: 'pnpm run dev:dashboard:proxy',
      url: 'http://127.0.0.1:4200/dashboard',
      // The seam config also uses this dev server; whichever runs first starts it.
      reuseExistingServer: true,
      timeout: 240_000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
