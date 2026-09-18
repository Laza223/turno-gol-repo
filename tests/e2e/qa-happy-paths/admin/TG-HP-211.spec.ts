/**
 * TG-HP-211 — Marcar COMPLETADA (jugada).
 * Rol: Admin/manager (requireOperatorStaff). Prereq: reserva confirmed cuyo
 * horario de FIN ya pasó (server valida BookingNotYetEndedError si no).
 * Desde la Fase 3 "Marcar completada" abre `CompleteBookingDialog` ("Completar
 * turno") y la completación sale por `completeAndChargeBookingAction`, que en la
 * misma transacción registra el cobro del saldo como `cash_flows`. Con el seed
 * (price_snapshot 10000, sin seña) el diálogo precarga un cobro en efectivo por
 * el total: el submit es "Completar y cobrar" y deja un ingreso de $100.
 * Evidencia: src/app/(admin)/reservas/actions.ts (completeAndChargeBookingAction),
 * src/app/(admin)/reservas/CompleteBookingDialog.tsx.
 * Cleanup: el cash_flow referencia al booking (FK NO ACTION), así que se borra
 * antes que el booking — si no, el DELETE falla en silencio y el turno de ayer
 * queda vivo en la cancha E2E.
 */
import { subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { test, expect } from '../../fixtures'
import {
  insertBookingServiceRole,
  cleanupBookingsByIds,
  makeServiceClient,
  E2E_TENANT_ID,
  E2E_COURT_ID,
} from '../../_helpers/booking-seed'
import { writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

/** YYYY-MM-DD de ayer en ART — garantiza que el turno ya terminó, sin depender
 * de la hora local en la que corre el suite. */
function yesterdayDateIsoArt(): string {
  return formatInTimeZone(subDays(new Date(), 1), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd')
}

test.describe('TG-HP-211 — marcar completada', () => {
  test('admin marca una reserva confirmed con fin pasado como completada', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const yesterday = yesterdayDateIsoArt()

    const bookingId = await insertBookingServiceRole(supabase, {
      tenantId: E2E_TENANT_ID,
      courtId: E2E_COURT_ID,
      date: yesterday,
      timeStart: '10:00:00',
      timeEnd: '11:00:00',
      status: 'confirmed',
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
      await expect(page.locator('dd').filter({ hasText: 'Confirmada' })).toBeVisible()

      await page.getByRole('button', { name: 'Marcar completada' }).click()
      await expect(page.getByRole('heading', { name: 'Completar turno' })).toBeVisible({
        timeout: 15_000,
      })

      // Label exacto a propósito (no el regex de reservas-crud): con el seed de
      // arriba no queda deuda, y si cambia la aritmética del saldo este test
      // tiene que enterarse.
      await page.getByRole('button', { name: 'Completar y cobrar', exact: true }).click()

      await expect(page.locator('dd').filter({ hasText: 'Jugada' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('button', { name: 'Marcar completada' })).not.toBeVisible()
      expect(page.url()).toContain(`/reservas/${bookingId}`)

      // ── DB assertion ──────────────────────────────────────────────────────
      const { data: row, error } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single()

      expect(error).toBeNull()
      expect(row?.status).toBe('completed')

      // El cobro precargado entra a caja en la misma transacción.
      const { data: flows, error: flowsError } = await supabase
        .from('cash_flows')
        .select('type, category, amount, method')
        .eq('booking_id', bookingId)

      expect(flowsError).toBeNull()
      expect(flows).toEqual([
        { type: 'income', category: 'booking', amount: 10000, method: 'cash' },
      ])

      await writeEvidence('TG-HP-211', {
        status: 'pass',
        bookingId,
        finalStatus: row?.status,
        cashFlows: flows,
        notes:
          'Completado vía CompleteBookingDialog ("Completar y cobrar"), cobro en efectivo por el saldo.',
      })
    } finally {
      await context.close()
      const cash = await supabase.from('cash_flows').delete().eq('booking_id', bookingId)
      if (cash.error) console.warn(`[TG-HP-211] cleanup cash_flows: ${cash.error.message}`)
      await cleanupBookingsByIds(supabase, [bookingId])
    }
  })
})
