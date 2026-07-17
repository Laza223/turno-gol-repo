/**
 * TG-HP-211 — Marcar COMPLETADA (jugada).
 * Rol: Admin/manager (requireOperatorStaff). Prereq: reserva confirmed cuyo
 * horario de FIN ya pasó (server valida BookingNotYetEndedError si no).
 * No-plata: se limpia el booking en finally.
 * Evidencia: src/app/(admin)/reservas/actions.ts:164-197 (completeBookingAction),
 * src/app/(admin)/reservas/[id]/BookingActions.tsx:141-151.
 * NOTA (GAPS #4 del manual): este botón NO dispara toast — solo router.refresh()
 * silencioso. La sección de acciones desaparece porque status ya no es 'confirmed'.
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

      // Sin toast (asimetría real del código, ver GAPS #4) — el fin de la
      // acción se observa por el cambio de estado + la desaparición del botón.
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

      await writeEvidence('TG-HP-211', {
        status: 'pass',
        bookingId,
        finalStatus: row?.status,
        notes: 'Sin toast de éxito (asimetría real del código, BookingActions.tsx:88-95).',
      })
    } finally {
      await context.close()
      await cleanupBookingsByIds(supabase, [bookingId])
    }
  })
})
