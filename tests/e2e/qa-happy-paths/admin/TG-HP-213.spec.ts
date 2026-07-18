/**
 * TG-HP-213 — Cancelar reserva con refund / sin refund.
 * Rol: Admin/manager (requireOperatorStaff). Copia el patrón probado de
 * tests/e2e/critical-flows/admin-cancel-mp-refund.spec.ts (mismo DECISION:
 * payment_id=null en el seed → cancelByAdmin salta la llamada real a MP,
 * MP_MOCK_MODE=1 igual, corre con la sesión admin del tenant demo).
 *
 * Caso CON refund: cancellationType='complejo' → shouldRefund=true SIEMPRE
 *   (Tarea #3, decideAdminRefund) → status=canceled_refunded. Con payment_id
 *   null + deposit_status='paid', cancelByAdmin toma la rama "seña en
 *   efectivo/transferencia: reembolso offline" → deposit_status='refunded'
 *   (booking.cancellation.ts:313-316) — el comentario de la spec de referencia
 *   ("deposit_status stays 'paid'") está desactualizado: esa rama offline no
 *   existía cuando se escribió; el código actual SÍ la tiene.
 *
 * Caso SIN refund: cancellationType='jugador' + reserva con inicio YA PASADO
 *   (ayer) → inPolicy=false determinísticamente sin depender de
 *   cancellation_policy.hours_before del tenant → shouldRefund=false →
 *   status=canceled_no_refund, deposit_status='captured'.
 *
 * CASO DE PLATA — no se limpia nada al final.
 * Evidencia: src/app/(admin)/reservas/actions.ts:236-342 (cancelBookingAction),
 * src/modules/bookings/booking.cancellation.ts:26-44,262-410 (decideAdminRefund,
 * cancelByAdmin), src/app/(admin)/reservas/[id]/BookingActions.tsx:96-240.
 */
import { subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { test, expect } from '../../fixtures'
import {
  tomorrowDateIsoArt,
  insertBookingServiceRole,
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
  E2E_STAFF_USER_ID,
} from '../../_helpers/booking-seed'
import { writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

function yesterdayDateIsoArt(): string {
  return formatInTimeZone(subDays(new Date(), 1), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd')
}

test.describe('TG-HP-213 — cancelar reserva con / sin refund', () => {
  test('con refund — "El complejo necesita cancelar" → canceled_refunded', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const tomorrow = tomorrowDateIsoArt()

    const bookingId = await insertBookingServiceRole(supabase, {
      tenantId: E2E_TENANT_ID,
      courtId: E2E_COURT_ID,
      date: tomorrow,
      timeStart: '15:00:00',
      timeEnd: '16:00:00',
      status: 'confirmed',
      depositStatus: 'paid',
      depositAmount: 50_000,
      createdByStaff: E2E_STAFF_USER_ID,
    })

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto(`/reservas/${bookingId}`)
      await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
        timeout: 15_000,
      })

      await page.getByRole('button', { name: 'Cancelar' }).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('heading', { name: 'Cancelar reserva' })).toBeVisible()
      await expect(page.getByText('¿Quién cancela?')).toBeVisible()

      await page.getByRole('radio', { name: /El complejo necesita cancelar/i }).click()
      // El copy del aviso de reembolso depende de paymentMethod (MP vs
      // efectivo/transferencia, BookingActions.tsx:130-139) — el seed usa
      // paymentMethod=null (mismo DECISION que la spec de referencia), así que
      // cae en la rama "Coordiná el reembolso..." en vez de "Se reembolsará
      // ... vía MercadoPago." El regex cubre ambas ramas sin acoplarse a cuál.
      await expect(
        page.getByText(/(Se reembolsará la seña|Coordiná el reembolso)/i),
      ).toBeVisible()
      await page.locator('#cancel-reason').fill('rotura de la cancha, mantenimiento programado')

      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar reserva' }).click()

      await expect(page.getByText('Reserva cancelada', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
      await expect(page.locator('dd').filter({ hasText: /Cancelada/i })).toBeVisible({
        timeout: 10_000,
      })

      const { data: row, error } = await supabase
        .from('bookings')
        .select('status, canceled_reason, canceled_by, deposit_status')
        .eq('id', bookingId)
        .single()

      expect(error).toBeNull()
      expect(row?.status).toBe('canceled_refunded')
      expect(row?.canceled_reason).toBe(
        'Cancelado por el complejo: rotura de la cancha, mantenimiento programado',
      )
      expect(row?.canceled_by).toBe('admin')
      expect(row?.deposit_status).toBe('refunded')

      await writeEvidence('TG-HP-213-con-refund', {
        status: 'pass',
        bookingId,
        row,
        notes: 'Caso de plata: booking queda vivo en DB.',
      })
    } finally {
      await context.close()
    }
  })

  test('sin refund — "El jugador pidió cancelar" fuera de plazo → canceled_no_refund', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const yesterday = yesterdayDateIsoArt()

    const bookingId = await insertBookingServiceRole(supabase, {
      tenantId: E2E_TENANT_ID,
      courtId: E2E_COURT_ID,
      date: yesterday,
      timeStart: '09:00:00',
      timeEnd: '10:00:00',
      status: 'confirmed',
      depositStatus: 'paid',
      depositAmount: 50_000,
      createdByStaff: E2E_STAFF_USER_ID,
    })

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto(`/reservas/${bookingId}`)
      await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
        timeout: 15_000,
      })

      await page.getByRole('button', { name: 'Cancelar' }).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })

      await page.getByRole('radio', { name: /El jugador pidió cancelar/i }).click()
      await expect(page.getByText(/fuera del plazo de cancelación/i)).toBeVisible()
      await page.locator('#cancel-reason').fill('el jugador avisó que no puede venir')

      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar reserva' }).click()

      await expect(page.getByText('Reserva cancelada', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
      await expect(page.locator('dd').filter({ hasText: /Cancelada/i })).toBeVisible({
        timeout: 10_000,
      })

      const { data: row, error } = await supabase
        .from('bookings')
        .select('status, canceled_reason, canceled_by, deposit_status')
        .eq('id', bookingId)
        .single()

      expect(error).toBeNull()
      expect(row?.status).toBe('canceled_no_refund')
      expect(row?.canceled_reason).toBe(
        'Cancelado a pedido del jugador: el jugador avisó que no puede venir',
      )
      expect(row?.canceled_by).toBe('admin')
      expect(row?.deposit_status).toBe('captured')

      await writeEvidence('TG-HP-213-sin-refund', {
        status: 'pass',
        bookingId,
        row,
        notes: 'Caso de plata: booking queda vivo en DB.',
      })
    } finally {
      await context.close()
    }
  })
})
