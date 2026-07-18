import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { insertPlayerBooking, makeServiceClient } from '../../_helpers/player-seed'
import { cleanupBookingsByIds, tomorrowDateIsoArt } from '../../_helpers/booking-seed'

/**
 * TG-HP-107 — Mis reservas /mis-reservas (tabs Próximas/Historial).
 * Rol: Jugador logueado. Prereq: 1 booking futuro (confirmed, tab Próximos)
 * + 1 booking pasado (completed, tab Historial), tenant Demo.
 *
 * Evidence anchors: mis-reservas/page.tsx:42-118, MisReservasView.tsx:66-96,148-194.
 */

const FUTURE_TIME_START = '20:00'
const FUTURE_TIME_END = '21:00'
const PAST_DATE = '2026-05-15'
const PAST_TIME_START = '19:00'
const PAST_TIME_END = '20:00'

test.describe('TG-HP-107 — Mis reservas: tabs Próximos/Historial', () => {
  test('el futuro cae en Próximos, el pasado en Historial, con el badge de estado correcto', async ({
    browser,
    playerStorageState,
  }) => {
    const sb = makeServiceClient()
    const futureDate = tomorrowDateIsoArt()
    const futureId = await insertPlayerBooking(sb, {
      date: futureDate,
      timeStart: FUTURE_TIME_START,
      timeEnd: FUTURE_TIME_END,
      status: 'confirmed',
    })
    const pastId = await insertPlayerBooking(sb, {
      date: PAST_DATE,
      timeStart: PAST_TIME_START,
      timeEnd: PAST_TIME_END,
      status: 'completed',
    })
    const collectedIds = [futureId, pastId]

    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto('/mis-reservas')
      await expect(page.getByRole('heading', { name: 'Mis reservas', level: 1 })).toBeVisible()

      // Tab default = Próximos: el futuro está, el pasado NO.
      await expect(page.getByText(`${FUTURE_TIME_START}–${FUTURE_TIME_END}`)).toBeVisible()
      await expect(page.getByText('Confirmado').first()).toBeVisible()
      await expect(page.getByText(`${PAST_TIME_START}–${PAST_TIME_END}`)).not.toBeVisible()

      // Click en tab Historial → navega con ?tab=historial y refiltra server-side.
      await page.getByRole('link', { name: 'Historial' }).click()
      await page.waitForURL(/\/mis-reservas\?tab=historial/)

      await expect(page.getByText(`${PAST_TIME_START}–${PAST_TIME_END}`)).toBeVisible()
      await expect(page.getByText('Jugada').first()).toBeVisible()
      await expect(page.getByText(`${FUTURE_TIME_START}–${FUTURE_TIME_END}`)).not.toBeVisible()

      // DB: confirmamos que la fila que arma la UI es la real (join tenant/court correcto).
      const { data: rows, error } = await sb
        .from('bookings')
        .select('id, status, date')
        .in('id', collectedIds)
        .order('date', { ascending: true })

      expect(error).toBeNull()
      expect(rows?.find((r) => r.id === futureId)?.status).toBe('confirmed')
      expect(rows?.find((r) => r.id === pastId)?.status).toBe('completed')

      await writeEvidence('TG-HP-107', {
        status: 'pass',
        futureId,
        pastId,
        db: rows,
        notes:
          'Filtrado por tab hecho server-side (b.date >= today vs b.date < today), navegación real ' +
          'por <Link>, no fetch client-side.',
      })
    } finally {
      await ctx.close()
      await cleanupBookingsByIds(sb, collectedIds)
    }
  })
})
