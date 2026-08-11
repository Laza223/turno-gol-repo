import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { makeServiceClient, E2E_TENANT_ID, E2E_COURT_ID } from '../../_helpers/player-seed'
import { cleanupBookingsByIds, tomorrowDateIsoArt } from '../../_helpers/booking-seed'

/**
 * TG-HP-103 — Reserva online SIN seña (tenant Demo) → confirma instantáneo.
 * Rol: Jugador logueado (playerStorageState). Prereq: tenant Demo
 * (requires_deposit=false), slot libre cancha ...010, 13:00 mañana.
 * Evidence anchors: reservar/page.tsx:67-70,75-81,101,118-131,
 * ConfirmBookingButton.tsx:8-16,39-42, reservar/actions.ts:92,138,169-170,
 * booking.service.ts:415-437, BookingSuccessCard.tsx:52-54,60-63.
 */

const TENANT_SLUG = 'e2e-complejo-demo'
const TIME = '13:00'

function reservarUrl(date: string): string {
  return `/${TENANT_SLUG}/reservar?court=${E2E_COURT_ID}&date=${date}&time=${TIME}&dur=60`
}

test.describe('TG-HP-103 — Reserva online SIN seña → confirma instantáneo', () => {
  test('confirma de una, sin pasar por MP, y liquida en el complejo', async ({
    browser,
    playerStorageState,
  }) => {
    const date = tomorrowDateIsoArt()
    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()
    const collectedIds: string[] = []

    try {
      await page.goto(reservarUrl(date))
      await expect(page.getByRole('heading', { name: 'Confirmá tu reserva' })).toBeVisible()

      // Sin seña (depositAmount=0): payMethods presenciales, botón "Confirmar reserva".
      const confirmBtn = page.getByRole('button', { name: 'Confirmar reserva' })
      await expect(confirmBtn).toBeVisible()
      await expect(confirmBtn).toBeEnabled()

      // Anti-doble-submit: disabled={pending} en Inner (ConfirmBookingButton.tsx:8-16) —
      // no se asertea el estado transitorio "Procesando…" en vivo: es un redirect() de
      // servidor real, y el resto de la suite (booking-flow.spec.ts) tampoco lo intenta
      // por lo rápido/inestable que es en dev. El comportamiento queda citado por código.
      await confirmBtn.click()

      // Debe redirigir directo a /exito, NUNCA pasar por /mock-mp (sin seña = sin MP).
      await expect(page).toHaveURL(/\/reserva\/[0-9a-f-]{36}\/exito/, { timeout: 15_000 })
      expect(page.url()).not.toContain('/mock-mp/')

      const m = /\/reserva\/([0-9a-f-]{36})\/exito/.exec(page.url())
      const bookingId = m?.[1]
      if (!bookingId) throw new Error('No se pudo extraer bookingId de la URL /exito')
      collectedIds.push(bookingId)

      await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/pagás.*al llegar al complejo/i)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Ver mis reservas' })).toBeVisible()

      // DB: estado EXACTO — confirmed de una, sin seña, montos en centavos.
      const sb = makeServiceClient()
      const { data: booking, error } = await sb
        .from('bookings')
        .select(
          'status, deposit_status, deposit_amount, price_snapshot, tenant_id, court_id, player_id',
        )
        .eq('id', bookingId)
        .single()

      expect(error).toBeNull()
      expect(booking?.status).toBe('confirmed')
      expect(booking?.deposit_status).toBe('not_required')
      expect(booking?.deposit_amount).toBe(0)
      expect(booking?.price_snapshot).toBe(10000) // 100 ARS en centavos (pricing rule del seed)
      expect(booking?.tenant_id).toBe(E2E_TENANT_ID)
      expect(booking?.court_id).toBe(E2E_COURT_ID)

      await writeEvidence('TG-HP-103', {
        status: 'pass',
        bookingId,
        db: booking,
        finalUrl: page.url(),
        notes:
          'Tenant Demo requires_deposit=false → createOnlineBooking inserta status=confirmed de una (booking.service.ts:436 withDeposit=false); nunca pisa /mock-mp/checkout.',
      })
    } finally {
      await ctx.close()
      if (collectedIds.length > 0) {
        await cleanupBookingsByIds(makeServiceClient(), collectedIds)
      }
    }
  })
})
