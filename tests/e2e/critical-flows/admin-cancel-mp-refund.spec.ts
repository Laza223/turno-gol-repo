/**
 * E2E — Admin cancels booking with paid MP deposit → canceled_refunded (doc7 Flujo 3)
 *
 * DECISION — Option A (demo tenant, no real MP call):
 *   cancelByAdmin (booking.cancellation.ts:165) only calls prepareRefund when BOTH
 *   `b.payment_id !== null` AND `gateway !== null`. In the E2E scenario the booking
 *   is inserted with payment_id=null (no real MP preference created), so the MP API
 *   call is unconditionally skipped and the action succeeds with the demo tenant's
 *   admin session. This avoids needing a second auth user for the deposit tenant.
 *
 *   Consequence: `deposit_status` stays 'paid' in DB (neither 'refunded' nor 'captured'
 *   branch fires when payment_id is null + shouldRefund=true). No `payments` refund row
 *   is created either (Fix #9, Fase 3: refund only via MP API, no cash_flows row).
 *   The test asserts `status='canceled_refunded'` + UI feedback — that is the core
 *   flow coverage goal.
 *
 * ALSO NOTE (Fix #9 / payment.service.ts):
 *   Real MP refunds do NOT generate a cash_flows row. They insert a `payments` row of
 *   type='refund'. The plan mentioned cash_flows — that assertion is incorrect per
 *   the actual implementation. Corrected here to assert bookings.status only.
 *
 * Flow covered: admin views booking detail → "Cancelar" button → ConfirmDialog with
 *   "¿Quién cancela?" radios → selects "El complejo necesita cancelar" (always
 *   refunds, Tarea #3) → fills reason → submits → status='canceled_refunded' in
 *   DB + "Cancelada" badge in UI.
 */

import { test, expect } from '../fixtures'
import {
  tomorrowDateIsoArt,
  insertBookingServiceRole,
  cleanupBookingsByIds,
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
  E2E_STAFF_USER_ID,
} from '../_helpers/booking-seed'

// ════════════════════════════════════════════════════════════════════════════
// TEST — Admin cancela booking con seña MP pagada → status=canceled_refunded
// ════════════════════════════════════════════════════════════════════════════

test.describe('admin cancel booking with paid MP deposit — flow 3 doc7', () => {
  test('admin cancels confirmed booking with paid MP deposit → status=canceled_refunded @critical', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const tomorrow = tomorrowDateIsoArt()

    // Insert a booking for the demo tenant with deposit_status='paid' but
    // payment_method=null. The DB constraint chk_booking_payment_consistency
    // requires mercadopago bookings to have a non-null payment_id, and we
    // intentionally don't want a real payment row here (see DECISION above).
    // The UI flow tested below doesn't depend on payment_method:
    //   - "Refund radios" appear whenever depositStatus='paid' & amount>0
    //   - cancelByAdmin skips the MP API call when payment_id is null,
    //     regardless of payment_method
    // The only visible difference is the refundWarning copy (cash vs MP),
    // which the spec does not assert.
    const bookingId = await insertBookingServiceRole(supabase, {
      tenantId: E2E_TENANT_ID,
      courtId: E2E_COURT_ID,
      date: tomorrow,
      timeStart: '18:00:00',
      timeEnd: '19:00:00',
      status: 'confirmed',
      depositStatus: 'paid',
      depositAmount: 50000, // 500 ARS in centavos
      createdByStaff: E2E_STAFF_USER_ID,
    })

    const context = await browser.newContext()
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // Navigate directly to the booking detail page.
      await page.goto(`/reservas/${bookingId}`)
      await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText('Confirmada')).toBeVisible()

      // Open the cancel dialog.
      await page.getByRole('button', { name: 'Cancelar' }).click()

      // ConfirmDialog must open with refund radios (deposit_status='paid').
      // Use heading role — the dialog has both the title h2 and the confirm
      // button labelled "Cancelar reserva" (strict-mode violation otherwise).
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('heading', { name: 'Cancelar reserva' })).toBeVisible()
      await expect(page.getByText('¿Quién cancela?')).toBeVisible()
      await expect(
        page.getByRole('radio', { name: /El complejo necesita cancelar/i }),
      ).toBeVisible()
      await expect(page.getByRole('radio', { name: /El jugador pidió cancelar/i })).toBeVisible()

      // "El complejo necesita cancelar" always refunds (Tarea #3: el motivo
      // decide el reembolso), independiente de la política horaria — evita que
      // el resultado dependa de cancellationPolicyHours / la hora del test.
      await page.getByRole('radio', { name: /El complejo necesita cancelar/i }).click()
      await page.locator('#cancel-reason').fill('test refund E2E')

      // Submit the cancellation.
      await page.getByRole('button', { name: 'Cancelar reserva' }).click()

      // Dialog closes and status badge updates to "Cancelada".
      // Use dd filter — /Cancelada/i also matches the toast + aria-live.
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
      await expect(page.locator('dd').filter({ hasText: /Cancelada/i })).toBeVisible({
        timeout: 10_000,
      })

      // Action buttons must be gone (booking is no longer 'confirmed').
      await expect(page.getByRole('button', { name: 'Cancelar' })).not.toBeVisible()

      // ── DB assertion ──────────────────────────────────────────────────────
      const { data: row, error } = await supabase
        .from('bookings')
        .select('status, canceled_reason, canceled_by')
        .eq('id', bookingId)
        .single()

      expect(error).toBeNull()
      expect(row?.status).toBe('canceled_refunded')
      // cancelByAdmin antepone la etiqueta del tipo de cancelación (Tarea #3).
      expect(row?.canceled_reason).toBe('Cancelado por el complejo: test refund E2E')
      expect(row?.canceled_by).toBe('admin')
    } finally {
      await context.close()
      await cleanupBookingsByIds(supabase, [bookingId])
    }
  })
})
