/**
 * E2E — Admin cancels booking with paid MP deposit → canceled_refunded (doc7 Flujo 3)
 *
 * DECISION — Option A (demo tenant, no real MP call):
 *   cancelByAdmin (booking.cancellation.ts:165) only calls createRefund when BOTH
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
 *   refund radios (hasPaidDeposit=true) → selects "Con reembolso" → fills reason →
 *   submits → status='canceled_refunded' in DB + "Cancelada" badge in UI.
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
  test(
    'admin cancels confirmed booking with paid MP deposit → status=canceled_refunded @critical',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const tomorrow = tomorrowDateIsoArt()

      // Insert a booking for the demo tenant with payment_method='mercadopago' and
      // deposit_status='paid'. payment_id is left null intentionally — see DECISION above.
      const bookingId = await insertBookingServiceRole(supabase, {
        tenantId: E2E_TENANT_ID,
        courtId: E2E_COURT_ID,
        date: tomorrow,
        timeStart: '18:00:00',
        timeEnd: '19:00:00',
        status: 'confirmed',
        depositStatus: 'paid',
        depositAmount: 50000, // 500 ARS in centavos
        paymentMethod: 'mercadopago',
        createdByStaff: E2E_STAFF_USER_ID,
      })

      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        // Navigate directly to the booking detail page.
        await page.goto(`/reservas/${bookingId}`)
        await expect(
          page.getByRole('heading', { name: 'Detalle de la reserva' }),
        ).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText('Confirmada')).toBeVisible()

        // Open the cancel dialog.
        await page.getByRole('button', { name: 'Cancelar' }).click()

        // ConfirmDialog must open with refund radios (deposit_status='paid').
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('Cancelar reserva')).toBeVisible()
        await expect(page.getByText('¿Reembolsar la seña?')).toBeVisible()
        await expect(page.getByRole('radio', { name: /Sin reembolso/i })).toBeVisible()
        await expect(page.getByRole('radio', { name: /Con reembolso/i })).toBeVisible()

        // Select "Con reembolso" and fill the mandatory cancel reason.
        await page.getByRole('radio', { name: /Con reembolso/i }).click()
        await page.locator('#cancel-reason').fill('test refund E2E')

        // Submit the cancellation.
        await page.getByRole('button', { name: 'Cancelar reserva' }).click()

        // Dialog closes and status badge updates to "Cancelada".
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/Cancelada/i)).toBeVisible({ timeout: 10_000 })

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
        expect(row?.canceled_reason).toBe('test refund E2E')
        expect(row?.canceled_by).toBe('admin')
      } finally {
        await context.close()
        await cleanupBookingsByIds(supabase, [bookingId])
      }
    },
  )
})
