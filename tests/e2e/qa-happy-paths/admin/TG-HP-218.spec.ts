/**
 * TG-HP-218 — Abonados `/abonados/nuevo`: crear abonado.
 * Rol: Admin/manager (requireOperatorStaff). Prereq: al menos 1 cancha activa
 * (fixture: Cancha E2E 1). No hay saldo a favor ni monthlyPrice — solo
 * price_per_session (CLAUDE.md, abonados sin saldo a favor).
 * No-plata: se limpia abonado + bookings generados en finally.
 * Evidencia: src/app/(admin)/abonados/nuevo/AbonadoForm.tsx:123-274,
 * src/app/(admin)/abonados/nuevo/actions.ts:1-158,
 * src/modules/abonados/abonado.service.ts:141-212.
 */
import { test, expect } from '../../fixtures'
import { tomorrowDateIsoArt, E2E_TENANT_ID, E2E_COURT_ID } from '../../_helpers/booking-seed'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

test.describe('TG-HP-218 — crear abonado', () => {
  test('admin crea un abonado (turno fijo Lunes 18-19) → abonados + bookings generados', async ({
    browser,
    adminStorageState,
  }) => {
    const startsOn = tomorrowDateIsoArt()
    const contactName = `QA Abonado ${Date.now()}`
    const pricePerSessionPesos = 25_000 // → 2.500.000 centavos

    let abonadoId: string | null = null

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/abonados/nuevo')
      await expect(page.getByRole('heading', { name: 'Nuevo abonado' })).toBeVisible({
        timeout: 15_000,
      })

      await page.getByLabel('Cancha').selectOption({ label: 'Cancha E2E 1' })
      await page.getByLabel('Día de la semana').selectOption({ label: 'Lunes' })
      await page.getByLabel('Empieza el').fill(startsOn)
      await page.getByLabel('Hora de inicio').fill('18:00')
      await page.getByLabel('Hora de fin').fill('19:00')
      await page.getByLabel('Nombre y apellido').fill(contactName)
      await page.getByLabel('Teléfono').fill('1123456789')
      await page.getByLabel('Precio por turno (en pesos)').fill(String(pricePerSessionPesos))
      // Método de pago se deja en el default (Efectivo, mock data del manual).

      await page.getByRole('button', { name: 'Ver fechas del turno' }).click()

      await expect(page.getByRole('heading', { name: 'Fechas del turno fijo' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/Se crearán \d+ turnos?\./)).toBeVisible()

      const createButton = page.getByRole('button', { name: 'Crear abonado' })
      await expect(createButton).toBeEnabled()
      await createButton.click()

      // Sin toast en este flujo (manual: el éxito se comunica por el redirect
      // server-side) — el fin de la acción se observa por la navegación a /abonados.
      await page.waitForURL(/\/abonados$/, { timeout: 15_000 })

      // ── DB assertion ──────────────────────────────────────────────────────
      const abonadoRows = await runSql<{
        id: string
        court_id: string
        contact_name: string
        day_of_week: number
        time_start: string
        time_end: string
        price_per_session: number
        status: string
        payment_method: string
        player_id: string | null
      }>(
        `SELECT id, court_id, contact_name, day_of_week, time_start, time_end,
                price_per_session, status, payment_method, player_id
         FROM abonados
         WHERE tenant_id = $1 AND contact_name = $2
         ORDER BY created_at DESC LIMIT 1`,
        [E2E_TENANT_ID, contactName],
      )

      expect(abonadoRows).toHaveLength(1)
      const abonado = abonadoRows[0]!
      abonadoId = abonado.id
      expect(abonado.court_id).toBe(E2E_COURT_ID)
      expect(abonado.day_of_week).toBe(1) // Lunes
      expect(abonado.time_start.slice(0, 5)).toBe('18:00')
      expect(abonado.time_end.slice(0, 5)).toBe('19:00')
      expect(abonado.price_per_session).toBe(pricePerSessionPesos * 100)
      expect(abonado.status).toBe('active')
      expect(abonado.payment_method).toBe('cash')
      expect(abonado.player_id).toBeNull() // sin jugador vinculado (walk-in)

      const bookingRows = await runSql<{
        id: string
        type: string
        status: string
        deposit_status: string
        price_snapshot: number
      }>(
        `SELECT id, type, status, deposit_status, price_snapshot
         FROM bookings WHERE abonado_id = $1`,
        [abonado.id],
      )
      expect(bookingRows.length).toBeGreaterThan(0)
      for (const b of bookingRows) {
        expect(b.type).toBe('fixed')
        expect(b.status).toBe('confirmed')
        expect(b.deposit_status).toBe('not_required')
        expect(b.price_snapshot).toBe(pricePerSessionPesos * 100)
      }

      await writeEvidence('TG-HP-218', {
        status: 'pass',
        abonado,
        bookingsGenerated: bookingRows.length,
        bookingIds: bookingRows.map((b) => b.id),
      })
    } finally {
      await context.close()
      if (abonadoId) {
        await runSql(`DELETE FROM bookings WHERE abonado_id = $1`, [abonadoId])
        await runSql(`DELETE FROM abonados WHERE id = $1`, [abonadoId])
      }
    }
  })
})
