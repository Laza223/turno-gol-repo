import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'

// ─── Seed constants (mirror scripts/seed-e2e.ts) ────────────────────────────

const DEPOSIT_TENANT_ID = '00000000-0000-4000-8000-000000000030'
const DEPOSIT_TENANT_SLUG = 'e2e-complejo-sena'
const DEPOSIT_COURT_ID = '00000000-0000-4000-8000-000000000031'

const DEMO_TENANT_SLUG = 'e2e-complejo-demo'
const DEMO_COURT_ID = '00000000-0000-4000-8000-000000000010'

// Test date: today + 2 days, within the 6-day advance window.
function getTestDate(): string {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function reservarUrl(slug: string, courtId: string, date: string, time: string): string {
  return `/${slug}/reservar?court=${courtId}&date=${date}&time=${time}&dur=60`
}

/** Extract the bookingId UUID from a /mock-mp/checkout?booking=<id> URL. */
function extractBookingId(url: string): string {
  const m = /booking=([0-9a-f-]{36})/i.exec(url)
  if (!m?.[1]) throw new Error(`Could not extract bookingId from URL: ${url}`)
  return m[1]
}

/** Service-role Supabase client for DB assertions and cleanup. */
function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Delete payments then bookings for a given set of booking IDs. Swallows errors. */
async function cleanupBookings(bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return
  try {
    const supabase = makeSupabase()
    // NULL bookings.payment_id first — fk_bookings_payment blocks DELETE FROM
    // payments otherwise (createDepositPayment sets bookings.payment_id).
    await supabase.from('bookings').update({ payment_id: null, payment_method: null }).in('id', bookingIds)
    await supabase.from('payments').delete().in('booking_id', bookingIds)
    await supabase.from('bookings').delete().in('id', bookingIds)
  } catch {
    // swallow — cleanup failures must not mask real test failures
  }
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('booking flow — MercadoPago deposit + no-deposit', () => {
  const date = getTestDate()

  // ── Scenario 1: Happy path — deposit → mock MP → confirmed ────────────────

  test('S1: deposit happy path → /exito + DB confirmed', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()
    const collectedIds: string[] = []

    try {
      // Optional nod to "search → complejo" (as per spec)
      await page.goto(`/${DEPOSIT_TENANT_SLUG}`)
      await expect(page.getByText('E2E Complejo Seña')).toBeVisible()

      // Navigate directly to the reservar page — the slug→grid→slot link flow is
      // covered by availability.spec.ts (F6). F7 new coverage starts at form→MP.
      await page.goto(reservarUrl(DEPOSIT_TENANT_SLUG, DEPOSIT_COURT_ID, date, '14:00'))
      await expect(page.getByRole('heading', { name: /confirmá tu reserva/i })).toBeVisible()

      // Click the deposit confirm button
      await page.getByRole('button', { name: 'Pagar seña y reservar' }).click()

      // Should be on mock MP checkout
      await expect(page).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15_000 })
      await expect(page.getByText(/entorno de prueba/i)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Pagar (aprobado)' })).toBeVisible()

      const bookingId = extractBookingId(page.url())
      collectedIds.push(bookingId)

      // Pay (approved)
      await page.getByRole('button', { name: 'Pagar (aprobado)' }).click()

      // Should land on /exito with confirmed message
      await expect(page).toHaveURL(new RegExp(`/reserva/${bookingId}/exito`), { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 10_000,
      })

      // DB assertions
      const supabase = makeSupabase()
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('status, deposit_status')
        .eq('id', bookingId)
        .single()
      expect(error).toBeNull()
      expect(booking?.status).toBe('confirmed')
      expect(booking?.deposit_status).toBe('paid')
    } finally {
      await ctx.close()
      await cleanupBookings(collectedIds)
    }
  })

  // ── Scenario 2: MP rejected → error page → retry → confirmed ─────────────

  test('S2: payment rejected → reintentar → confirmed', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()
    const collectedIds: string[] = []

    try {
      await page.goto(reservarUrl(DEPOSIT_TENANT_SLUG, DEPOSIT_COURT_ID, date, '16:00'))
      await expect(page.getByRole('heading', { name: /confirmá tu reserva/i })).toBeVisible()

      await page.getByRole('button', { name: 'Pagar seña y reservar' }).click()
      await expect(page).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15_000 })

      const bookingId = extractBookingId(page.url())
      collectedIds.push(bookingId)

      // Reject the payment
      await page.getByRole('button', { name: 'Pago rechazado' }).click()

      // Should be on the error page
      await expect(page).toHaveURL(new RegExp(`/reserva/${bookingId}/error`), {
        timeout: 15_000,
      })
      await expect(page.getByRole('heading', { name: /el pago no se procesó/i })).toBeVisible()

      // DB: booking still pending_payment
      const supabase = makeSupabase()
      const { data: pendingBooking } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single()
      expect(pendingBooking?.status).toBe('pending_payment')

      // "Reintentar pago" button visible
      await expect(page.getByRole('button', { name: 'Reintentar pago' })).toBeVisible()

      // Click retry → back on mock MP checkout
      await page.getByRole('button', { name: 'Reintentar pago' }).click()
      await expect(page).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15_000 })

      // Pay approved on second attempt
      await page.getByRole('button', { name: 'Pagar (aprobado)' }).click()
      await expect(page).toHaveURL(new RegExp(`/reserva/${bookingId}/exito`), {
        timeout: 15_000,
      })
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 10_000,
      })

      // DB: now confirmed
      const { data: confirmedBooking } = await supabase
        .from('bookings')
        .select('status, deposit_status')
        .eq('id', bookingId)
        .single()
      expect(confirmedBooking?.status).toBe('confirmed')
      expect(confirmedBooking?.deposit_status).toBe('paid')
    } finally {
      await ctx.close()
      await cleanupBookings(collectedIds)
    }
  })

  // ── Scenario 3: Timeout webhook → polling watcher → confirmed ─────────────

  test('S3: webhook arrives out-of-band → polling flips to confirmed', async ({
    browser,
    playerStorageState,
    request,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()
    const collectedIds: string[] = []

    try {
      // Create booking and land on mock MP checkout
      await page.goto(reservarUrl(DEPOSIT_TENANT_SLUG, DEPOSIT_COURT_ID, date, '18:00'))
      await expect(page.getByRole('heading', { name: /confirmá tu reserva/i })).toBeVisible()

      await page.getByRole('button', { name: 'Pagar seña y reservar' }).click()
      await expect(page).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15_000 })

      const bookingId = extractBookingId(page.url())
      collectedIds.push(bookingId)

      // Navigate to the /pendiente watcher WITHOUT clicking any pay button.
      // This simulates the player returning before the webhook lands.
      await page.goto(`/reserva/${bookingId}/pendiente`)

      // Watcher spinner must be visible
      await expect(page.getByText('Confirmando tu pago…')).toBeVisible({ timeout: 10_000 })
      // Countdown timer must also be visible (ExpiryCountdown renders "M:SS" format)
      await expect(page.getByText(/\d:\d\d/).first()).toBeVisible({ timeout: 5_000 })

      // DB: booking is still pending_payment
      const supabase = makeSupabase()
      const { data: pendingBooking } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single()
      expect(pendingBooking?.status).toBe('pending_payment')

      // Fire the webhook out-of-band using Playwright's APIRequestContext
      const webhookSecret = process.env.MP_WEBHOOK_SECRET ?? 'test-webhook-secret'
      const webhookResp = await request.post(
        `/api/webhooks/mercadopago?tenant=${DEPOSIT_TENANT_ID}`,
        {
          headers: { 'x-webhook-secret': webhookSecret },
          data: {
            id: `mock-evt-approved-${bookingId}`,
            type: 'payment',
            data: { id: `MOCK-APPROVED-${bookingId}` },
          },
        },
      )
      expect(webhookResp.ok()).toBeTruthy()

      // The watcher polls every 3s — assert UI flips WITHOUT manual reload
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 15_000,
      })

      // DB: confirmed after webhook
      const { data: confirmedBooking } = await supabase
        .from('bookings')
        .select('status, deposit_status')
        .eq('id', bookingId)
        .single()
      expect(confirmedBooking?.status).toBe('confirmed')
      expect(confirmedBooking?.deposit_status).toBe('paid')
    } finally {
      await ctx.close()
      await cleanupBookings(collectedIds)
    }
  })

  // ── Scenario 4: Regression — no deposit → instant confirm ────────────────

  test('S4: no-deposit tenant → instant confirmation, no MP redirect', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()
    const collectedIds: string[] = []

    try {
      // 14:00 on the demo tenant — different tenant than deposit scenarios, so no slot collision.
      await page.goto(reservarUrl(DEMO_TENANT_SLUG, DEMO_COURT_ID, date, '14:00'))
      await expect(page.getByRole('heading', { name: /confirmá tu reserva/i })).toBeVisible()

      await page.getByRole('button', { name: 'Confirmar reserva' }).click()

      // Must NOT pass through /mock-mp/checkout
      await expect(page).toHaveURL(/\/reserva\/[0-9a-f-]{36}\/exito/, { timeout: 15_000 })
      expect(page.url()).not.toContain('/mock-mp/')

      // Extract bookingId from URL
      const m = /\/reserva\/([0-9a-f-]{36})\/exito/.exec(page.url())
      const bookingId = m?.[1]
      if (!bookingId) throw new Error('Could not extract bookingId from /exito URL')
      collectedIds.push(bookingId)

      // Confirmed heading and the "pay at complex" copy
      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/pagás.*al llegar al complejo/i)).toBeVisible()

      // DB assertions
      const supabase = makeSupabase()
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('status, deposit_status')
        .eq('id', bookingId)
        .single()
      expect(error).toBeNull()
      expect(booking?.status).toBe('confirmed')
      expect(booking?.deposit_status).toBe('not_required')
    } finally {
      await ctx.close()
      await cleanupBookings(collectedIds)
    }
  })
})
