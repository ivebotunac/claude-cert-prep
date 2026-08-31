import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against a real Vite preview build, not the dev server, so
 * what is tested is what ships. The SQLite WASM backend needs a real origin, which
 * is another reason not to test over file://.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // the app holds a single-tab OPFS lock
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
