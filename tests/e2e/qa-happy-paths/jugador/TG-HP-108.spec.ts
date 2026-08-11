import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { insertPlayerBooking, makeServiceClient } from '../../_helpers/player-seed'
import { tomorrowDateIsoArt } from '../../_helpers/booking-seed'

/**
 * TG-HP-108 — Cancelar reserva dentro de plazo → libera slot.
 * Rol: Jugador logueado. Prereq: booking propio confirmed con seña PAGADA,
 * starts_at bien más allá de cancellation_policy.hours_before (12h en el seed)
 * para que el resultado sea reembolso. Tenant Seña, slot 19:00 mañana.
 *
 * CASO DE PLATA: la fila de bookings queda VIVA a propósito (cancelada, no
 * eliminada) para que los verificadores la inspeccionen.
 *
 * Evidence anchors: CancelBookingButton.tsx:42-46,61-68,72-78,83-97,99-111,
 * confirm-dialog.tsx:36-71,108-124, mis-reservas/actions.ts:41-157,
 * booking.cancellation.ts:132-252, MisReservasView.tsx:263-273.
 */

const SENA_TENANT_ID = '00000000-0000-4000-8000-000000000030'
const SENA_COURT_ID = '00000000-0000-4000-8000-000000000031'
const TIME_START = '19:00'
const TIME_END = '20:00'
const DEPOSIT_AMOUNT = 5000 // 50% de 10000 = $50

test.describe('TG-HP-108 — Cancelar reserva dentro de plazo → reembolso', () => {
  test('cancela desde el dialog → canceled_refunded + libera el slot', async ({
    browser,
    playerStorageState,
  }) => {
    const sb = makeServiceClient()
    const date = tomorrowDateIsoArt()
    const bookingId = await insertPlayerBooking(sb, {
      date,
      timeStart: TIME_START,
      timeEnd: TIME_END,
      tenantId: SENA_TENANT_ID,
      courtId: SENA_COURT_ID,
      status: 'confirmed',
      depositStatus: 'paid',
      depositAmount: DEPOSIT_AMOUNT,
    })

    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto('/mis-reservas')
      await expect(page.getByRole('heading', { name: 'Mis reservas', level: 1 })).toBeVisible()

      // Escopamos a la card de ESTE booking por el rango horario (puede haber
      // otras reservas vivas de otros casos de plata en Próximos).
      const card = page.locator('li').filter({ hasText: `${TIME_START}–${TIME_END}` })
      await expect(card).toBeVisible()
      await expect(card.getByText('Confirmado')).toBeVisible()

      await card.getByRole('button', { name: 'Cancelar' }).click()

      // Dialog: título + consecuencia concreta (seña pagada → "Se te devuelve la seña de $50.")
      await expect(page.getByRole('heading', { name: '¿Cancelar esta reserva?' })).toBeVisible()
      await expect(page.getByText(/se te devuelve la seña de \$\s?50/i)).toBeVisible()

      await page.locator('#cancel-reason').fill('QA TG-HP-108: cancelación con reembolso')

      const confirmBtn = page.getByRole('button', { name: 'Sí, cancelar' })
      await confirmBtn.click()
      // Anti-doble-submit: disabled={isPending} en confirm-dialog.tsx:41,119 (useTransition).
      // Feedback: sin toast — el dialog se cierra y router.refresh() reactualiza la lista.

      await expect(page.getByRole('heading', { name: '¿Cancelar esta reserva?' })).not.toBeVisible({
        timeout: 8_000,
      })

      // UI-sin-reload: revalidatePath + router.refresh(), sin recarga manual.
      await expect(card.getByText('Cancelado (con reembolso)')).toBeVisible({ timeout: 8_000 })
      await expect(card.getByRole('button', { name: 'Cancelar' })).not.toBeVisible()

      const { data: row, error } = await sb
        .from('bookings')
        .select('status, canceled_reason, canceled_by, canceled_at, deposit_status, deposit_amount')
        .eq('id', bookingId)
        .single()

      expect(error).toBeNull()
      expect(row?.status).toBe('canceled_refunded')
      expect(row?.canceled_by).toBe('player')
      expect(row?.canceled_reason).toBe('QA TG-HP-108: cancelación con reembolso')
      expect(row?.canceled_at).toBeTruthy()
      expect(row?.deposit_status).toBe('refunded')
      expect(row?.deposit_amount).toBe(DEPOSIT_AMOUNT)

      await writeEvidence('TG-HP-108', {
        status: 'pass',
        caso_de_plata: true,
        bookingId,
        db: row,
        finalUrl: page.url(),
        notes:
          'Caso de plata: fila NO limpiada a propósito (queda canceled_refunded). Insertada vía ' +
          'service client sin payment_id real, así que cancelByPlayer marca deposit_status=refunded ' +
          'a nivel DB sin invocar settleRefund/MP real (mismo patrón que player-bookings.spec.ts).',
      })
    } finally {
      await ctx.close()
      // Caso de plata: NO se limpia bookingId.
    }
  })
})
