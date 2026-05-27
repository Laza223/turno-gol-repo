/**
 * E2E — PIN gate UX (audit T6, fase F5)
 *
 * Verifies the T4 UX layer over B6's server-side rate-limit (5 attempts / 5 min per tenant).
 *
 *   #1  Happy — PIN correcto: /settings/reservas → enter "1234" → access granted.
 *   #2  Edge — PIN incorrecto: enter wrong PIN → "PIN incorrecto." text + input stays enabled.
 *   #3  Edge — lockout: 5 wrong PINs → 6th attempt shows "Bloqueado hasta M:SS" + input
 *              disabled + button disabled.
 *   #4  Edge — attemptsLeft ≤2 warning: 3 wrong → 4th attempt shows "Te quedan 1 intentos
 *              antes del bloqueo."
 *
 * Tests #3 + #4 depend on the Upstash rate-limit state. We run them `serial` and order
 * them so #4 (attemptsLeft warning) runs first while attempts are fresh, then #3 (lockout)
 * exhausts the budget. Both are skipped if UPSTASH_REDIS_REST_URL is not set — the Playwright
 * env can't reset Upstash unless given credentials.
 *
 * The tenant E2E seed does NOT include a staff_pin_hash. `beforeAll` sets it to hash("1234").
 */

import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'
import { hashPin } from '@/modules/auth/pin'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const E2E_PIN = '1234'
const RATE_LIMIT_KEY = `rl:pinAttempts:${TENANT_ID}`

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

function maybeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

async function setTenantPin(supabase: ReturnType<typeof makeServiceClient>): Promise<void> {
  const hash = await hashPin(E2E_PIN)
  const { data } = await supabase.from('tenants').select('settings').eq('id', TENANT_ID).single()
  const newSettings = { ...(data?.settings ?? {}), staff_pin_hash: hash }
  await supabase.from('tenants').update({ settings: newSettings }).eq('id', TENANT_ID)
}

async function resetRateLimit(): Promise<void> {
  const r = maybeRedis()
  if (!r) return
  // Upstash ratelimit uses multiple keys per limiter (token-bucket has timestamps).
  // The simplest reset is to scan the prefix; for the test scope we delete by exact
  // key prefix variants used by @upstash/ratelimit token-bucket.
  for (const suffix of ['', ':tokens', ':lastRefill']) {
    await r.del(`${RATE_LIMIT_KEY}${suffix}`).catch(() => undefined)
  }
}

test.describe('PIN lockout UX', () => {
  test.beforeAll(async () => {
    const supabase = makeServiceClient()
    await setTenantPin(supabase)
  })

  test('#1 happy — PIN correcto allows access', async ({ page, adminStorageState }) => {
    await resetRateLimit()
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    await page.goto('/settings/reservas')

    await expect(page.getByRole('heading', { name: /Zona protegida/i })).toBeVisible()
    await page.locator('input#pin').fill(E2E_PIN)
    await page.getByRole('button', { name: /Confirmar/i }).click()

    // After success, PinGate renders children — should see the reservas form.
    // The settings/reservas page has tabs and a "Política de reservas" heading or similar.
    // Wait for the gate heading to disappear.
    await expect(page.getByRole('heading', { name: /Zona protegida/i })).toBeHidden({ timeout: 5000 })
  })

  test('#2 edge — PIN incorrecto shows error and stays enabled', async ({
    page,
    adminStorageState,
  }) => {
    await resetRateLimit()
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    await page.goto('/settings/reservas')

    await expect(page.getByRole('heading', { name: /Zona protegida/i })).toBeVisible()
    await page.locator('input#pin').fill('0000')
    await page.getByRole('button', { name: /Confirmar/i }).click()

    await expect(page.getByText('PIN incorrecto.')).toBeVisible()
    await expect(page.locator('input#pin')).toBeEnabled()
    await expect(page.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
    // Button disabled here because pin.length < 4 after the failed attempt clears the field.
  })

  // ── Serial section: depends on Upstash counter state ──────────────────────
  test.describe.serial('lockout + attemptsLeft (requires Upstash test reset)', () => {
    test.beforeEach(async () => {
      test.skip(
        !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN,
        'Skipped — Upstash credentials required to reset rate-limit between tests',
      )
      await resetRateLimit()
    })

    test('#4 edge — attemptsLeft <= 2 warning surfaces', async ({
      page,
      adminStorageState,
    }) => {
      await page.context().addCookies(JSON.parse(adminStorageState).cookies)
      await page.goto('/settings/reservas')

      // 5 attempts/5min total. After 3 wrong, remaining = 2 (warning threshold).
      for (let i = 0; i < 3; i++) {
        await page.locator('input#pin').fill('0000')
        await page.getByRole('button', { name: /Confirmar/i }).click()
        await expect(page.getByText('PIN incorrecto.')).toBeVisible()
      }

      // 4th wrong → remaining = 1 → warning visible
      await page.locator('input#pin').fill('0000')
      await page.getByRole('button', { name: /Confirmar/i }).click()
      await expect(page.getByText(/Te quedan 1 intentos antes del bloqueo/i)).toBeVisible()
    })

    test('#3 edge — 6th attempt is blocked with countdown', async ({
      page,
      adminStorageState,
    }) => {
      await page.context().addCookies(JSON.parse(adminStorageState).cookies)
      await page.goto('/settings/reservas')

      // Exhaust 5 attempts
      for (let i = 0; i < 5; i++) {
        await page.locator('input#pin').fill('0000')
        await page.getByRole('button', { name: /Confirmar/i }).click()
      }

      // 6th attempt → locked
      await page.locator('input#pin').fill('0000')
      await page.getByRole('button', { name: /Confirmar/i }).click()
      await expect(page.getByText(/Bloqueado hasta/i)).toBeVisible()
      await expect(page.locator('input#pin')).toBeDisabled()
      await expect(page.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
    })
  })

  test.afterAll(async () => {
    await resetRateLimit()
  })
})
