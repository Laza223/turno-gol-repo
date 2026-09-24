/**
 * TG-HP-211 — Marcar COMPLETADA (jugada).
 * Rol: Admin/manager (requireOperatorStaff). Prereq: reserva confirmed cuyo
 * horario de FIN ya pasó (server valida BookingNotYetEndedError si no).
 * "Marcar completada" abre `CompleteBookingDialog` ("Completar turno"), que
 * SOLO cambia el estado (el cobro se mudó a "Cobros de turno", el mismo
 * componente que Hoy — refactor/extract-cobro). La completación sale por
 * `completeAndChargeBookingAction` con `charges: []`: con el seed
 * (price_snapshot 10000, sin seña) queda saldo pendiente, así que el diálogo
 * muestra el aviso de deuda y el submit es "Completar con deuda" — sin
 * `cash_flows` generado.
 * Evidencia: src/app/(admin)/reservas/actions.ts (completeAndChargeBookingAction),
 * src/app/(admin)/reservas/CompleteBookingDialog.tsx.
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
      // arriba (price_snapshot 10000, sin seña, sin cobros) queda deuda, y si
      // cambia la aritmética del saldo este test tiene que enterarse.
      await expect(page.getByText(/Queda una deuda de/)).toBeVisible()
      await page.getByRole('button', { name: 'Completar con deuda', exact: true }).click()

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

      // "Completar turno" ya no cobra: sin líneas de cobro, no hay cash_flow.
      const { data: flows, error: flowsError } = await supabase
        .from('cash_flows')
        .select('type, category, amount, method')
        .eq('booking_id', bookingId)

      expect(flowsError).toBeNull()
      expect(flows).toEqual([])

      await writeEvidence('TG-HP-211', {
        status: 'pass',
        bookingId,
        finalStatus: row?.status,
        cashFlows: flows,
        notes:
          'Completado vía CompleteBookingDialog ("Completar con deuda"), sin cobro — la deuda queda pendiente para "Cobros de turno".',
      })
    } finally {
      await context.close()
      await cleanupBookingsByIds(supabase, [bookingId])
    }
  })
})
