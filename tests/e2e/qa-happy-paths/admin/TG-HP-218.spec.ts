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
import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures'
import { dateIsoArtIn, E2E_TENANT_ID, E2E_COURT_ID } from '../../_helpers/booking-seed'
import { runSql, writeEvidence } from '../_qa/evidence'
import { suppressPushPrompt } from '../_qa/session'

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Próximo lunes a partir de mañana (ART). "Empieza el" solo habilita el día semanal elegido. */
function nextMondayIsoArt(): string {
  for (let i = 1; i <= 7; i++) {
    const iso = dateIsoArtIn(i)
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === 1) return iso
  }
  throw new Error('unreachable: 7 días seguidos sin lunes')
}

/**
 * Los campos de cancha/día/horas son `Combobox` (role=combobox + listbox), no
 * <select>. Mismo patrón que tests/e2e/abonados-crud.spec.ts: la opción se
 * scopea al `#<fieldId>-listbox` porque Radix deja montado el popover anterior
 * durante la animación de salida y "Hora inicio"/"Hora fin" comparten opciones.
 */
async function selectCombobox(page: Page, fieldId: string, optionName: string): Promise<void> {
  await page.locator(`#${fieldId}`).click()
  await page
    .locator(`#${fieldId}-listbox`)
    .getByRole('option', { name: optionName, exact: true })
    .click()
}

/** "Empieza el" es un DatePicker con calendario propio (ver abonados-crud.spec.ts `pickDate`). */
async function pickDate(page: Page, dateStr: string): Promise<void> {
  const [y, m, d] = dateStr.split('-').map(Number)
  const targetLabel = `${MONTH_NAMES[m! - 1]} de ${y}`
  await page.locator('#startsOn').click()
  const panel = page.getByRole('dialog', { name: 'Elegir fecha' })
  await expect(panel).toBeVisible()
  const nextMonthBtn = panel.getByRole('button', { name: 'Mes siguiente' })
  for (let i = 0; i < 24; i++) {
    if (await panel.getByText(targetLabel, { exact: true }).isVisible()) break
    await nextMonthBtn.click()
  }
  await panel.getByRole('button', { name: String(d), exact: true }).click()
}

test.describe('TG-HP-218 — crear abonado', () => {
  test('admin crea un abonado (turno fijo Lunes 18-19) → abonados + bookings generados', async ({
    browser,
    adminStorageState,
  }) => {
    const startsOn = nextMondayIsoArt()
    const contactName = `QA Abonado ${Date.now()}`
    const pricePerSessionPesos = 25_000 // → 2.500.000 centavos

    let abonadoId: string | null = null

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/abonados/nuevo')
      await expect(page.getByRole('heading', { name: 'Nuevo turno fijo' })).toBeVisible({
        timeout: 15_000,
      })

      await selectCombobox(page, 'courtId', 'Cancha E2E 1')
      await selectCombobox(page, 'dayOfWeek', 'Lunes')
      await pickDate(page, startsOn)
      await selectCombobox(page, 'timeStart', '18:00')
      await selectCombobox(page, 'timeEnd', '19:00')
      await page.locator('#contactName').fill(contactName)
      // #contactPhone = input tel visible del PhoneInput (el name=contactPhone es hidden).
      await page.locator('#contactPhone').fill('1123456789')
      await page.getByLabel('Precio por turno (pesos)').fill(String(pricePerSessionPesos))
      // Método de pago: no hay campo en el form; la action defaultea a 'cash'.

      await page.getByRole('button', { name: 'Continuar' }).click()

      await expect(page.getByRole('heading', { name: 'Vista previa de fechas' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/^\d+ turnos? libres?$/)).toBeVisible()

      const createButton = page.getByRole('button', { name: 'Confirmar y Crear Abonado' })
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
