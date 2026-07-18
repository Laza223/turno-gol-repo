import { test, expect } from '../../fixtures'
import type { Page } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'
import { makeServiceClient } from '../../_helpers/player-seed'
import { tomorrowDateIsoArt } from '../../_helpers/booking-seed'

/**
 * TG-HP-104 — Reserva online CON seña (tenant Seña) → Checkout mock → aprobar.
 * Rol: Jugador logueado. Prereq: tenant Seña (requires_deposit=true 50%,
 * mp_access_token='mock-mp-token'), slot libre cancha ...031, 16:00 mañana.
 * MP_MOCK_MODE=1.
 *
 * CASO DE PLATA: la fila de bookings/payments queda VIVA a propósito (no se
 * limpia en finally) para que los verificadores la inspeccionen.
 *
 * Evidence anchors: reservar/page.tsx:67-70,75-77, reservar/actions.ts:169,172-179,
 * mock-mp/checkout/MockCheckoutView.tsx:35-45,80-86, mock-mp/checkout/actions.ts:43-98,
 * payment.service.ts:224-241,280-315, booking.concurrency.ts:21-57,
 * BookingSuccessCard.tsx:52-54,65-68, PaymentStatusWatcher.tsx:67-114,116-123.
 */

const SENA_TENANT_ID = '00000000-0000-4000-8000-000000000030'
const SENA_TENANT_SLUG = 'e2e-complejo-sena'
const SENA_COURT_ID = '00000000-0000-4000-8000-000000000031'
const TIME = '16:00'

function reservarUrl(date: string): string {
  return `/${SENA_TENANT_SLUG}/reservar?court=${SENA_COURT_ID}&date=${date}&time=${TIME}&dur=60`
}

/** Extrae el bookingId de una URL /mock-mp/checkout?booking=<id> o /reserva/<id>/... */
function extractBookingId(url: string): string {
  const m = /booking=([0-9a-f-]{36})/i.exec(url) ?? /\/reserva\/([0-9a-f-]{36})\//i.exec(url)
  if (!m?.[1]) throw new Error(`No se pudo extraer bookingId de la URL: ${url}`)
  return m[1]
}

async function runFlow(page: Page, date: string): Promise<void> {
  await page.goto(reservarUrl(date))
  await expect(page.getByRole('heading', { name: 'Confirmá tu reserva' })).toBeVisible()

  // Con seña: único método MP, botón "Pagar seña y reservar".
  const confirmBtn = page.getByRole('button', { name: 'Pagar seña y reservar' })
  await expect(confirmBtn).toBeVisible()
  await confirmBtn.click()

  // Redirige al checkout mock (createBookingAndCheckout → createDepositPayment → initPoint).
  await expect(page).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15_000 })
  await expect(page.getByText(/entorno de prueba \(mock\)/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pago de seña' })).toBeVisible()
  const payBtn = page.getByRole('button', { name: 'Pagar (aprobado)' })
  await expect(payBtn).toBeVisible()

  const bookingId = extractBookingId(page.url())

  // mockPay dispara el webhook interno /api/webhooks/mercadopago y redirige a /exito.
  await payBtn.click()
  await expect(page).toHaveURL(new RegExp(`/reserva/${bookingId}/exito`), { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
    timeout: 10_000,
  })
  // Copy con seña: "Seña pagada: $50" + "Resta abonar en el complejo: $50".
  await expect(page.getByText(/seña pagada:/i)).toBeVisible()
  await expect(page.getByText(/resta abonar en el complejo:/i)).toBeVisible()

  // DB: estado EXACTO — confirmed + deposit_status=paid + payments.status=approved,
  // montos en centavos (deposit = 50% de 10000 = 5000).
  const sb = makeServiceClient()
  const { data: booking, error: bookingErr } = await sb
    .from('bookings')
    .select('status, deposit_status, deposit_amount, price_snapshot, tenant_id, court_id, payment_id')
    .eq('id', bookingId)
    .single()

  expect(bookingErr).toBeNull()
  expect(booking?.status).toBe('confirmed')
  expect(booking?.deposit_status).toBe('paid')
  expect(booking?.deposit_amount).toBe(5000)
  expect(booking?.price_snapshot).toBe(10000)
  expect(booking?.tenant_id).toBe(SENA_TENANT_ID)
  expect(booking?.payment_id).toBeTruthy()

  const { data: payment, error: paymentErr } = await sb
    .from('payments')
    .select('status, amount, tenant_id, booking_id')
    .eq('booking_id', bookingId)
    .maybeSingle()

  expect(paymentErr).toBeNull()
  expect(payment?.status).toBe('approved')
  // payments.amount bajo MP mock es un artefacto FIJO (=1), NO el monto real —
  // ver mock-mp.ts:90 (LocalMockGateway.getPaymentStatus devuelve amount:1 con
  // el comentario "E2E asserts booking.status, not amount"). La verdad de dinero
  // es booking.deposit_amount=5000 (asertado arriba); en MP real el gateway
  // devuelve el monto real. Acá solo confirmamos el registro + su estado approved.
  expect(payment?.amount).toBe(1)

  // UI-sin-reload: no aplica (SSR + redirect real). No hay reload manual acá.

  await writeEvidence('TG-HP-104', {
    status: 'pass',
    caso_de_plata: true,
    bookingId,
    paymentId: booking?.payment_id,
    db_booking: booking,
    db_payment: payment,
    finalUrl: page.url(),
    notes:
      'Caso de plata: fila NO limpiada a propósito. mockPay dispara el webhook real ' +
      '(handleApproved) que transiciona pending_payment→confirmed y crea el payment approved. ' +
      'Email booking_confirmed a notifications no verificado en este spec (cuerpo real fuera de scope, GAP del manual).',
  })
}

test.describe('TG-HP-104 — Reserva CON seña → Checkout mock → aprobar', () => {
  test('paga la seña (mock aprobado) → booking confirmed + payment approved', async ({
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
      // Solo cerramos el contexto — la fila de bookings/payments queda VIVA
      // a propósito (caso de plata), NO se limpia acá.
      await ctx.close()
    }
  })
})
