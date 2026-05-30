import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'

// The Playwright runner (auth fixtures, seed) needs Supabase env vars that
// Next.js would otherwise load from .env.local only for the app process.
loadEnv({ path: '.env.local' })

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: path.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: path.resolve('./tests/e2e/global-teardown.ts'),
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(mobile|a11y|cross-browser)\/.*\.spec\.ts$/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: /mobile\/.*\.spec\.ts$/,
    },
    {
      name: 'axe-audit',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /a11y\/.*\.spec\.ts$/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /cross-browser\/.*\.spec\.ts$/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /cross-browser\/.*\.spec\.ts$/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      testMatch: /cross-browser\/.*\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/status',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E: '1',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      // /api/status is presence-only for externals (see launch-check REQUIRED_ENV).
      // Provide placeholders so the health gate is 200 without real prod creds;
      // DB + pg-boss checks stay real.
      MP_CLIENT_ID: process.env.MP_CLIENT_ID ?? 'e2e-placeholder',
      MP_CLIENT_SECRET: process.env.MP_CLIENT_SECRET ?? 'e2e-placeholder',
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? 'e2e-placeholder',
      SENTRY_DSN: process.env.SENTRY_DSN ?? 'e2e-placeholder',
      // Enable mock MercadoPago so the checkout page and webhook handler
      // run in deterministic mock mode during E2E.
      MP_MOCK_MODE: '1',
      MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET ?? 'test-webhook-secret',
    },
  },
})
