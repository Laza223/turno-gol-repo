import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'

// QA Happy-Paths run (docs/testing/HAPPY_PATHS_MASTER.md). Dedicated config so the
// base playwright.config.ts stays untouched. HEADED + full artifacts (video/trace/
// screenshot ON) for visual evidence per case. workers:1 — this machine needs serial
// e2e to be honest (console-ninja/hydration → no-op clicks with parallel workers),
// and globalSetup re-seeds on every invocation so parallel runs would race the seed.
loadEnv({ path: '.env.local' })

export default defineConfig({
  testDir: './tests/e2e/qa-happy-paths',
  fullyParallel: false,
  forbidOnly: false,
  // retries:2 — absorbe el flake de dev-local: Turbopack Fast Refresh recompila
  // una ruta en su PRIMER hit a mitad de interacción, remonta el form y pierde
  // useState (confirmado con capturas de consola en 222/223). Es de entorno (dev
  // cold-start), NO de producto: un fallo real de producto falla los 3 intentos.
  retries: 2,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/qa/results.json' }],
    ['html', { outputFolder: 'playwright-report/qa', open: 'never' }],
  ],
  outputDir: 'test-results/qa/artifacts',
  globalSetup: path.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: path.resolve('./tests/e2e/global-teardown.ts'),
  timeout: 90_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    headless: false,
    video: 'on',
    screenshot: 'on',
    trace: 'on',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/status',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E: '1',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      MP_CLIENT_ID: process.env.MP_CLIENT_ID ?? 'e2e-placeholder',
      MP_CLIENT_SECRET: process.env.MP_CLIENT_SECRET ?? 'e2e-placeholder',
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? 'e2e-placeholder',
      SENTRY_DSN: process.env.SENTRY_DSN ?? 'e2e-placeholder',
      MP_MOCK_MODE: '1',
      MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET ?? 'test-webhook-secret',
    },
  },
})
