import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
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
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: 'pnpm run dev:landing:proxy',
      url: 'http://127.0.0.1:4321',
      reuseExistingServer: true,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
