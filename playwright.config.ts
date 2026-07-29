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
  // En CI el webServer es `pnpm dev` (compilación on-demand) sobre un runner
  // de 2 cores compartido con el stack de Supabase: el default de 30s por test
  // no alcanza para los flujos largos (checkout completo) la primera vez que
  // compilan sus rutas. Local queda en el default.
  timeout: process.env.CI ? 90_000 : 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: path.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: path.resolve('./tests/e2e/global-teardown.ts'),
  expect: {
    toHaveScreenshot: {
      // Umbral por-pixel (YIQ). 0.2 es el default y tolera anti-aliasing.
      threshold: 0.2,
      // Ratio y no cantidad absoluta: independiente del tamaño del viewport.
      // 0.01 = 1% de pixeles distintos. Se aprieta a 0.002 después de 3 semanas
      // sin falsas alarmas, no antes.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
    // toHaveScreenshot reintenta hasta que dos capturas seguidas coincidan;
    // 10s le da margen a las fuentes y a la hidratación sin colgarse.
    timeout: 10_000,
  },
  // {platform} es deliberado: las baselines se generan SOLO en Linux (CI). Si
  // algún día el project visual corre en Windows por accidente, escribe en
  // .../win32/ en vez de pisar las buenas. El error se vuelve obvio y se
  // descarta con un `git clean`, en vez de ser silencioso y catastrófico.
  snapshotPathTemplate: 'tests/e2e/visual/__screenshots__/{projectName}/{platform}/{arg}{ext}',
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
      testIgnore: /(mobile|a11y|cross-browser|visual)\/.*\.spec\.ts$/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: [/mobile\/.*\.spec\.ts$/, /capture-screenshots\.spec\.ts$/],
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
    // ─── Regresión visual ────────────────────────────────────────────────────
    // Viewport, DPR, colorScheme, locale y timezone EXPLÍCITOS, no heredados de
    // devices[]: un bump de Playwright puede cambiar el descriptor del device e
    // invalidar todas las baselines en silencio. Acá el contrato es nuestro.
    //
    // reducedMotion:'reduce' engancha el @media que ya existe en globals.css
    // (animation-duration 0.01ms, mata .skeleton y los transform de hover) —
    // cero CSS nuevo, y de paso se fotografía el camino accesible.
    //
    // retries:0 — un retry en visual no arregla nada, solo tarda el doble.
    {
      name: 'visual',
      testMatch: /visual\/.*(?<!\.mobile)\.spec\.ts$/,
      retries: 0,
      // Serial: capturar y comparar imágenes es pesado, y varios workers sobre
      // el mismo seed compiten sin necesidad. Son 6 fotos, no hay nada que
      // paralelizar.
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: 'light',
        locale: 'es-AR',
        timezoneId: 'America/Argentina/Buenos_Aires',
        // En esta versión de Playwright `reducedMotion` vive en contextOptions,
        // no suelto en `use`.
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
    {
      name: 'visual-mobile',
      testMatch: /visual\/.*\.mobile\.spec\.ts$/,
      retries: 0,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
        locale: 'es-AR',
        timezoneId: 'America/Argentina/Buenos_Aires',
        // En esta versión de Playwright `reducedMotion` vive en contextOptions,
        // no suelto en `use`.
        contextOptions: { reducedMotion: 'reduce' },
      },
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
