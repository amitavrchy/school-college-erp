import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 45_000, fullyParallel: false, workers: 1,
  expect: { timeout: 15_000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.E2E_URL || 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'], channel: 'chrome' },
});
