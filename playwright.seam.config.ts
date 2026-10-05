import { defineConfig, devices } from '@playwright/test';

/**
 * Fase 3 of #1098 — the web/pwa seam e2e.
 *
 * Two things the repo's existing Playwright suite cannot cover:
 *
 * 1. the PWA install surface, which needs a **production build** (the service worker is disabled in
 *    dev mode and `ngsw-worker.js` is only emitted by `ng build`), served by
 *    `scripts/serve-dashboard-dist.mjs`;
 * 2. a **runtime smoke of the dev servers of both targets**, which is the only gate that sees an
 *    app that builds fine and never boots.
 *
 * The existing `playwright.config.ts` (dev servers, authenticated flows) is untouched.
 */
export default defineConfig({
  testDir: './tests/e2e-seam',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  outputDir: '.cache/playwright-seam-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '.cache/playwright-seam-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4400/dashboard',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      // Built artifact: required for the service worker.
      command: 'pnpm run serve:dashboard:dist',
      url: 'http://127.0.0.1:4400/dashboard/',
      // The two e2e configs share these ports; whichever starts a server first, the other reuses it.
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      // Dev server: the runtime smoke needs the development module graph.
      command: 'pnpm run dev:dashboard:proxy',
      url: 'http://127.0.0.1:4200/dashboard/',
      reuseExistingServer: true,
      timeout: 240_000
    },
    {
      command: 'pnpm run dev:dashboard-web:proxy',
      url: 'http://127.0.0.1:4300/',
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
