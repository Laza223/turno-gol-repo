import { test, expect } from '../../fixtures'
import type { Page } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { makeServiceClient } from '../../_helpers/player-seed'
import { tomorrowDateIsoArt } from '../../_helpers/booking-seed'

/**
 * TG-HP-105 — Pago RECHAZADO → error → sigue pending_payment → expira.
 * Rol: Jugador logueado. Prereq: igual a TG-HP-104 hasta /mock-mp/checkout
 * (tenant Seña, slot 17:00 mañana).
 *
 * CASO DE PLATA: la fila de bookings/payments queda VIVA a propósito (no se
 * limpia en finally).
 *
 * GAP documentado: el manual describe la expiración real vía el worker
 * pg-boss (expire-pending-booking.worker.ts, sweep cada 5 min) que transiciona
 * bookings.status a 'expired'. Este harness (playwright.qa.config.ts) solo
 * levanta `pnpm dev`, NO `pnpm jobs:start` — no hay worker corriendo para
 * consumir esa cola. Por eso este spec prueba la lógica REAL de `withinWindow`
 * (error/page.tsx:48-50) retrasando `created_at` vía SQL directo (backdating,
 * técnica estándar para no esperar 6 min reales) en vez de esperar al cron, y
 * NO afirma `bookings.status='expired'` — esa transición queda fuera del
 * alcance de este harness y se documenta como pendiente de una corrida con
 * workers activos.
 *
 * Evidence anchors: MockCheckoutView.tsx:89-95, mock-mp/checkout/actions.ts:101-144,
 * error/page.tsx:44-58, BookingErrorCard.tsx:44-59, payment.service.ts:247-254,
 * definitions.ts:33 (DEFAULT_EXPIRY_SECONDS=360).
 */

const SENA_TENANT_SLUG = 'e2e-complejo-sena'
const SENA_COURT_ID = '00000000-0000-4000-8000-000000000031'
const TIME = '17:00'
const DEFAULT_EXPIRY_SECONDS = 360

function reservarUrl(date: string): string {
  return `/${SENA_TENANT_SLUG}/reservar?court=${SENA_COURT_ID}&date=${date}&time=${TIME}&dur=60`
}

function extractBookingId(url: string): string {
  const m = /booking=([0-9a-f-]{36})/i.exec(url) ?? /\/reserva\/([0-9a-f-]{36})\//i.exec(url)
  if (!m?.[1]) throw new Error(`No se pudo extraer bookingId de la URL: ${url}`)
  return m[1]
}

async function runFlow(page: Page, date: string): Promise<void> {
  await page.goto(reservarUrl(date))
  await expect(page.getByRole('heading', { name: 'Confirmá tu reserva' })).toBeVisible()

  const confirmBtn = page.getByRole('button', { name: 'Pagar seña y reservar' })
  await confirmBtn.click()
  await expect(page).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15_000 })

  const bookingId = extractBookingId(page.url())

  // Rechazar el pago.
  await page.getByRole('button', { name: 'Pago rechazado' }).click()
  await expect(page).toHaveURL(new RegExp(`/reserva/${bookingId}/error`), { timeout: 15_000 })

  await expect(page.getByRole('heading', { name: 'El pago no se procesó.' })).toBeVisible()
  await expect(
    page.getByText('El pago fue rechazado o cancelado. Podés intentar de nuevo con otro medio.'),
  ).toBeVisible()

  // Dentro de la ventana de hold: CTA = "Reintentar pago".
  const retryBtn = page.getByRole('button', { name: 'Reintentar pago' })
  await expect(retryBtn).toBeVisible()

  // DB inmediato: booking SIGUE pending_payment (el webhook 'rejected' solo
  // toca payments, no transiciona bookings.status — payment.service.ts:247-254).
  const sb = makeServiceClient()
  const { data: pendingBooking, error: pendingErr } = await sb
    .from('bookings')
    .select('status, created_at')
    .eq('id', bookingId)
    .single()
  expect(pendingErr).toBeNull()
  expect(pendingBooking?.status).toBe('pending_payment')

  const { data: payment, error: paymentErr } = await sb
    .from('payments')
    .select('status, booking_id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  expect(paymentErr).toBeNull()
  expect(payment?.status).toBe('rejected')

  // Backdate created_at más allá de DEFAULT_EXPIRY_SECONDS (360s) para probar
  // la rama withinWindow=false SIN depender del worker de expiración (ver
  // nota de GAP arriba). Esto NO toca bookings.status.
  await runSql(
    `UPDATE bookings SET created_at = now() - interval '${DEFAULT_EXPIRY_SECONDS + 60} seconds' WHERE id = $1`,
    [bookingId],
  )

  await page.reload();
  await expect(page.getByRole('heading', { name: 'El pago no se procesó.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reservar de nuevo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar pago' })).not.toBeVisible()

  await writeEvidence('TG-HP-105', {
    status: 'pass',
    caso_de_plata: true,
    bookingId,
    db_booking_after_reject: pendingBooking,
    db_payment: payment,
    finalUrl: page.url(),
    notes:
      'Caso de plata: fila NO limpiada a propósito. status queda pending_payment (nunca ' +
      "'expired' — sin worker pg-boss corriendo en este harness). created_at se backdateó " +
      'vía SQL directo para probar withinWindow=false; es una manipulación DECLARADA del ' +
      'precondition (timestamp), no del resultado bajo prueba.',
  })
}

test.describe('TG-HP-105 — Pago RECHAZADO → sigue pending_payment', () => {
  test('rechazo no transiciona el booking; ventana de reintento expira por tiempo', async ({
    browser,
    playerStorageState,
  }) => {
    const date = tomorrowDateIsoArt()
    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()
    try {
      await runFlow(page, date)
    } finally {
      await ctx.close()
    }
  })
})
