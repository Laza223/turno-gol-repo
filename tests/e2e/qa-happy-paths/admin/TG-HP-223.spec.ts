import { test, expect } from '../../fixtures'
import { writeEvidence, runSql, jsonParam } from '../_qa/evidence'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-223 — Settings horarios `/settings/horarios` (+ día operativo
 * `closes_next_day`).
 * Rol: solo Admin — `requireAdminStaffAction` (`actions.ts:19`).
 * Prereq: ninguno especial. Mock data (manual): horario general 18:00–23:00 +
 * Sábado personalizado 20:00–02:00 + "Cierra después de medianoche" ON.
 * El seed (`scripts/seed-e2e.ts`) deja Sáb/Dom en modo 'custom' (09:00–23:00,
 * distinto del general lun-vie 08:00–23:00) — sus inputs de horario propio ya
 * están renderizados sin necesitar click en "Personalizar".
 * NO-PLATA: tenant Demo es fixture compartida — se captura `opening_hours` +
 * `closes_next_day` original y se restaura en `finally`.
 * Evidence anchors: src/app/(admin)/settings/horarios/actions.ts:1-44,
 *   src/app/(admin)/settings/horarios/HorariosForm.tsx:1-65,
 *   src/components/schedule/ScheduleFields.tsx:1-229.
 */
test.describe('TG-HP-223 — Settings horarios: general + Sábado madrugada + día operativo', () => {
  test('admin guarda horarios con día operativo → persisten en tenants.opening_hours/closes_next_day', async ({
    browser,
    adminStorageState,
  }) => {
    const [before] = await runSql<{
      opening_hours: Record<string, unknown>
      closes_next_day: boolean
    }>('SELECT opening_hours, closes_next_day FROM tenants WHERE id = $1', [E2E_TENANT_ID])
    const originalOpeningHours = before?.opening_hours
    const originalClosesNextDay = before?.closes_next_day
    if (!originalOpeningHours)
      throw new Error('No se pudo leer tenants.opening_hours antes del test')

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/settings/horarios')
      await expect(page.getByRole('heading', { name: 'Horarios de apertura' })).toBeVisible({
        timeout: 15_000,
      })

      // Retry de la secuencia completa (fill + check + submit + verificación en
      // DB): mismo dev-only HMR race que TG-HP-222 — el PRIMER hit a esta ruta
      // puede recompilar (Turbopack + Fast Refresh) a mitad de la interacción y
      // remontar el form, perdiendo el estado justo antes del submit. `.fill()`
      // y `.check()` son idempotentes, así que repetir la secuencia es seguro y
      // no relaja la aserción final de DB.
      let row:
        | {
            opening_hours: Record<string, { open: string; close: string; closed?: boolean }>
            closes_next_day: boolean
          }
        | undefined
      await expect(async () => {
        // Horario general: 18:00–23:00 (aplica a lun-vie, que arrancan en modo 'general').
        await page.locator('#general-open').fill('18:00')
        await page.locator('#general-close').fill('23:00')

        // Sábado ya está en modo 'custom' (09:00–23:00 en el seed, distinto del general) —
        // sus inputs "Horario propio" ya están visibles, sin pasar por "Personalizar".
        // aria-label exacto por día (ScheduleFields.tsx:193,201) — no ambiguo con "Días
        // cerrados" (esa lista no tiene inputs, solo texto con el nombre del día en minúscula).
        await page.getByLabel('Sábado: abre').fill('20:00')
        await page.getByLabel('Sábado: cierra').fill('02:00')

        // Día operativo: cierra después de medianoche (habilita el 20:00→02:00 de arriba).
        await page.getByRole('checkbox', { name: /Cierra después de medianoche/ }).check()

        await page.getByRole('button', { name: 'Guardar horarios' }).click()
        await expect(page.getByText('Horarios guardados.')).toBeVisible({ timeout: 10_000 })

        // DB layer.
        ;[row] = await runSql<{
          opening_hours: Record<string, { open: string; close: string; closed?: boolean }>
          closes_next_day: boolean
        }>('SELECT opening_hours, closes_next_day FROM tenants WHERE id = $1', [E2E_TENANT_ID])

        expect(row?.closes_next_day).toBe(true)
        expect(row?.opening_hours.mon?.open).toBe('18:00')
        expect(row?.opening_hours.mon?.close).toBe('23:00')
        expect(row?.opening_hours.fri?.open).toBe('18:00')
        expect(row?.opening_hours.fri?.close).toBe('23:00')
        expect(row?.opening_hours.sat?.open).toBe('20:00')
        expect(row?.opening_hours.sat?.close).toBe('02:00')
      }).toPass({ timeout: 30_000 })

      // UI-sin-reload: los valores editados siguen en pantalla sin navegación.
      await expect(page.locator('#general-open')).toHaveValue('18:00')
      await expect(page.getByLabel('Sábado: cierra')).toHaveValue('02:00')

      await writeEvidence('TG-HP-223', {
        status: 'pass',
        dbRow: row,
        dbWrites:
          'tenants.opening_hours (jsonb 7 días) + tenants.closes_next_day (columna propia, actions.ts:31)',
      })
    } finally {
      await context.close()
      // jsonParam(), NO JSON.stringify()+::jsonb — doble-codifica el objeto
      // (ver TG-HP-215, mismo bug de postgres.js confirmado con jsonb_typeof()).
      await runSql(
        'UPDATE tenants SET opening_hours = $1, closes_next_day = $2, updated_at = now() WHERE id = $3',
        [jsonParam(originalOpeningHours), originalClosesNextDay ?? false, E2E_TENANT_ID],
      )
    }
  })
})
